"""Coupon codes for stays.

The money rule, in one line: the guest pays less online, Hill Booker's commission shrinks by the same amount, and the
host still gets exactly what they would have got without the coupon. Nothing is taken from the host."""
import re
from decimal import ROUND_DOWN, Decimal

from fastapi import HTTPException

CODE_RE = re.compile(r"^[A-Z0-9_-]{3,24}$")


def normalize_code(code) -> str:
    return re.sub(r"\s+", "", str(code or "")).upper()


def calc_discount(c: dict, list_total: Decimal, advance: Decimal) -> Decimal:
    """Rupees off for this coupon, in whole rupees. It never takes the online payment below Rs 1."""
    if c["kind"] == "percent":
        d = (list_total * Decimal(c["value"]) / Decimal(100)).quantize(Decimal(1), rounding=ROUND_DOWN)
        if c["max_discount"] is not None:
            d = min(d, Decimal(c["max_discount"]).quantize(Decimal(1), rounding=ROUND_DOWN))
    else:
        d = Decimal(c["value"]).quantize(Decimal(1), rounding=ROUND_DOWN)
    return max(Decimal(0), min(d, advance - 1))


def check_coupon(cur, code: str, user_id: str, list_total: Decimal, advance: Decimal, lock: bool = False):
    """Returns (coupon row, discount) or raises HTTPException(400) with a message the guest can act on."""
    code = normalize_code(code)
    bad = HTTPException(400, "That coupon code isn't valid")
    if not CODE_RE.match(code):
        raise bad
    cur.execute("SELECT * FROM coupons WHERE code = %s" + (" FOR UPDATE" if lock else ""), (code,))
    c = cur.fetchone()
    if not c or not c["active"]:
        raise bad
    if c["user_id"] is not None and str(c["user_id"]) != str(user_id):
        raise bad
    cur.execute("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today")
    today = cur.fetchone()["today"]
    if c["valid_until"] is not None and today > c["valid_until"]:
        raise HTTPException(400, "That coupon has expired")
    if list_total < Decimal(c["min_total"]):
        raise HTTPException(400, f"This coupon works on bookings of Rs {Decimal(c['min_total']):,.0f} or more")
    if c["max_uses"] is not None:
        cur.execute("SELECT count(*) AS n FROM bookings WHERE coupon_id = %s AND status IN ('held', 'confirmed')", (c["id"],))
        if cur.fetchone()["n"] >= c["max_uses"]:
            raise HTTPException(400, "That coupon has been fully used")
    cur.execute(
        "SELECT count(*) AS n FROM bookings WHERE coupon_id = %s AND user_id = %s AND status IN ('held', 'confirmed')",
        (c["id"], user_id),
    )
    if cur.fetchone()["n"] >= c["per_user"]:
        raise HTTPException(400, "You've already used this coupon")
    if c["first_booking_only"]:
        cur.execute(
            """SELECT (SELECT count(*) FROM bookings WHERE user_id = %(u)s AND status = 'confirmed')
                    + (SELECT count(*) FROM vehicle_bookings WHERE user_id = %(u)s AND status = 'confirmed') AS n""",
            {"u": user_id},
        )
        if cur.fetchone()["n"] > 0:
            raise HTTPException(400, "This coupon is for your first booking only")
    d = calc_discount(c, list_total, advance)
    if d <= 0:
        raise HTTPException(400, "This coupon doesn't apply to this booking")
    return c, d
