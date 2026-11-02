from datetime import date
from decimal import ROUND_CEILING, Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from ..auth import current_user, require_role
from ..coupons import CODE_RE, check_coupon, normalize_code
from ..db import get_conn

public = APIRouter(prefix="/coupons", tags=["coupons"])
admin = APIRouter(prefix="/admin/coupons", tags=["coupons (admin)"])
admin_only = require_role("admin")


class CheckIn(BaseModel):
    code: str = Field(max_length=40)
    room_type_id: str
    check_in: date
    check_out: date
    rooms: int = Field(default=1, ge=1, le=10)


@public.post("/check")
def check(body: CheckIn, user: dict = Depends(current_user)):
    """Shows a guest what a coupon would save on these dates. The booking itself checks it again."""
    if body.check_out <= body.check_in:
        raise HTTPException(400, "check_out must be after check_in")
    nights = (body.check_out - body.check_in).days
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT rt.base_price, p.advance_percent FROM room_types rt JOIN properties p ON p.id = rt.property_id
               WHERE rt.id = %s AND p.status = 'approved'""",
            (body.room_type_id,),
        )
        rt = cur.fetchone()
        if not rt:
            raise HTTPException(404, "Room type not found")
        cur.execute(
            "SELECT price FROM room_inventory WHERE room_type_id = %s AND day >= %s AND day < %s",
            (body.room_type_id, body.check_in, body.check_out),
        )
        rows = cur.fetchall()
        if len(rows) != nights:
            raise HTTPException(409, "Those dates aren't open for booking")
        total = sum((r["price"] if r["price"] is not None else rt["base_price"]) for r in rows) * Decimal(body.rooms)
        advance = min(total, (total * rt["advance_percent"] / Decimal(100)).quantize(Decimal(1), rounding=ROUND_CEILING))
        coupon, discount = check_coupon(cur, body.code, user["id"], total, advance)
    return {"code": coupon["code"], "discount": discount, "pay_now_before": advance, "pay_now": advance - discount,
            "total_before": total, "total": total - discount}


# ---------- admin ----------

class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=24)
    kind: str = Field(pattern="^(flat|percent)$")
    value: float = Field(gt=0, le=100000)
    max_discount: float | None = Field(default=None, gt=0, le=100000)
    min_total: float = Field(default=0, ge=0, le=10000000)
    valid_until: date | None = None
    max_uses: int | None = Field(default=None, ge=1, le=1000000)
    per_user: int = Field(default=1, ge=1, le=100)
    first_booking_only: bool = False
    user_email: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def check(self):
        self.code = normalize_code(self.code)
        if not CODE_RE.match(self.code):
            raise ValueError("The code can use letters, numbers, - and _ (3 to 24 characters)")
        if self.kind == "percent" and self.value > 100:
            raise ValueError("A percent coupon can't be more than 100")
        return self


@admin.get("")
def list_coupons(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT c.id, c.code, c.kind, c.value, c.max_discount, c.min_total, c.valid_until, c.max_uses, c.per_user,
                      c.first_booking_only, c.note, c.active, c.created_at, u.email AS user_email,
                      COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS used,
                      COUNT(b.id) FILTER (WHERE b.status = 'held') AS in_progress,
                      COALESCE(SUM(b.discount_amount) FILTER (WHERE b.status = 'confirmed'), 0) AS cost
               FROM coupons c
               LEFT JOIN users u ON u.id = c.user_id
               LEFT JOIN bookings b ON b.coupon_id = c.id
               GROUP BY c.id, u.email ORDER BY c.created_at DESC LIMIT 300"""
        )
        return cur.fetchall()


@admin.post("", status_code=201)
def create_coupon(body: CouponIn, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        uid = None
        if body.user_email and body.user_email.strip():
            cur.execute("SELECT id FROM users WHERE email = %s", (body.user_email.strip().lower(),))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "No account has that email")
            uid = row["id"]
        cur.execute("SELECT 1 FROM coupons WHERE code = %s", (body.code,))
        if cur.fetchone():
            raise HTTPException(409, "That code already exists. Pick another")
        cur.execute(
            """INSERT INTO coupons (code, kind, value, max_discount, min_total, valid_until, max_uses, per_user,
                                    first_booking_only, user_id, note)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, code""",
            (body.code, body.kind, body.value, body.max_discount if body.kind == "percent" else None, body.min_total,
             body.valid_until, body.max_uses, body.per_user, body.first_booking_only, uid, (body.note or "").strip() or None),
        )
        return cur.fetchone()


class ActiveIn(BaseModel):
    active: bool


@admin.patch("/{coupon_id}")
def set_active(coupon_id: str, body: ActiveIn, user: dict = Depends(admin_only)):
    import uuid

    try:
        cid = str(uuid.UUID(coupon_id))
    except ValueError:
        raise HTTPException(404, "Coupon not found")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE coupons SET active = %s WHERE id = %s RETURNING id, active", (body.active, cid))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Coupon not found")
        return row
