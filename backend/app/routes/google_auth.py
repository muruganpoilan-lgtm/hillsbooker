"""Sign in with Google, using the browser redirect flow so the app and the website share one setup.

1. The app or website opens /auth/google/start. We send the person to Google's sign-in page.
2. Google sends them back to /auth/google/callback with a one-time code.
3. We swap the code for the person's verified email and name (a direct call to Google over https),
   find or create the account, and send them back to the app (hillbooker://auth) or website (/auth/google)
   with a login token.

An existing account with the same email is simply logged in, keeping its type. A new account gets the type chosen
on the sign-up screen (guest by default)."""
import base64
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html import escape

import jwt
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from ..auth import hash_password, make_token
from ..config import google_enabled, settings
from ..db import get_conn

router = APIRouter(prefix="/auth/google", tags=["auth"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


def _redirect_uri() -> str:
    return f"{settings.public_base_url.rstrip('/')}/auth/google/callback"


@router.get("/config")
def config():
    return {"enabled": google_enabled()}


@router.get("/start")
def start(target: str = Query("web", pattern="^(app|web)$"), role: str = Query("guest", pattern="^(guest|owner|operator)$"),
          next: str = Query("/", max_length=300)):
    if not google_enabled():
        raise HTTPException(503, "Google sign-in isn't switched on yet")
    state = jwt.encode(
        {"t": target, "r": role, "n": next, "x": secrets.token_hex(8), "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        settings.jwt_secret, algorithm="HS256",
    )
    q = urllib.parse.urlencode({
        "client_id": settings.google_client_id, "redirect_uri": _redirect_uri(), "response_type": "code",
        "scope": "openid email profile", "state": state, "prompt": "select_account",
    })
    return RedirectResponse(f"{AUTH_URL}?{q}")


def _exchange(code: str) -> dict:
    data = urllib.parse.urlencode({
        "code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "redirect_uri": _redirect_uri(), "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 (fixed https URL)
        body = json.loads(r.read())
    # The id_token came straight from Google over https in answer to our own request, so its claims can be trusted.
    payload = body["id_token"].split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def _back(target: str, params: dict, nxt: str):
    if target == "app":
        url = "hillbooker://auth?" + urllib.parse.urlencode(params)
        # A page with a link as well as an automatic jump, because some phones ignore a plain redirect to an app.
        return HTMLResponse(
            f'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hill Booker</title>'
            f'<body style="font-family:sans-serif;text-align:center;padding:3rem 1rem">'
            f'<p>Returning to Hill Booker…</p><p><a href="{escape(url)}">Tap here if the app does not open</a></p>'
            f'<script>location.href={json.dumps(url)}</script></body>'
        )
    if not nxt.startswith("/") or nxt.startswith("//"):
        nxt = "/"
    return RedirectResponse(f"{settings.site_url.rstrip('/')}/auth/google?" + urllib.parse.urlencode({**params, "next": nxt}))


@router.get("/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    try:
        st = jwt.decode(state or "", settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(400, "This sign-in link expired. Go back and try again")
    target, role, nxt = st["t"], st["r"], st.get("n", "/")
    if error or not code:
        return _back(target, {"error": "Google sign-in was cancelled"}, nxt)
    try:
        claims = _exchange(code)
    except (urllib.error.URLError, KeyError, ValueError, IndexError):
        return _back(target, {"error": "Google sign-in failed. Try again"}, nxt)
    if claims.get("aud") != settings.google_client_id or not claims.get("email") or claims.get("email_verified") is not True:
        return _back(target, {"error": "Google didn't confirm your email"}, nxt)

    email = claims["email"].lower()
    name = (claims.get("name") or email.split("@")[0])[:100]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, role FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
        if not user:
            # No password is ever used for this account; the random one just fills the required column.
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, role",
                (name, email, hash_password(secrets.token_urlsafe(32)), role),
            )
            user = cur.fetchone()
    return _back(target, {"token": make_token(str(user["id"]), user["role"]), "role": user["role"]}, nxt)
