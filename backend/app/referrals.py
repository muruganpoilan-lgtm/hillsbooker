"""Invite a friend. The friend gets a welcome coupon; the inviter gets a coupon once the friend's first stay is confirmed.
Both are ordinary coupons (see coupons.py), so the money rule is the same: Hill Booker pays, the host's share is untouched."""
import logging
import re
import secrets

from fastapi import HTTPException

from .config import settings

log = logging.getLogger("hillbooker.referrals")
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I, so a code read aloud can't be mistaken


def _rand(n: int) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def normalize(code) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(code or "").upper())[:12]


def ensure_code(cur, user_id: str) -> str:
    cur.execute("SELECT referral_code FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Account not found")
    if row["referral_code"]:
        return row["referral_code"]
    for _ in range(8):
        code = "HB" + _rand(6)
        cur.execute("UPDATE users SET referral_code = %s WHERE id = %s AND referral_code IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = %s) RETURNING referral_code",
                    (code, user_id, code))
        got = cur.fetchone()
        if got:
            return got["referral_code"]
        cur.execute("SELECT referral_code FROM users WHERE id = %s", (user_id,))
        again = cur.fetchone()
        if again and again["referral_code"]:
            return again["referral_code"]
    raise HTTPException(500, "Couldn't make your invite code. Try again")


def mint_coupon(cur, *, user_id: str, prefix: str, amount: int, days: int, note: str) -> dict:
    """A one-guest, one-use flat coupon."""
    for _ in range(8):
        code = f"{prefix}-{_rand(6)}"
        cur.execute("SELECT 1 FROM coupons WHERE code = %s", (code,))
        if cur.fetchone():
            continue
        cur.execute(
            """INSERT INTO coupons (code, kind, value, min_total, valid_until, max_uses, per_user, first_booking_only, user_id, note, source)
               VALUES (%s, 'flat', %s, %s, (now() AT TIME ZONE 'Asia/Kolkata')::date + %s, 1, 1, false, %s, %s, 'referral')
               RETURNING id, code, value, valid_until""",
            (code, amount, settings.referral_min_total, days, user_id, note),
        )
        return cur.fetchone()
    raise HTTPException(500, "Couldn't make the coupon. Try again")


def claim(cur, user_id: str, code: str) -> dict:
    """A new guest enters a friend's code. Works once, only for a new account that hasn't booked yet."""
    code = normalize(code)
    cur.execute("SELECT referred_by, created_at > now() - interval '7 days' AS is_new FROM users WHERE id = %s FOR UPDATE", (user_id,))
    me = cur.fetchone()
    if not me:
        raise HTTPException(404, "Account not found")
    if me["referred_by"] is not None:
        raise HTTPException(409, "You've already used an invite code")
    if not me["is_new"]:
        raise HTTPException(400, "Invite codes work only on new accounts")
    cur.execute("SELECT id FROM users WHERE referral_code = %s", (code,))
    ref = cur.fetchone()
    if not code or not ref:
        raise HTTPException(404, "That invite code isn't valid")
    if str(ref["id"]) == str(user_id):
        raise HTTPException(400, "You can't use your own invite code")
    cur.execute(
        """SELECT (SELECT count(*) FROM bookings WHERE user_id = %(u)s AND status IN ('held', 'confirmed'))
                + (SELECT count(*) FROM vehicle_bookings WHERE user_id = %(u)s AND status IN ('held', 'confirmed')) AS n""",
        {"u": user_id},
    )
    if cur.fetchone()["n"] > 0:
        raise HTTPException(400, "Invite codes work only before your first booking")
    cur.execute("UPDATE users SET referred_by = %s WHERE id = %s", (ref["id"], user_id))
    cur.execute("INSERT INTO referrals (referred_user_id, referrer_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (user_id, ref["id"]))
    return mint_coupon(cur, user_id=user_id, prefix="WELCOME", amount=settings.referral_friend_amount,
                       days=settings.referral_friend_days, note="Invite: welcome coupon")


def on_stay_confirmed(cur, booking_id) -> None:
    """Called when a stay is confirmed. If it's the first confirmed stay of an invited guest, the inviter earns a coupon.
    Never lets a problem here disturb the payment: it runs in its own savepoint and only logs a failure."""
    try:
        with cur.connection.transaction():
            cur.execute("SELECT b.user_id, u.referred_by FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = %s", (booking_id,))
            b = cur.fetchone()
            if not b or not b["referred_by"]:
                return
            cur.execute("SELECT rewarded_at FROM referrals WHERE referred_user_id = %s FOR UPDATE", (b["user_id"],))
            r = cur.fetchone()
            if not r or r["rewarded_at"] is not None:
                return
            cur.execute("SELECT count(*) AS n FROM bookings WHERE user_id = %s AND status = 'confirmed'", (b["user_id"],))
            if cur.fetchone()["n"] != 1:
                return
            c = mint_coupon(cur, user_id=str(b["referred_by"]), prefix="THANKS", amount=settings.referral_referrer_amount,
                            days=settings.referral_referrer_days, note="Invite: thank-you coupon")
            cur.execute("UPDATE referrals SET rewarded_at = now(), reward_coupon_id = %s WHERE referred_user_id = %s", (c["id"], b["user_id"]))
    except Exception:  # noqa: BLE001 - a reward problem must never undo a paid booking
        log.exception("referral reward failed for booking %s", booking_id)
