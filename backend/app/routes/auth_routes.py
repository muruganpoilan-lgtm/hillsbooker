from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from .. import notify
from ..auth import check_password, current_user, hash_password, make_token
from ..db import get_conn
from ..schemas import LoginIn, RegisterIn
from pydantic import BaseModel

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
