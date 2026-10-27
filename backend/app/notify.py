"""WhatsApp alerts to hosts through Meta's WhatsApp Business Cloud API.

Needs four settings in the server's .env (see .env.prod.example). With WHATSAPP_TOKEN empty it does nothing,
so bookings work exactly as before until WhatsApp is set up. Failures are logged and never block a booking."""
import json
import logging
import re
import threading
import urllib.error
import urllib.request

from .config import settings
from .db import get_conn

log = logging.getLogger("hillbooker.notify")


def enabled() -> bool:
    return bool(settings.whatsapp_token and settings.whatsapp_phone_id)


def wa_number(phone: str | None) -> str:
    """Digits only, with India's 91 in front of a 10-digit number. Empty when there is no usable number."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return digits if 11 <= len(digits) <= 15 else ""


def _clean(text: str) -> str:
    """WhatsApp template values can't hold line breaks, tabs or long runs of spaces."""
    return re.sub(r"\s+", " ", str(text or "")).strip()[:300] or "-"


def _day(d) -> str:
    return f"{d:%d %b %Y}"


def _details(kind: str, booking_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        if kind == "stay":
            cur.execute(
                """SELECT h.phone AS host_phone, p.name AS item, g.name AS guest, g.phone AS guest_phone,
                          b.check_in AS d1, b.check_out AS d2, rt.name AS what, b.rooms AS qty, b.guests AS people,
                          b.total_amount, COALESCE(b.advance_amount, b.total_amount) AS advance
                   FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.owner_id
                   JOIN users g ON g.id = b.user_id JOIN room_types rt ON rt.id = b.room_type_id
                   WHERE b.id = %s""",
                (booking_id,),
            )
        else:
            cur.execute(
                """SELECT h.phone AS host_phone, v.name AS item, g.name AS guest, g.phone AS guest_phone,
                          b.start_date AS d1, b.end_date AS d2, COALESCE(t.title, 'Hire by the day') AS what,
                          b.count AS qty, b.passengers AS people, b.total_amount, b.advance_amount AS advance
                   FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users h ON h.id = v.operator_id
                   JOIN users g ON g.id = b.user_id LEFT JOIN vehicle_trips t ON t.id = b.trip_id WHERE b.id = %s""",
                (booking_id,),
            )
        return cur.fetchone()


def _send(to: str, params: list[str]) -> None:
    body = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": settings.whatsapp_template,
            "language": {"code": settings.whatsapp_lang},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": _clean(p)} for p in params]}],
        },
    }
    req = urllib.request.Request(
        f"https://graph.facebook.com/v20.0/{settings.whatsapp_phone_id}/messages",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {settings.whatsapp_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            r.read()
    except urllib.error.HTTPError as e:
        log.warning("WhatsApp send failed: %s %s", e.code, e.read()[:300])
    except Exception as e:  # network trouble must never break a booking
        log.warning("WhatsApp send failed: %s", e)


def _run(kind: str, booking_id: str, event: str) -> None:
    try:
        d = _details(kind, booking_id)
        if not d:
            return
        to = wa_number(d["host_phone"])
        if not to:
            return  # the host hasn't saved a WhatsApp number yet
        when = _day(d["d1"]) if d["d1"] == d["d2"] else f"{_day(d['d1'])} to {_day(d['d2'])}"
        unit = "room" if kind == "stay" else "vehicle"
        what = f"{d['what']}, {d['qty']} {unit}{'s' if d['qty'] != 1 else ''}, {d['people']} {'guests' if kind == 'stay' else 'passengers'}"
        money = f"Total Rs {d['total_amount']:,.0f}, advance Rs {d['advance']:,.0f}"
        status = (
            "CONFIRMED and paid online"
            if event == "confirmed"
            else "Guest says they paid you by UPI. Please check your account and confirm in Payments"
        )
        guest = f"{d['guest']} {d['guest_phone'] or ''}".strip()
        # Template body (create it in Meta Business Manager, in this order):
        # New booking on Hill Booker: {{1}}. Guest: {{2}}. Dates: {{3}}. {{4}}. {{5}}. Status: {{6}}.
        _send(to, [d["item"], guest, when, what, money, status])
    except Exception as e:
        log.warning("Host alert failed: %s", e)


def host_in_background(kind: str, booking_id, event: str = "confirmed") -> None:
    """Call right after a booking is confirmed (event "confirmed") or a UPI payment is reported (event "upi")."""
    if enabled():
        threading.Thread(target=_run, args=(kind, str(booking_id), event), daemon=True).start()
