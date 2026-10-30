import asyncio
import json
import secrets
from urllib.parse import urlencode
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import cashfree_client, invoice, notify, razorpay_client
from ..auth import current_user
from ..cashfree_client import CashfreeError
from ..config import active_gateway, payments_enabled, settings
from ..db import get_conn
from ..razorpay_client import RazorpayError
from .bookings import release_expired_holds

router = APIRouter(prefix="/payments", tags=["payments"])


class VerifyIn(BaseModel):
    # These three names are exactly what Razorpay's checkout hands back after a payment.
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def set_commission(cur, payment_id) -> None:
    """Hill Booker's cut of a payment: commission_percent of the whole booking price (not of the advance), never more
    than the amount paid. With a 30% advance and 8% commission, 8 points go to Hill Booker and 22 to the host."""
    cur.execute(
        """UPDATE payments SET commission = LEAST(amount, ROUND(COALESCE(
               (SELECT total_amount FROM bookings WHERE id = payments.booking_id),
               (SELECT total_amount FROM vehicle_bookings WHERE id = payments.vehicle_booking_id), amount) * %s / 100, 2))
           WHERE id = %s""",
        (Decimal(str(settings.commission_percent)), payment_id),
    )


def paise(amount: Decimal) -> int:
    return int((Decimal(amount) * 100).quantize(Decimal(1)))


def refund_payment(payment_row_id: str, provider_payment_id: str, amount: Decimal, reason: str) -> str:
    """Refund in full or part. Returns 'refunded' or 'pending' (the gateway refused; the note says why).
    Called after the database transaction has ended, so a slow gateway never holds row locks."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT provider, provider_order_id FROM payments WHERE id = %s", (payment_row_id,))
        pay = cur.fetchone()
    cashfree = bool(pay) and pay["provider"] == "cashfree"
    try:
        if cashfree:
            r = cashfree_client.refund(pay["provider_order_id"], "rf" + str(payment_row_id).replace("-", ""), amount, reason)
            refund_ref = str(r.get("cf_refund_id") or r.get("refund_id") or "")
        else:
            r = razorpay_client.refund(provider_payment_id, paise(amount), {"reason": reason})
            refund_ref = r.get("id")
    except (RazorpayError, CashfreeError) as e:
        where = "Cashfree" if cashfree else "Razorpay"
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("UPDATE payments SET note = %s, updated_at = now() WHERE id = %s", (f"Refund failed: {e}. Refund by hand in the {where} dashboard.", payment_row_id))
        return "pending"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE payments SET status = 'refunded', refund_id = %s, refunded_amount = %s, note = %s, commission = 0, updated_at = now()
               WHERE id = %s""",
            (refund_ref, amount, reason, payment_row_id),
        )
    return "refunded"


