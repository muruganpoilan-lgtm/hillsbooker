from urllib.parse import quote
from datetime import date
from decimal import ROUND_CEILING, Decimal

from fastapi import APIRouter, Depends, HTTPException

from .. import invoice, notify
from ..auth import current_user
from ..config import settings
from ..coupons import check_coupon
from ..db import get_conn
from ..schemas import BookingIn, ReviewIn

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
           WHERE room_type_id = %s AND day >= %s AND day < %s AND NOT blocked""",
        (b["rooms"], b["room_type_id"], b["check_in"], b["check_out"]),
    )
    from .hotel import apply_waiting_holds  # a walk-in guest already in this room type keeps the freed night off sale
    apply_waiting_holds(cur, b["room_type_id"], b["check_in"], b["check_out"])


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
        if body.children >= body.guests:
            raise HTTPException(400, "At least one adult is needed")
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

        # A coupon lowers what the guest pays online. The guest's total drops by the same amount, so the balance paid at
        # the property is unchanged, and Hill Booker's commission absorbs the discount (see set_commission).
        coupon, discount = None, Decimal(0)
        if body.coupon_code and body.coupon_code.strip():
            coupon, discount = check_coupon(cur, body.coupon_code, user["id"], total, advance, lock=True)
            total, advance = total - discount, advance - discount

        cur.execute(
            """UPDATE room_inventory SET available = available - %s
               WHERE room_type_id = %s AND day >= %s AND day < %s""",
            (body.rooms, body.room_type_id, body.check_in, body.check_out),
        )
        cur.execute(
            """INSERT INTO bookings (user_id, property_id, room_type_id, check_in, check_out, rooms, guests, children, child_ages,
                                     total_amount, advance_amount, status, hold_expires_at,
                                     coupon_id, coupon_code, discount_amount)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'held', now() + make_interval(mins => %s), %s, %s, %s)
               RETURNING id, total_amount, advance_amount, hold_expires_at""",
            (user["id"], rt["property_id"], body.room_type_id, body.check_in, body.check_out,
             body.rooms, body.guests, body.children, body.child_ages or None, total, advance, settings.hold_minutes,
             coupon["id"] if coupon else None, coupon["code"] if coupon else None, discount),
        )
        booking = cur.fetchone()
    return {"booking_id": booking["id"], "status": "held", "total_amount": booking["total_amount"],
            "advance_amount": booking["advance_amount"], "balance_due": booking["total_amount"] - booking["advance_amount"],
            "pay_before": booking["hold_expires_at"], "nights": nights, "discount": discount}


@router.get("/mine")
def my_bookings(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_holds(cur)  # so a guest never sees a hold that has already run out
        cur.execute(
            """SELECT b.id, b.property_id, p.name AS property, p.city, rt.name AS room_type, b.check_in, b.check_out,
                      b.rooms, b.guests, b.children, b.total_amount, b.coupon_code, b.discount_amount,
                      COALESCE(b.advance_amount, b.total_amount) AS advance_amount,
                      b.total_amount - COALESCE(b.advance_amount, b.total_amount) AS balance_due,
                      b.status, b.hold_expires_at,
                      EXISTS (SELECT 1 FROM payments pm WHERE pm.booking_id = b.id AND pm.provider = 'upi_direct' AND pm.status = 'created') AS upi_pending,
                      (SELECT h.upi_id IS NOT NULL FROM users h WHERE h.id = p.owner_id) AS host_upi,
                      COALESCE((SELECT now() < pm.updated_at + make_interval(mins => %s) FROM payments pm
                                WHERE pm.booking_id = b.id AND pm.status = 'paid' ORDER BY pm.updated_at DESC LIMIT 1), true) AS can_cancel,
                      CASE WHEN rv.removed_at IS NULL THEN rv.rating END AS my_rating,
                      CASE WHEN rv.removed_at IS NULL THEN rv.comment END AS my_comment,
                      (b.status = 'confirmed' AND rv.id IS NULL AND p.owner_id <> b.user_id
                       AND b.check_out <= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS can_review
               FROM bookings b
               LEFT JOIN reviews rv ON rv.booking_id = b.id
               JOIN properties p ON p.id = b.property_id
               JOIN room_types rt ON rt.id = b.room_type_id
               WHERE b.user_id = %s ORDER BY b.created_at DESC""",
            (settings.cancel_window_minutes, user["id"]),
        )
        return cur.fetchall()


def refresh_rating(cur, property_id) -> dict:
    """Recount a property's average and number of reviews, leaving out removed ones."""
    # Lock the property row so two changes at once can't both write a stale average.
    cur.execute("SELECT id FROM properties WHERE id = %s FOR UPDATE", (property_id,))
    cur.execute(
        """UPDATE properties p SET rating_avg = COALESCE(x.avg, 0), rating_count = x.n
           FROM (SELECT ROUND(AVG(rating)::numeric, 1) AS avg, COUNT(*) AS n
                 FROM reviews WHERE property_id = %s AND removed_at IS NULL) x
           WHERE p.id = %s
           RETURNING p.rating_avg, p.rating_count""",
        (property_id, property_id),
    )
    return cur.fetchone()


@router.post("/{booking_id}/review", status_code=201)
def review_booking(booking_id: str, body: ReviewIn, user: dict = Depends(current_user)):
    """A guest rates their stay once, after check-out. The property's average and count are updated at the same time."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT b.id, b.property_id, b.status, b.check_out, p.owner_id,
                      (now() AT TIME ZONE 'Asia/Kolkata')::date AS today
               FROM bookings b JOIN properties p ON p.id = b.property_id
               WHERE b.id::text = %s AND b.user_id = %s""",
            (booking_id, user["id"]),
        )
        b = cur.fetchone()
        if not b:
            raise HTTPException(404, "Booking not found")
        if str(b["owner_id"]) == str(user["id"]):
            raise HTTPException(403, "Hosts can't review their own property")
        if b["status"] != "confirmed":
            raise HTTPException(400, "Only a confirmed stay can be reviewed")
        if b["check_out"] > b["today"]:
            raise HTTPException(400, "You can write a review after you check out")
        cur.execute(
            """INSERT INTO reviews (booking_id, property_id, user_id, rating, comment)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (booking_id) DO NOTHING RETURNING id""",
            (b["id"], b["property_id"], user["id"], body.rating, body.comment or None),
        )
        if not cur.fetchone():
            raise HTTPException(409, "You have already reviewed this stay")
        agg = refresh_rating(cur, b["property_id"])
    return {"ok": True, "rating_avg": agg["rating_avg"], "rating_count": agg["rating_count"]}


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
    notify.guest_invoice_in_background(booking_id)
    notify.host_copy_in_background(booking_id)
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
        if b["status"] == "confirmed":
            cur.execute(
                "SELECT now() <= max(updated_at) + make_interval(mins => %s) AS ok, count(*) AS n FROM payments WHERE booking_id = %s AND status = 'paid'",
                (settings.cancel_window_minutes, booking_id),
            )
            w = cur.fetchone()
            if w["n"] and not w["ok"]:
                raise HTTPException(409, f"You can cancel on your own only in the first {settings.cancel_window_minutes} minutes after booking. Please call Hill Booker customer care")
        _give_rooms_back(cur, b)
        cur.execute("UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = %s", (booking_id,))

        if b["status"] == "confirmed":
            cur.execute("SELECT id, provider, provider_payment_id, amount FROM payments WHERE booking_id = %s AND status = 'paid' FOR UPDATE", (booking_id,))
            pay = cur.fetchone()
            if pay:
                refund["reason"] = "too_late"
                # A guest can cancel on their own only in the first few minutes after paying; that cancellation is refunded in full.
                if True:
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
    if b["status"] == "confirmed":
        notify.cancel_in_background("stay", booking_id, refund)
    return {"booking_id": booking_id, "status": "cancelled", "refund": refund}
