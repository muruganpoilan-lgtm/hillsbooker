"""The app tells the server which phone to send notifications to."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import push
from ..auth import current_user
from ..db import get_conn

router = APIRouter(prefix="/push", tags=["push notifications"])


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=500)


@router.post("/register")
def register(body: TokenIn, user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO push_tokens (token, user_id) VALUES (%s, %s)
               ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen = now()""",
            (body.token, user["id"]),
        )
    return {"ok": True}


@router.post("/unregister")
def unregister(body: TokenIn, user: dict = Depends(current_user)):
    """Called when someone logs out, so the next person on that phone doesn't get their alerts."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM push_tokens WHERE token = %s AND user_id = %s", (body.token, user["id"]))
    return {"ok": True}


@router.post("/test")
def test(user: dict = Depends(current_user)):
    """Sends a test notification to the phones this person is logged in on."""
    if not push.enabled():
        raise HTTPException(503, "Notifications are not switched on yet")
    n = push.send_to_user(user["id"], "Hill Booker", "Notifications are working on this phone.", {"type": "test"})
    if n == 0:
        raise HTTPException(404, "No phone is registered for this account yet. Open the app, log in, and allow notifications")
    return {"sent": n}
