from urllib.parse import quote
from datetime import date
from decimal import ROUND_CEILING, Decimal

from fastapi import APIRouter, Depends, HTTPException

from .. import invoice, notify
from ..auth import current_user
from ..config import settings
from ..db import get_conn
from ..schemas import BookingIn

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _give_rooms_back(cur, b: dict) -> None:
    """Return a booking's rooms to the nightly inventory. Locks rows in date order to avoid deadlocks."""
    cur.execute(
        """SELECT day FROM room_inventory
           WHERE room_type_id = %s AND day >= %s AND day < %s ORDER BY day FOR UPDATE""",
        (b["room_type_id"], b["check_in"], b["check_out"]),
    )
    cur.execute(
        """UPDATE room_inventory SET available = available + %s
           WHERE room_type_id = %s AND day >= %s AND day < %s""",
        (b["rooms"], b["room_type_id"], b["check_in"], b["check_out"]),
    )


def release_expired_holds(cur) -> int:
    """Expire unpaid holds past their deadline and give the rooms back."""
    cur.execute(
        """SELECT id, room_type_id, check_in, check_out, rooms FROM bookings
           WHERE status = 'held' AND hold_expires_at < now() FOR UPDATE SKIP LOCKED"""
    )
    expired = cur.fetchall()
    for b in expired:
        _give_rooms_back(cur, b)
        cur.execute("UPDATE bookings SET status = 'expired' WHERE id = %s", (b["id"],))
    return len(expired)


def expire_holds() -> int:
    """Run on a timer from main.py, so unpaid rooms go back on sale even when nobody is booking."""
    with get_conn() as conn, conn.cursor() as cur:
        return release_expired_holds(cur)


@router.post("", status_code=201)
def create_booking(body: BookingIn, user: dict = Depends(current_user)):
    nights = (body.check_out - body.check_in).days
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_holds(cur)

        cur.execute(
            """SELECT rt.id, rt.property_id, rt.max_guests, rt.base_price, p.status, p.advance_percent,
                      ((now() AT TIME ZONE 'Asia/Kolkata')::date + p.min_notice_days) AS earliest_check_in,
                      p.min_notice_days
               FROM room_types rt JOIN properties p ON p.id = rt.property_id WHERE rt.id = %s""",
            (body.room_type_id,),
        )
        rt = cur.fetchone()
        if not rt or rt["status"] != "approved":
            raise HTTPException(404, "Room type not found")
        if body.check_in < rt["earliest_check_in"]:
            raise HTTPException(
                400,
                f"Bookings here need {rt['min_notice_days']} days' notice. The earliest check-in is {rt['earliest_check_in']:%d %b %Y}",
            )
        if body.guests > rt["max_guests"] * body.rooms:
            raise HTTPException(400, f"This room sleeps {rt['max_guests']} guests. Add more rooms or choose a bigger one")

        # Lock every night of the stay, in date order. A second guest booking the same
        # rooms waits here until this transaction finishes, then sees the updated count.
        cur.execute(
            """SELECT day, available, price FROM room_inventory
               WHERE room_type_id = %s AND day >= %s AND day < %s ORDER BY day FOR UPDATE""",
            (body.room_type_id, body.check_in, body.check_out),
        )
        nights_rows = cur.fetchall()
        if len(nights_rows) != nights or any(r["available"] < body.rooms for r in nights_rows):
            raise HTTPException(409, "Those rooms were just taken for your dates. Try other dates")

        total = sum((r["price"] if r["price"] is not None else rt["base_price"]) for r in nights_rows) * Decimal(body.rooms)
        # Advance: the share of the stay paid online now, rounded up to a whole rupee. The rest is paid at the property.
        advance = min(total, (total * rt["advance_percent"] / Decimal(100)).quantize(Decimal(1), rounding=ROUND_CEILING))

        cur.execute(
            """UPDATE room_inventory SET available = available - %s
               WHERE room_type_id = %s AND day >= %s AND day < %s""",
            (body.rooms, body.room_type_id, body.check_in, body.check_out),
        )
        cur.execute(
            """INSERT INTO bookings (user_id, property_id, room_type_id, check_in, check_out, rooms, guests,
                                     total_amount, advance_amount, status, hold_expires_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'held', now() + make_interval(mins => %s))
               RETURNING id, total_amount, advance_amount, hold_expires_at""",
            (user["id"], rt["property_id"], body.room_type_id, body.check_in, body.check_out,
             body.rooms, body.guests, total, advance, settings.hold_minutes),
        )
        booking = cur.fetchone()
    return {"booking_id": booking["id"], "status": "held", "total_amount": booking["total_amount"],
            "advance_amount": booking["advance_amount"], "balance_due": booking["total_amount"] - booking["advance_amount"],
            "pay_before": booking["hold_expires_at"], "nights": nights}


