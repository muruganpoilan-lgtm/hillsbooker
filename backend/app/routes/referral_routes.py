from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import referrals
from ..auth import current_user, require_role
from ..config import settings
from ..db import get_conn

router = APIRouter(prefix="/referrals", tags=["referrals"])
admin = APIRouter(prefix="/admin/referrals", tags=["referrals (admin)"])
admin_only = require_role("admin")


@router.get("/me")
def my_invite(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        code = referrals.ensure_code(cur, user["id"])
        cur.execute(
            "SELECT count(*) AS invited, count(rewarded_at) AS rewarded FROM referrals WHERE referrer_id = %s", (user["id"],)
        )
        counts = cur.fetchone()
    return {
        "code": code,
        "link": f"{settings.site_url.rstrip('/')}/register?ref={code}",
        "friend_amount": settings.referral_friend_amount,
        "referrer_amount": settings.referral_referrer_amount,
        "min_total": settings.referral_min_total,
        "invited": counts["invited"],
        "rewarded": counts["rewarded"],
    }


class ClaimIn(BaseModel):
    code: str = Field(max_length=40)


@router.post("/claim")
def claim(body: ClaimIn, user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        c = referrals.claim(cur, user["id"], body.code)
    return {"coupon": c["code"], "amount": c["value"], "valid_until": c["valid_until"]}


@admin.get("/summary")
def summary(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT (SELECT count(*) FROM referrals) AS invited,
                      (SELECT count(*) FROM referrals WHERE rewarded_at IS NOT NULL) AS rewarded,
                      COALESCE((SELECT SUM(b.discount_amount) FROM bookings b JOIN coupons c ON c.id = b.coupon_id
                                WHERE c.source = 'referral' AND b.status = 'confirmed'), 0) AS cost"""
        )
        return cur.fetchone()