def settle_vehicle(order_id: str, payment_id: str, user_id: str | None = None) -> dict:
    """Same job as settle() for a vehicle booking. A late payment is accepted only while the vehicle is still
    free for those dates (we re-check, ignoring this booking itself); otherwise it is refunded in full."""
    refund_args = None
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.vehicle_booking_id, p.status, p.amount, b.user_id, b.status AS booking_status,
                      b.vehicle_id, b.start_date, b.end_date, b.count, v.quantity
               FROM payments p
               JOIN vehicle_bookings b ON b.id = p.vehicle_booking_id
               JOIN vehicles v ON v.id = b.vehicle_id
               WHERE p.provider_order_id = %s FOR UPDATE OF p, b""",
            (order_id,),
        )
        row = cur.fetchone()
        if not row or (user_id and str(row["user_id"]) != user_id):
            raise HTTPException(404, "Payment not found")
        booking_id = str(row["vehicle_booking_id"])
        if row["status"] in ("paid", "refunded"):
            return {"booking_id": booking_id, "status": "confirmed" if row["status"] == "paid" else "refunded", "already_done": True}

        cur.execute("UPDATE payments SET status = 'paid', provider_payment_id = %s, updated_at = now() WHERE id = %s", (payment_id, row["id"]))
        set_commission(cur, row["id"])
        outcome = "confirmed"
        if row["booking_status"] in ("held", "expired"):
            cur.execute("SELECT id FROM vehicles WHERE id = %s FOR UPDATE", (row["vehicle_id"],))  # take turns with new bookings
            from .vehicles import max_used

            used = max_used(cur, str(row["vehicle_id"]), row["start_date"], row["end_date"], exclude=booking_id)
            if row["quantity"] - used >= row["count"]:
                cur.execute("UPDATE vehicle_bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (booking_id,))
            else:
                outcome = "refunded"
                refund_args = (str(row["id"]), payment_id, row["amount"], "Vehicle was taken before payment arrived")
        elif row["booking_status"] == "cancelled":
            outcome = "refunded"
            refund_args = (str(row["id"]), payment_id, row["amount"], "Booking was released before payment arrived")
    if refund_args:
        refund_payment(*refund_args)
    if outcome == "confirmed":
        notify.host_in_background("vehicle", booking_id)
    return {"booking_id": booking_id, "status": outcome}


def settle(order_id: str, payment_id: str, user_id: str | None = None) -> dict:
    """Record a successful payment and confirm the booking. Safe to call twice (the browser and the webhook
    both report the same payment). If the guest paid after the hold ran out, the rooms are taken again when
    still free; otherwise the payment is refunded in full."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT vehicle_booking_id FROM payments WHERE provider_order_id = %s", (order_id,))
        peek = cur.fetchone()
    if peek and peek["vehicle_booking_id"]:
        return settle_vehicle(order_id, payment_id, user_id)

    refund_args = None
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.booking_id, p.status, p.amount, b.user_id, b.status AS booking_status,
                      b.room_type_id, b.check_in, b.check_out, b.rooms
               FROM payments p JOIN bookings b ON b.id = p.booking_id
               WHERE p.provider_order_id = %s FOR UPDATE OF p, b""",
            (order_id,),
        )
        row = cur.fetchone()
        if not row or (user_id and str(row["user_id"]) != user_id):
            raise HTTPException(404, "Payment not found")
        booking_id = str(row["booking_id"])

        if row["status"] in ("paid", "refunded"):
            return {"booking_id": booking_id, "status": "confirmed" if row["status"] == "paid" else "refunded", "already_done": True}

        cur.execute("UPDATE payments SET status = 'paid', provider_payment_id = %s, updated_at = now() WHERE id = %s", (payment_id, row["id"]))
        set_commission(cur, row["id"])
        outcome = "confirmed"
        if row["booking_status"] == "held":
            cur.execute("UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (booking_id,))
        elif row["booking_status"] == "expired":
            # The hold ran out while the guest was paying. Take the rooms again if nobody else has.
            nights = (row["check_out"] - row["check_in"]).days
            cur.execute(
                """SELECT available FROM room_inventory
                   WHERE room_type_id = %s AND day >= %s AND day < %s ORDER BY day FOR UPDATE""",
                (row["room_type_id"], row["check_in"], row["check_out"]),
            )
            nights_rows = cur.fetchall()
            if len(nights_rows) == nights and all(n["available"] >= row["rooms"] for n in nights_rows):
                cur.execute(
                    """UPDATE room_inventory SET available = available - %s
                       WHERE room_type_id = %s AND day >= %s AND day < %s""",
                    (row["rooms"], row["room_type_id"], row["check_in"], row["check_out"]),
                )
                cur.execute("UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (booking_id,))
            else:
                outcome = "refunded"
                refund_args = (str(row["id"]), payment_id, row["amount"], "Rooms were taken before payment arrived")
        elif row["booking_status"] == "cancelled":
            outcome = "refunded"
            refund_args = (str(row["id"]), payment_id, row["amount"], "Booking was released before payment arrived")

    if refund_args:
        refund_payment(*refund_args)
    if outcome == "confirmed":
        invoice.email_in_background(booking_id)  # after the commit, so the mail reads the paid booking
        notify.host_in_background("stay", booking_id)
        notify.guest_invoice_in_background(booking_id)
        notify.host_copy_in_background(booking_id)
    return {"booking_id": booking_id, "status": outcome}


@router.get("/config")
def config():
    gw = active_gateway()
    return {"enabled": bool(gw), "gateway": gw or None, "key_id": settings.razorpay_key_id if gw == "razorpay" else None}


def _customer(cur, user_id: str) -> dict:
    cur.execute("SELECT name, email, phone FROM users WHERE id = %s", (user_id,))
    return cur.fetchone() or {}


def _prefill(c: dict) -> dict:
    """The guest's details, so the payment window does not ask for a mobile number again."""
    digits = "".join(ch for ch in str(c.get("phone") or "") if ch.isdigit())
    contact = "+91" + digits[-10:] if len(digits) >= 10 else ""
    return {"name": c.get("name") or "", "email": c.get("email") or "", "contact": contact}


