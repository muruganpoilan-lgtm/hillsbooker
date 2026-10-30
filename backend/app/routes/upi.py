"""Direct UPI payments and the host's payments page.

A guest can pay the advance straight to the host's UPI ID, then send the 12-digit UPI reference (UTR).
The booking stays held (rooms stay blocked) for UPI_HOLD_HOURS while the host checks their bank and
confirms or rejects. Razorpay checkout keeps working as before and already offers UPI inside it."""
import re
from datetime import date
from decimal import Decimal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import invoice, notify
from ..auth import current_user, require_role
from ..config import settings
from ..db import get_conn
from .bookings import _give_rooms_back, release_expired_holds
from .payments import set_commission

router = APIRouter(tags=["upi"])
host_only = require_role("owner", "operator", "admin")

UPI_RE = re.compile(r"^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,31}$")
UTR_RE = re.compile(r"^\d{12}$")


class UpiIdIn(BaseModel):
    upi_id: str = ""


class PhoneIn(BaseModel):
    phone: str = ""


class UtrIn(BaseModel):
    utr: str


# ---------- the host's own UPI ID ----------

@router.get("/me/upi")
def my_upi(user: dict = Depends(host_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT upi_id FROM users WHERE id = %s", (user["id"],))
        return {"upi_id": cur.fetchone()["upi_id"]}


@router.put("/me/upi")
def set_upi(body: UpiIdIn, user: dict = Depends(host_only)):
    upi = body.upi_id.strip()
    if upi and not UPI_RE.match(upi):
        raise HTTPException(400, "That doesn't look like a UPI ID. It looks like name@bank")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET upi_id = %s WHERE id = %s", (upi or None, user["id"]))
    return {"upi_id": upi or None}


# ---------- the host's WhatsApp number for booking alerts ----------

@router.get("/me/phone")
def my_phone(user: dict = Depends(host_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT phone FROM users WHERE id = %s", (user["id"],))
        return {"phone": cur.fetchone()["phone"], "alerts_on": notify.enabled()}


@router.put("/me/phone")
def set_phone(body: PhoneIn, user: dict = Depends(host_only)):
    phone = body.phone.strip()
    if phone and not notify.wa_number(phone):
        raise HTTPException(400, "Enter a valid mobile number, for example 98765 43210")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET phone = %s WHERE id = %s", (phone or None, user["id"]))
    return {"phone": phone or None}


# ---------- guest side ----------

def _held_booking(cur, kind: str, booking_id: str, user: dict) -> dict:
    """Lock the guest's own held booking and return what is needed to pay the host directly."""
    if kind == "stay":
        release_expired_holds(cur)
        cur.execute(
            """SELECT b.id, b.user_id, b.status, COALESCE(b.advance_amount, b.total_amount) AS pay_now, b.hold_expires_at,
                      h.upi_id, h.name AS host_name, p.name AS label
               FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.owner_id
               WHERE b.id = %s FOR UPDATE OF b""",
            (booking_id,),
        )
    elif kind == "vehicle":
        from .vehicles import release_expired_vehicle_holds

        release_expired_vehicle_holds(cur)
        cur.execute(
            """SELECT b.id, b.user_id, b.status, b.advance_amount AS pay_now, b.hold_expires_at,
                      h.upi_id, h.name AS host_name, v.name AS label
               FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users h ON h.id = v.operator_id
               WHERE b.id = %s FOR UPDATE OF b""",
            (booking_id,),
        )
    else:
        raise HTTPException(404, "Booking not found")
    b = cur.fetchone()
    if not b or str(b["user_id"]) != user["id"]:
        raise HTTPException(404, "Booking not found")
    if b["status"] != "held":
        raise HTTPException(409, "Your hold ended, so this booking can't be paid. Search again" if b["status"] == "expired" else f"This booking is already {b['status']}")
    if not b["upi_id"]:
        raise HTTPException(409, "This host hasn't added a UPI ID. Pay online instead")
    return b


def _col(kind: str) -> str:
    return "booking_id" if kind == "stay" else "vehicle_booking_id"


@router.get("/payments/upi/{kind}/{booking_id}")
def upi_details(kind: str, booking_id: str, user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        b = _held_booking(cur, kind, booking_id, user)
    amount = Decimal(b["pay_now"])
    note = quote(f"Hill Booker {str(b['id'])[:8]}")
    link = f"upi://pay?pa={quote(b['upi_id'])}&pn={quote(b['host_name'])}&am={amount:.2f}&cu=INR&tn={note}"
    return {"upi_id": b["upi_id"], "payee": b["host_name"], "item": b["label"], "amount": amount, "link": link,
            "confirm_hours": settings.upi_hold_hours}


@router.post("/payments/upi/{kind}/{booking_id}/submit")
def upi_submit(kind: str, booking_id: str, body: UtrIn, user: dict = Depends(current_user)):
    utr = re.sub(r"\s", "", body.utr)
    if not UTR_RE.match(utr):
        raise HTTPException(400, "The UPI reference is 12 digits. You'll find it in your payment app under the payment details")
    col = _col(kind)
    with get_conn() as conn, conn.cursor() as cur:
        b = _held_booking(cur, kind, booking_id, user)
        cur.execute("SELECT 1 FROM payments WHERE provider = 'upi_direct' AND provider_payment_id = %s AND status IN ('created', 'paid') AND " + col + " <> %s", (utr, booking_id))
        if cur.fetchone():
            raise HTTPException(409, "That reference number was already used for another booking")
        cur.execute("SELECT id, provider FROM payments WHERE " + col + " = %s AND status = 'created' FOR UPDATE", (booking_id,))
        open_pay = cur.fetchone()
        if open_pay and open_pay["provider"] == "upi_direct":
            cur.execute("UPDATE payments SET provider_payment_id = %s, amount = %s, updated_at = now() WHERE id = %s", (utr, b["pay_now"], open_pay["id"]))
        else:
            if open_pay:  # an unpaid Razorpay order: the guest chose to pay the host directly instead
                cur.execute("UPDATE payments SET status = 'failed', note = 'Guest chose direct UPI', updated_at = now() WHERE id = %s", (open_pay["id"],))
            cur.execute(
                "INSERT INTO payments (" + col + ", provider, provider_payment_id, amount, note) VALUES (%s, 'upi_direct', %s, %s, 'Waiting for the host to confirm')",
                (booking_id, utr, b["pay_now"]),
            )
        table = "bookings" if kind == "stay" else "vehicle_bookings"
        cur.execute(f"UPDATE {table} SET hold_expires_at = now() + make_interval(hours => %s) WHERE id = %s RETURNING hold_expires_at", (settings.upi_hold_hours, booking_id))
        hold = cur.fetchone()["hold_expires_at"]
    notify.host_in_background(kind, booking_id, "upi")
    return {"status": "awaiting_host", "hold_expires_at": hold}


# ---------- host side: the payments page ----------

_ROWS = """
SELECT s.*, pay.id AS payment_id, pay.provider, pay.status AS pay_status, pay.provider_payment_id AS reference,
       pay.amount AS paid_amount, pay.refunded_amount, pay.commission
FROM (
  SELECT 'stay' AS kind, b.id, b.status, p.name AS item, g.name AS guest, g.phone AS guest_phone,
         b.check_in AS start_date, b.check_out AS end_date, b.total_amount,
         COALESCE(b.advance_amount, b.total_amount) AS advance_amount, b.created_at, p.owner_id AS host_id
  FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.user_id
  WHERE b.status IN ('held', 'confirmed', 'cancelled')
  UNION ALL
  SELECT 'vehicle', b.id, b.status, v.name, g.name, g.phone, b.start_date, b.end_date, b.total_amount,
         b.advance_amount, b.created_at, v.operator_id
  FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users g ON g.id = b.user_id
  WHERE b.status IN ('held', 'confirmed', 'cancelled')
) s
LEFT JOIN LATERAL (
  SELECT * FROM payments pm
  WHERE (s.kind = 'stay' AND pm.booking_id = s.id) OR (s.kind = 'vehicle' AND pm.vehicle_booking_id = s.id)
  ORDER BY (pm.status = 'paid') DESC, pm.created_at DESC LIMIT 1
) pay ON true
WHERE (%s OR s.host_id = %s)
  AND (pay.id IS NOT NULL OR s.status = 'confirmed')
  AND NOT (s.status = 'held' AND pay.provider IS DISTINCT FROM 'upi_direct')
ORDER BY s.created_at DESC LIMIT 300
"""


@router.get("/host/payments")
def host_payments(user: dict = Depends(host_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(_ROWS, (user["role"] == "admin", user["id"]))
        rows = cur.fetchall()
        cur.execute("SELECT upi_id FROM users WHERE id = %s", (user["id"],))
        upi_id = cur.fetchone()["upi_id"]
    today = date.today()
    received = sum((Decimal(r["paid_amount"]) for r in rows if r["pay_status"] == "paid"), Decimal(0))
    refunded = sum((Decimal(r["refunded_amount"] or 0) for r in rows), Decimal(0))
    to_collect = sum((Decimal(r["total_amount"]) - Decimal(r["advance_amount"]) for r in rows if r["status"] == "confirmed" and r["end_date"] >= today), Decimal(0))
    waiting = sum(1 for r in rows if r["status"] == "held" and r["provider"] == "upi_direct" and r["pay_status"] == "created")
    paid = [r for r in rows if r["pay_status"] == "paid"]
    fee_total = sum((Decimal(r["commission"]) for r in paid), Decimal(0))
    # UPI paid straight to the host: the host holds the money and owes Hill Booker the fee.
    fee_owed_by_hosts = sum((Decimal(r["commission"]) for r in paid if r["provider"] == "upi_direct"), Decimal(0))
    # Paid online: Hill Booker holds the money and owes the host the advance minus the fee.
    payout_due_to_hosts = sum((Decimal(r["paid_amount"]) - Decimal(r["commission"]) for r in paid if r["provider"] in ("razorpay", "cashfree")), Decimal(0))
    return {"upi_id": upi_id, "advance_received": received, "balance_to_collect": to_collect, "refunded": refunded,
            "waiting_for_you": waiting, "commission_percent": settings.commission_percent, "fee_total": fee_total,
            "fee_owed_by_hosts": fee_owed_by_hosts, "payout_due_to_hosts": payout_due_to_hosts, "rows": rows}


def _host_payment(cur, payment_id: str, user: dict) -> dict:
    cur.execute("SELECT id, provider, status, amount, booking_id, vehicle_booking_id FROM payments WHERE id = %s FOR UPDATE", (payment_id,))
    pay = cur.fetchone()
    if not pay:
        raise HTTPException(404, "Payment not found")
    if pay["booking_id"]:
        cur.execute("SELECT p.owner_id AS host_id FROM bookings b JOIN properties p ON p.id = b.property_id WHERE b.id = %s", (pay["booking_id"],))
    else:
        cur.execute("SELECT v.operator_id AS host_id FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE b.id = %s", (pay["vehicle_booking_id"],))
    owner = cur.fetchone()
    if user["role"] != "admin" and (not owner or str(owner["host_id"]) != user["id"]):
        raise HTTPException(403, "That's not your booking")
    if pay["provider"] != "upi_direct" or pay["status"] != "created":
        raise HTTPException(409, "This payment is not waiting for you")
    return pay


@router.post("/host/payments/{payment_id}/confirm")
def confirm_upi(payment_id: str, user: dict = Depends(host_only)):
    stay_id = None
    with get_conn() as conn, conn.cursor() as cur:
        pay = _host_payment(cur, payment_id, user)
        table, bid = ("bookings", pay["booking_id"]) if pay["booking_id"] else ("vehicle_bookings", pay["vehicle_booking_id"])
        cur.execute(f"SELECT status FROM {table} WHERE id = %s FOR UPDATE", (bid,))
        if cur.fetchone()["status"] != "held":
            raise HTTPException(409, "This booking already expired or was cancelled, so it can't be confirmed. If the guest paid you, return their money directly")
        cur.execute(f"UPDATE {table} SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (bid,))
        cur.execute("UPDATE payments SET status = 'paid', note = 'Confirmed by host', updated_at = now() WHERE id = %s", (payment_id,))
        set_commission(cur, payment_id)
        if pay["booking_id"]:
            stay_id = str(pay["booking_id"])
    if stay_id:
        invoice.email_in_background(stay_id)
        notify.guest_invoice_in_background(stay_id)
        notify.host_copy_in_background(stay_id)
    return {"payment_id": payment_id, "status": "paid"}


@router.post("/host/payments/{payment_id}/reject")
def reject_upi(payment_id: str, user: dict = Depends(host_only)):
    """The money didn't arrive: release the booking so the rooms or vehicle go back on sale."""
    with get_conn() as conn, conn.cursor() as cur:
        pay = _host_payment(cur, payment_id, user)
        cur.execute("UPDATE payments SET status = 'failed', note = 'Host did not receive this payment', updated_at = now() WHERE id = %s", (payment_id,))
        if pay["booking_id"]:
            cur.execute("SELECT id, room_type_id, check_in, check_out, rooms, status FROM bookings WHERE id = %s FOR UPDATE", (pay["booking_id"],))
            b = cur.fetchone()
            if b["status"] == "held":
                _give_rooms_back(cur, b)
                cur.execute("UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = %s", (b["id"],))
        else:
            cur.execute("UPDATE vehicle_bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = %s AND status = 'held'", (pay["vehicle_booking_id"],))
    return {"payment_id": payment_id, "status": "failed"}
