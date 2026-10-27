from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from ..auth import check_password, current_user, hash_password, make_token
from ..db import get_conn
from ..schemas import LoginIn, RegisterIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn):
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