def _order_reply(provider: str, order_id: str, amount, session_id: str | None = None, prefill: dict | None = None) -> dict:
    """What the website or app needs to open the payment window for this order."""
    if provider == "cashfree":
        if not session_id:
            try:
                session_id = cashfree_client.get_order(order_id).get("payment_session_id")
            except CashfreeError as e:
                raise HTTPException(502, f"Payment could not be started: {e}")
        mode = "production" if settings.cashfree_env.strip().lower() == "production" else "sandbox"
        q = urlencode({"session": session_id, "order_id": order_id, "mode": mode})
        return {"gateway": "cashfree", "order_id": order_id, "amount": paise(amount), "currency": "INR", "checkout_url": f"{settings.site_url.rstrip('/')}/pay/cashfree?{q}"}
    return {"gateway": "razorpay", "order_id": order_id, "amount": paise(amount), "currency": "INR", "key_id": settings.razorpay_key_id, "prefill": prefill or {}}


def _start_order(cur, *, vehicle: bool, booking_id: str, user_id: str, amount, description: str) -> dict:
    """Create the gateway order and our payments row, or return the open one. Never makes a second open order."""
    col = "vehicle_booking_id" if vehicle else "booking_id"
    cur.execute(f"SELECT provider, provider_order_id, amount FROM payments WHERE {col} = %s AND status = 'created'", (booking_id,))
    existing = cur.fetchone()
    if existing:
        return _order_reply(existing["provider"], existing["provider_order_id"], existing["amount"], prefill=_prefill(_customer(cur, user_id)))
    gw = active_gateway()
    if gw == "cashfree":
        order_id = ("hbv_" if vehicle else "hb_") + booking_id.replace("-", "") + "_" + secrets.token_hex(2)
        c = _customer(cur, user_id)
        return_url = f"{settings.site_url.rstrip('/')}/pay/cashfree?order_id={{order_id}}"
        try:
            order = cashfree_client.create_order(order_id, amount, user_id, c.get("name"), c.get("email"), c.get("phone"), return_url, description)
        except CashfreeError as e:
            raise HTTPException(502, f"Payment could not be started: {e}")
        cur.execute(f"INSERT INTO payments ({col}, provider, provider_order_id, amount) VALUES (%s, 'cashfree', %s, %s)", (booking_id, order_id, amount))
        return _order_reply("cashfree", order_id, amount, order.get("payment_session_id"))
    try:
        order = razorpay_client.create_order(paise(amount), receipt=booking_id, notes={col: booking_id})
    except RazorpayError as e:
        raise HTTPException(502, f"Payment could not be started: {e}")
    cur.execute(f"INSERT INTO payments ({col}, provider_order_id, amount) VALUES (%s, %s, %s)", (booking_id, order["id"], amount))
    return _order_reply("razorpay", order["id"], amount, prefill=_prefill(_customer(cur, user_id)))


@router.post("/bookings/{booking_id}/order")
def create_order(booking_id: str, user: dict = Depends(current_user)):
    """Start a payment for a held booking. Asking twice returns the same order, never a second one."""
    if not payments_enabled():
        raise HTTPException(503, "Online payments aren't switched on yet")
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_holds(cur)
        cur.execute("SELECT id, user_id, status, COALESCE(advance_amount, total_amount) AS pay_now FROM bookings WHERE id = %s FOR UPDATE", (booking_id,))
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] != "held":
            raise HTTPException(409, "Your hold ended, so this booking can't be paid. Search again" if b["status"] == "expired" else f"This booking is already {b['status']}")
        cur.execute("SELECT 1 FROM payments WHERE booking_id = %s AND provider = 'upi_direct' AND status = 'created'", (booking_id,))
        if cur.fetchone():
            raise HTTPException(409, "You already sent a UPI payment. Wait for the host to confirm it")
        return _start_order(cur, vehicle=False, booking_id=booking_id, user_id=user["id"], amount=b["pay_now"], description="Hill Booker stay advance")


