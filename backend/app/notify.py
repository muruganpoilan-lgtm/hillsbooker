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
                """SELECT h.phone AS host_phone, h.name AS host_name, p.name AS item, g.name AS guest, g.phone AS guest_phone,
                          b.check_in AS d1, b.check_out AS d2, rt.name AS what, b.rooms AS qty, b.guests AS people, b.children AS kids,
                          b.total_amount, COALESCE(b.advance_amount, b.total_amount) AS advance
                   FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.owner_id
                   JOIN users g ON g.id = b.user_id JOIN room_types rt ON rt.id = b.room_type_id
                   WHERE b.id = %s""",
                (booking_id,),
            )
        else:
            cur.execute(
                """SELECT h.phone AS host_phone, h.name AS host_name, v.name AS item, g.name AS guest, g.phone AS guest_phone,
                          b.start_date AS d1, b.end_date AS d2, COALESCE(t.title, 'Hire by the day') AS what,
                          b.count AS qty, b.passengers AS people, 0 AS kids, b.total_amount, b.advance_amount AS advance
                   FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users h ON h.id = v.operator_id
                   JOIN users g ON g.id = b.user_id LEFT JOIN vehicle_trips t ON t.id = b.trip_id WHERE b.id = %s""",
                (booking_id,),
            )
        return cur.fetchone()


def _send(to: str, params: list[str], template: str | None = None, document: tuple[str, str] | None = None) -> None:
    """document is (link, filename): sent as the template's PDF header, so the guest gets the file itself."""
    components = []
    if document:
        components.append({"type": "header", "parameters": [{"type": "document", "document": {"link": document[0], "filename": document[1]}}]})
    components.append({"type": "body", "parameters": [{"type": "text", "text": _clean(p)} for p in params]})
    body = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template or settings.whatsapp_template,
            "language": {"code": settings.whatsapp_lang},
            "components": components,
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
        if kind == "stay":
            adults = d["people"] - d["kids"]
            who = f"{adults} adult{'s' if adults != 1 else ''}" + (f", {d['kids']} child{'ren' if d['kids'] != 1 else ''}" if d["kids"] else "")
        else:
            who = f"{d['people']} passengers"
        what = f"{d['what']}, {d['qty']} {unit}{'s' if d['qty'] != 1 else ''}, {who}"
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


def _guest_invoice(booking_id: str) -> None:
    try:
        from . import invoice

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT g.name AS guest, g.phone, p.name AS property, b.check_in, b.check_out
                   FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.user_id
                   WHERE b.id = %s AND b.status = 'confirmed'""",
                (booking_id,),
            )
            d = cur.fetchone()
        if not d:
            return
        to = wa_number(d["phone"])
        if not to:
            return  # the guest has no mobile number saved
        when = f"{_day(d['check_in'])} to {_day(d['check_out'])}"
        # Template (create it in Meta Business Manager): header type DOCUMENT (a PDF), body:
        # Hi {{1}}, your Hill Booker stay at {{2}} is confirmed for {{3}}. Your invoice is attached.
        safe = re.sub(r"[^A-Za-z0-9]+", "-", d["property"]).strip("-")[:40] or "Booking"
        _send(to, [d["guest"], d["property"], when], settings.whatsapp_invoice_template, (invoice.link_for(booking_id), f"Hill-Booker-Invoice-{safe}.pdf"))
    except Exception as e:
        log.warning("Guest invoice message failed: %s", e)


def guest_invoice_in_background(booking_id) -> None:
    """Sends the guest their invoice link on WhatsApp right after a stay is confirmed. Off until a template name is set."""
    if enabled() and settings.whatsapp_invoice_template:
        threading.Thread(target=_guest_invoice, args=(str(booking_id),), daemon=True).start()


def _host_copy(booking_id: str) -> None:
    try:
        from . import invoice

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT h.name AS host, h.phone AS host_phone, g.name AS guest, p.name AS property, b.check_in, b.check_out
                   FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users h ON h.id = p.owner_id
                   JOIN users g ON g.id = b.user_id WHERE b.id = %s AND b.status = 'confirmed'""",
                (booking_id,),
            )
            d = cur.fetchone()
        if not d:
            return
        to = wa_number(d["host_phone"])
        if not to:
            return
        when = f"{_day(d['check_in'])} to {_day(d['check_out'])}"
        # Template (create it in Meta Business Manager): header type DOCUMENT (a PDF), body:
        # Hi {{1}}, a booking at {{2}} is confirmed for {{3}}. Guest: {{4}}. Your copy of the invoice is attached.
        safe = re.sub(r"[^A-Za-z0-9]+", "-", d["property"]).strip("-")[:40] or "Booking"
        _send(to, [d["host"], d["property"], when, d["guest"]], settings.whatsapp_host_copy_template, (invoice.link_for(booking_id), f"Hill-Booker-Invoice-{safe}.pdf"))
    except Exception as e:
        log.warning("Owner copy failed: %s", e)