@router.get("/mine")
def my_bookings(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_holds(cur)  # so a guest never sees a hold that has already run out
        cur.execute(
            """SELECT b.id, p.name AS property, p.city, rt.name AS room_type, b.check_in, b.check_out,
                      b.rooms, b.guests, b.total_amount,
                      COALESCE(b.advance_amount, b.total_amount) AS advance_amount,
                      b.total_amount - COALESCE(b.advance_amount, b.total_amount) AS balance_due,
                      b.status, b.hold_expires_at,
                      EXISTS (SELECT 1 FROM payments pm WHERE pm.booking_id = b.id AND pm.provider = 'upi_direct' AND pm.status = 'created') AS upi_pending,
                      (SELECT h.upi_id IS NOT NULL FROM users h WHERE h.id = p.owner_id) AS host_upi
               FROM bookings b
               JOIN properties p ON p.id = b.property_id
               JOIN room_types rt ON rt.id = b.room_type_id
               WHERE b.user_id = %s ORDER BY b.created_at DESC""",
            (user["id"],),
        )
        return cur.fetchall()


@router.post("/{booking_id}/confirm")
def confirm_booking(booking_id: str, user: dict = Depends(current_user)):
    """Dev-only shortcut. Real confirmation will happen from the Razorpay payment webhook."""
    if not settings.allow_fake_confirm:
        raise HTTPException(403, "Payment is required to confirm a booking")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, user_id, status, hold_expires_at FROM bookings WHERE id = %s FOR UPDATE", (booking_id,))
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] != "held":
            raise HTTPException(409, f"This booking is already {b['status']}")
        cur.execute("SELECT now() > %s AS late", (b["hold_expires_at"],))
        if cur.fetchone()["late"]:
            raise HTTPException(409, "Your hold expired. Search again")
        cur.execute("UPDATE bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (booking_id,))
    invoice.email_in_background(booking_id)
    notify.host_in_background("stay", booking_id)
    return {"booking_id": booking_id, "status": "confirmed"}


def _own_confirmed(cur, booking_id: str, user: dict) -> None:
    cur.execute("SELECT user_id, status FROM bookings WHERE id = %s", (booking_id,))
    b = cur.fetchone()
    if not b or str(b["user_id"]) != user["id"]:
        raise HTTPException(404, "Booking not found")
    if b["status"] != "confirmed":
        raise HTTPException(409, "An invoice is made once the booking is confirmed")


@router.get("/{booking_id}/invoice-link")
def invoice_link(booking_id: str, user: dict = Depends(current_user)):
    """A link that opens the invoice PDF in a browser, with no login needed. Valid for 60 days."""
    with get_conn() as conn, conn.cursor() as cur:
        _own_confirmed(cur, booking_id, user)
    return {"url": invoice.link_for(booking_id)}


def _wa_number(phone: str | None) -> str:
    """Digits only, with India's 91 in front of a 10-digit number. Empty when there is no usable number."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return digits if 11 <= len(digits) <= 15 else ""


@router.get("/{booking_id}/invoice/whatsapp")
def invoice_whatsapp(booking_id: str, user: dict = Depends(current_user)):
    """A WhatsApp link that opens a chat with the guest's own number, with the invoice link already typed in.
    Without a saved phone number the link opens WhatsApp's contact picker instead."""
    with get_conn() as conn, conn.cursor() as cur:
        _own_confirmed(cur, booking_id, user)
        cur.execute(
            """SELECT p.name AS property, b.check_in, b.check_out, u.phone
               FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users u ON u.id = b.user_id
               WHERE b.id = %s""",
            (booking_id,),
        )
        row = cur.fetchone()
    text = f"Hill Booker invoice for {row['property']}, {row['check_in']:%d %b %Y} to {row['check_out']:%d %b %Y}: {invoice.link_for(booking_id)}"
    number = _wa_number(row["phone"])
    url = f"https://wa.me/{number}?text={quote(text)}"
    return {"url": url, "has_number": bool(number)}


@router.post("/{booking_id}/invoice/email")
def email_invoice(booking_id: str, user: dict = Depends(current_user)):
    """Email the invoice to the guest's own address."""
    if not invoice.email_enabled():
        raise HTTPException(503, "Email isn't switched on yet. Open the invoice instead")
    with get_conn() as conn, conn.cursor() as cur:
        _own_confirmed(cur, booking_id, user)
    if not invoice.email_invoice(booking_id):
        raise HTTPException(502, "The email could not be sent. Try again in a minute")
    return {"sent": True}


@router.post("/{booking_id}/cancel")
def cancel_booking(booking_id: str, user: dict = Depends(current_user)):
    refund_args = None
    refund = {"status": "none", "amount": 0, "reason": "no_payment"}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT id, user_id, status, room_type_id, check_in, check_out, rooms
               FROM bookings WHERE id = %s FOR UPDATE""",
            (booking_id,),
        )
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] not in ("held", "confirmed"):
            raise HTTPException(409, f"This booking is already {b['status']}")
        if b["check_in"] < date.today():
            raise HTTPException(409, "You can't cancel a stay that has already started")
        _give_rooms_back(cur, b)
        cur.execute("UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = %s", (booking_id,))

        if b["status"] == "confirmed":
            cur.execute("SELECT id, provider, provider_payment_id, amount FROM payments WHERE booking_id = %s AND status = 'paid' FOR UPDATE", (booking_id,))
            pay = cur.fetchone()
            if pay:
                refund["reason"] = "too_late"
                # Full refund if there are at least REFUND_FULL_HOURS left before check-in (midnight, India time); none after.
                cur.execute(
                    "SELECT (%s::date::timestamp AT TIME ZONE 'Asia/Kolkata') - now() >= make_interval(hours => %s) AS full",
                    (b["check_in"], settings.refund_full_hours),
                )
                if cur.fetchone()["full"]:
                    if pay["provider"] == "upi_direct":
                        # The guest paid the host directly, so the host returns the money. We only record it.
                        cur.execute(
                            "UPDATE payments SET status = 'refunded', refunded_amount = amount, commission = 0, note = 'Cancelled by guest. Host returns the money directly.', updated_at = now() WHERE id = %s",
                            (pay["id"],),
                        )
                        refund = {"status": "manual", "amount": pay["amount"], "reason": "upi_direct"}
                    else:
                        refund_args = (str(pay["id"]), pay["provider_payment_id"], pay["amount"], "Cancelled by guest")
                        refund = {"status": "refunded", "amount": pay["amount"], "reason": "full"}
        else:
            cur.execute("UPDATE payments SET status = 'failed', note = 'Booking cancelled before the host confirmed', updated_at = now() WHERE booking_id = %s AND status = 'created' AND provider = 'upi_direct'", (booking_id,))
    if refund_args:
        from .payments import refund_payment  # imported here because payments.py imports this module

        refund["status"] = refund_payment(*refund_args)
    return {"booking_id": booking_id, "status": "cancelled", "refund": refund}