@router.post("/vehicle-bookings/{booking_id}/order")
def create_vehicle_order(booking_id: str, user: dict = Depends(current_user)):
    """Start a payment for a held vehicle booking. Asking twice returns the same order."""
    if not payments_enabled():
        raise HTTPException(503, "Online payments aren't switched on yet")
    from .vehicles import release_expired_vehicle_holds

    with get_conn() as conn, conn.cursor() as cur:
        release_expired_vehicle_holds(cur)
        cur.execute("SELECT id, user_id, status, advance_amount FROM vehicle_bookings WHERE id = %s FOR UPDATE", (booking_id,))
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] != "held":
            raise HTTPException(409, "Your hold ended, so this booking can't be paid. Search again" if b["status"] == "expired" else f"This booking is already {b['status']}")
        cur.execute("SELECT 1 FROM payments WHERE vehicle_booking_id = %s AND provider = 'upi_direct' AND status = 'created'", (booking_id,))
        if cur.fetchone():
            raise HTTPException(409, "You already sent a UPI payment. Wait for the host to confirm it")
        return _start_order(cur, vehicle=True, booking_id=booking_id, user_id=user["id"], amount=b["advance_amount"], description="Hill Booker vehicle advance")


@router.post("/verify")
def verify(body: VerifyIn, user: dict = Depends(current_user)):
    """Called by the website or app right after Razorpay's checkout succeeds."""
    if not razorpay_client.valid_checkout_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(400, "We couldn't verify this payment. If money was taken, it will be refunded or confirmed shortly")
    return settle(body.razorpay_order_id, body.razorpay_payment_id, user_id=user["id"])


@router.post("/webhook")
async def webhook(request: Request):
    """Razorpay calls this when a payment is captured, even if the guest closed the browser first.
    Dashboard setup: Settings > Webhooks > URL https://YOUR-DOMAIN/payments/webhook, events payment.captured and order.paid,
    and the same secret as RAZORPAY_WEBHOOK_SECRET."""
    raw = await request.body()
    if not razorpay_client.valid_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(400, "Bad signature")
    try:
        event = json.loads(raw)
        if event.get("event") in ("payment.captured", "order.paid"):
            entity = event["payload"]["payment"]["entity"]
            await asyncio.to_thread(settle, entity["order_id"], entity["id"])
    except HTTPException:
        pass  # a payment we have no booking for: answer 200 so Razorpay stops retrying
    except (KeyError, ValueError, TypeError):
        pass  # an event shape we don't use
    return {"ok": True}


@router.get("/cashfree/confirm")
def cashfree_confirm(order_id: str):
    """Where the Cashfree payment page sends the guest back to. We ask Cashfree itself whether the order was paid,
    so nothing the browser says is trusted. Safe to call again and again."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT booking_id, vehicle_booking_id, status FROM payments WHERE provider = 'cashfree' AND provider_order_id = %s", (order_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Payment not found")
    kind = "vehicle" if row["vehicle_booking_id"] else "stay"
    booking_id = str(row["vehicle_booking_id"] or row["booking_id"])
    if row["status"] in ("paid", "refunded"):
        return {"status": "confirmed" if row["status"] == "paid" else "refunded", "kind": kind, "booking_id": booking_id}
    try:
        payment_id = cashfree_client.successful_payment_id(order_id)
    except CashfreeError as e:
        raise HTTPException(502, f"Couldn't check the payment with Cashfree: {e}")
    if not payment_id:
        return {"status": "pending", "kind": kind, "booking_id": booking_id}
    return {**settle(order_id, payment_id), "kind": kind, "booking_id": booking_id}


@router.post("/cashfree/webhook")
async def cashfree_webhook(request: Request):
    """Cashfree calls this when a payment succeeds, even if the guest closed the browser first.
    Dashboard setup: Developers > Webhooks > add https://api.hillbooker.com/payments/cashfree/webhook (payment success)."""
    raw = await request.body()
    if not cashfree_client.valid_webhook_signature(raw, request.headers.get("x-webhook-timestamp", ""), request.headers.get("x-webhook-signature", "")):
        raise HTTPException(400, "Bad signature")
    try:
        event = json.loads(raw)
        data = event.get("data") or {}
        if str(event.get("type", "")).startswith("PAYMENT_SUCCESS") and (data.get("payment") or {}).get("payment_status") == "SUCCESS":
            await asyncio.to_thread(settle, data["order"]["order_id"], str(data["payment"]["cf_payment_id"]))
    except HTTPException:
        pass  # a payment we have no booking for: answer 200 so Cashfree stops retrying
    except (KeyError, ValueError, TypeError):
        pass  # an event shape we don't use
    return {"ok": True}