def host_copy_in_background(booking_id) -> None:
    """Sends the property owner a copy of the guest's invoice on WhatsApp. Off until a template name is set."""
    if enabled() and settings.whatsapp_host_copy_template:
        threading.Thread(target=_host_copy, args=(str(booking_id),), daemon=True).start()


def _cancelled(kind: str, booking_id: str, refund: dict) -> None:
    """Tell the host a confirmed booking was cancelled, so they can take the room or vehicle off their plan."""
    try:
        d = _details(kind, booking_id)
        if not d:
            return
        to = wa_number(d["host_phone"])
        if not to:
            return
        when = _day(d["d1"]) if d["d1"] == d["d2"] else f"{_day(d['d1'])} to {_day(d['d2'])}"
        guest = f"{d['guest']} {d['guest_phone'] or ''}".strip()
        st = (refund or {}).get("status")
        if st == "manual":
            note = "The guest paid you directly, so please return their advance to them"
        elif st in ("refunded", "pending"):
            note = "The guest's advance is being refunded by Hill Booker, nothing for you to do"
        else:
            note = "No refund is due to the guest"
        # Template body (create it in Meta Business Manager, in this order):
        # Hi {{1}}, a booking at {{2}} for {{3}} was cancelled by the guest ({{4}}). {{5}}. The dates are open for booking again.
        _send(to, [d["host_name"] or "there", d["item"], when, guest, note], template=settings.whatsapp_cancel_template)
    except Exception as e:
        log.warning("Host cancel alert failed: %s", e)


def cancel_in_background(kind: str, booking_id, refund: dict | None = None) -> None:
    if enabled() and settings.whatsapp_cancel_template:
        threading.Thread(target=_cancelled, args=(kind, str(booking_id), refund or {}), daemon=True).start()


def _enquiry(row: dict) -> None:
    try:
        to = wa_number(settings.enquiry_whatsapp_to)
        if not to:
            return
        label = "Group tour" if row["kind"] == "group" else "Corporate tour"
        who = f"{row['name']} {row['company'] or ''}".strip()
        when = _day(row["start_date"]) if row["start_date"] else "not given"
        # Template body (create it in Meta Business Manager, in this order):
        # New {{1}} enquiry on Hill Booker from {{2}}, phone {{3}}. Destination: {{4}}. Start date: {{5}}. People: {{6}}. Open your Hill Booker dashboard for the details.
        _send(to, [label, who, row["phone"], row["destination"] or "not given", when, str(row["people"] or "not given")], template=settings.whatsapp_enquiry_template)
    except Exception as e:
        log.warning("Enquiry alert failed: %s", e)


def enquiry_in_background(row: dict) -> None:
    if enabled() and settings.whatsapp_enquiry_template:
        threading.Thread(target=_enquiry, args=(dict(row),), daemon=True).start()
