"""Push notifications to the Hill Booker app, through Firebase Cloud Messaging (FCM HTTP v1).

Needs the Firebase service account key file on the server (FIREBASE_CREDENTIALS_FILE). Without it everything here
does nothing, so bookings work exactly as before. Failures are logged and never block a booking."""
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request

from .config import settings
from .db import get_conn

log = logging.getLogger("hillbooker.push")
_lock = threading.Lock()
_cache = {"token": None, "until": 0.0, "project": None}


def enabled() -> bool:
    path = settings.firebase_credentials_file
    return bool(path) and os.path.isfile(path)


def _auth() -> tuple[str, str]:
    """(access token, project id). The access token lasts an hour; it is reused for about 50 minutes."""
    with _lock:
        if _cache["token"] and time.time() < _cache["until"]:
            return _cache["token"], _cache["project"]
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_file(
            settings.firebase_credentials_file, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        creds.refresh(Request())
        _cache.update(token=creds.token, until=time.time() + 3000, project=creds.project_id)
        return _cache["token"], _cache["project"]


def _send_one(device_token: str, title: str, body: str, data: dict) -> str:
    """Returns "ok", "dead" (this phone no longer takes messages: remove it) or "error"."""
    try:
        access, project = _auth()
        msg = {"message": {"token": device_token, "notification": {"title": title, "body": body},
                           "data": {str(k): str(v) for k, v in (data or {}).items()}, "android": {"priority": "HIGH"}}}
        req = urllib.request.Request(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            data=json.dumps(msg).encode(),
            headers={"Authorization": f"Bearer {access}", "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
        return "ok"
    except urllib.error.HTTPError as e:
        text = e.read()[:400].decode("utf-8", "replace")
        if e.code == 404 or "UNREGISTERED" in text or "registration-token-not-registered" in text:
            return "dead"
        log.warning("Push failed: %s %s", e.code, text)
    except Exception as e:  # network trouble must never break a booking
        log.warning("Push failed: %s", e)
    return "error"


def send_to_user(user_id: str, title: str, body: str, data: dict | None = None) -> int:
    """Sends to every phone this person is logged in on. Returns how many accepted it."""
    if not enabled() or not user_id:
        return 0
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT token FROM push_tokens WHERE user_id = %s ORDER BY last_seen DESC LIMIT 10", (str(user_id),))
        tokens = [r["token"] for r in cur.fetchall()]
    sent, dead = 0, []
    for t in tokens:
        res = _send_one(t, title, body, data or {})
        if res == "ok":
            sent += 1
        elif res == "dead":
            dead.append(t)
    if dead:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM push_tokens WHERE token = ANY(%s)", (dead,))
    return sent


def _bg(fn, *args) -> None:
    if enabled():
        threading.Thread(target=fn, args=args, daemon=True).start()


def _when(d) -> str:
    f = lambda x: f"{x:%d %b %Y}"
    return f(d["d1"]) if d["d1"] == d["d2"] else f"{f(d['d1'])} to {f(d['d2'])}"


def _booking(kind: str, booking_id: str, event: str) -> None:
    try:
        from . import notify

        d = notify._details(kind, booking_id)
        if not d:
            return
        data = {"type": "booking", "kind": kind, "id": booking_id}
        when = _when(d)
        guest = d["guest"] or "A guest"
        if event == "confirmed":
            send_to_user(d["host_id"], "New booking confirmed", f"{guest}: {d['item']}, {when}. The advance was paid online.", data)
            send_to_user(d["guest_id"], "Booking confirmed", f"Your booking at {d['item']} for {when} is confirmed.", data)
        elif event == "upi":
            send_to_user(d["host_id"], "Payment to check", f"{guest} says they paid by UPI for {d['item']}, {when}. Please check and confirm it in Payments.", data)
    except Exception as e:
        log.warning("Booking push failed: %s", e)


def booking_in_background(kind: str, booking_id, event: str = "confirmed") -> None:
    _bg(_booking, kind, str(booking_id), event)


def _cancelled(kind: str, booking_id: str) -> None:
    try:
        from . import notify

        d = notify._details(kind, booking_id)
        if d:
            send_to_user(d["host_id"], "Booking cancelled", f"{d['guest'] or 'A guest'} cancelled {d['item']}, {_when(d)}. The dates are open again.",
                         {"type": "booking", "kind": kind, "id": booking_id})
    except Exception as e:
        log.warning("Cancel push failed: %s", e)


def cancelled_in_background(kind: str, booking_id) -> None:
    _bg(_cancelled, kind, str(booking_id))
