import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from .. import mailer, notify
from ..config import settings
from ..auth import check_password, current_user, hash_password, make_token
from ..db import get_conn
from ..schemas import LoginIn, RegisterIn
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn):
    if not notify.wa_number(body.phone):
        raise HTTPException(400, "Enter a valid mobile number, for example 98765 43210")
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (name, email, phone, password_hash, role)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id, role""",
                (body.name, body.email.lower(), body.phone, hash_password(body.password), body.role),
            )
            user = cur.fetchone()
    except UniqueViolation:
        raise HTTPException(409, "That email is already registered. Log in instead")
    return {"token": make_token(str(user["id"]), user["role"]), "role": user["role"]}


@router.post("/login")
def login(body: LoginIn):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, role, password_hash FROM users WHERE email = %s", (body.email.lower(),))
        user = cur.fetchone()
    if not user or not check_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return {"token": make_token(str(user["id"]), user["role"]), "role": user["role"]}


@router.post("/become-host")
def become_host(user: dict = Depends(current_user)):
    """A guest account turns into a host account. The same login still books stays and trips.
    Returns a fresh token, because the role is stored inside it."""
    if user["role"] in ("owner", "operator", "admin"):
        return {"token": make_token(user["id"], user["role"]), "role": user["role"]}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET role = 'owner' WHERE id = %s AND role = 'guest' RETURNING id", (user["id"],))
        if not cur.fetchone():
            raise HTTPException(404, "Account not found")
    return {"token": make_token(user["id"], "owner"), "role": "owner"}


class PhoneIn(BaseModel):
    phone: str = ""


@router.get("/phone")
def my_phone(user: dict = Depends(current_user)):
    """The mobile number on this account (used for WhatsApp invoices and for hosts to reach the guest)."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT phone FROM users WHERE id = %s", (user["id"],))
        return {"phone": cur.fetchone()["phone"]}


@router.put("/phone")
def set_my_phone(body: PhoneIn, user: dict = Depends(current_user)):
    phone = body.phone.strip()
    if phone and not notify.wa_number(phone):
        raise HTTPException(400, "Enter a valid mobile number, for example 98765 43210")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE users SET phone = %s WHERE id = %s", (phone or None, user["id"]))
    return {"phone": phone or None}


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=100)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot")
def forgot_password(body: ForgotIn):
    """Emails a one-hour reset link. The answer is always the same, so nobody can use this to find out who has an account."""
    email = body.email.lower()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, name FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if user:
            cur.execute("SELECT count(*) AS n FROM password_resets WHERE user_id = %s AND created_at > now() - interval '1 hour'", (user["id"],))
            if cur.fetchone()["n"] < 3:  # at most 3 emails an hour per account
                token = secrets.token_urlsafe(32)
                cur.execute(
                    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (%s, %s, now() + interval '1 hour')",
                    (user["id"], _hash_token(token)),
                )
                link = f"{settings.site_url.rstrip('/')}/reset-password?token={token}"
                mailer.send_in_background(
                    email,
                    f"Reset your {settings.business_name} password",
                    f"Hello {user['name']},\n\nSomeone asked to reset the password for your {settings.business_name} account. "
                    f"Open this link to choose a new one. It works for 1 hour and only once:\n\n{link}\n\n"
                    f"If you didn't ask for this, you can ignore this email. Your password stays the same.\n\n{settings.business_name}\n",
                )
    return {"ok": True}


@router.post("/reset")
def reset_password(body: ResetIn):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, user_id FROM password_resets WHERE token_hash = %s AND used_at IS NULL AND expires_at > now() FOR UPDATE",
            (_hash_token(body.token),),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(400, "This link has expired or was already used. Ask for a new one")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.password), row["user_id"]))
        cur.execute("UPDATE password_resets SET used_at = now() WHERE user_id = %s AND used_at IS NULL", (row["user_id"],))
    return {"ok": True}
