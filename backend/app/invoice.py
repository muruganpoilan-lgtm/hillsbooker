"""Booking invoices: a PDF made on demand, a signed download link, and the email that carries it."""
import io
import logging
import os
import smtplib
import threading
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from email.message import EmailMessage

import jwt
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .config import settings
from .db import get_conn

log = logging.getLogger("invoice")


def rs(amount) -> str:
    """Rs. 1,23,456 in the Indian way of grouping. (The PDF's built-in font has no rupee sign.)"""
    v = int(Decimal(amount).quantize(Decimal(1)))
    s = str(abs(v))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if v < 0 else "") + "Rs. " + s


def day(d) -> str:
    return d.strftime("%d %b %Y")


# ---------- signed links ----------

def make_link_token(booking_id: str, days: int = 60) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=days)
    return jwt.encode({"sub": str(booking_id), "kind": "invoice", "exp": exp}, settings.jwt_secret, algorithm="HS256")


def booking_id_from_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return data["sub"] if data.get("kind") == "invoice" else None


def link_for(booking_id: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/invoices/{make_link_token(booking_id)}.pdf"


# ---------- data ----------

def load(cur, booking_id: str) -> dict | None:
    """Everything the invoice shows. Gives the booking its invoice number the first time."""
    cur.execute(
        """UPDATE bookings SET invoice_no = COALESCE(invoice_no,
               'HB-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('invoice_seq')::text, 6, '0'))
           WHERE id = %s AND status = 'confirmed' RETURNING invoice_no""",
        (booking_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    cur.execute(
        """SELECT b.id, b.invoice_no, b.check_in, b.check_out, b.rooms, b.guests, b.total_amount,
                  COALESCE(b.advance_amount, b.total_amount) AS advance_amount, b.created_at,
                  u.name AS guest, u.email AS guest_email, u.phone AS guest_phone,
                  h.name AS host_name, h.email AS host_email,
                  p.name AS property, p.address, p.city, rt.name AS room_type,
                  pay.provider_payment_id, pay.amount AS paid_amount, pay.updated_at AS paid_at
           FROM bookings b
           JOIN users u ON u.id = b.user_id
           JOIN properties p ON p.id = b.property_id
           JOIN users h ON h.id = p.owner_id
           JOIN room_types rt ON rt.id = b.room_type_id
           LEFT JOIN payments pay ON pay.booking_id = b.id AND pay.status = 'paid'
           WHERE b.id = %s""",
        (booking_id,),
    )
    return cur.fetchone()


# ---------- the PDF ----------

def build_pdf(d: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    left, right = 48, W - 48
    green, ink, soft = (0.055, 0.42, 0.345), (0.09, 0.13, 0.23), (0.29, 0.33, 0.44)

    c.setFillColorRGB(*green)
    c.rect(0, H - 90, W, 90, stroke=0, fill=1)
    name_x = left
    logo = os.path.join(os.path.dirname(__file__), "assets", "logo_mark.png")
    if os.path.exists(logo):
        c.setFillColorRGB(0.98, 0.976, 0.957)
        c.roundRect(left, H - 74, 96, 58, 6, stroke=0, fill=1)
        c.drawImage(logo, left + 6, H - 72, width=84, height=54, preserveAspectRatio=True, mask="auto")
        name_x = left + 110
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 24)
    c.drawString(name_x, H - 52, settings.business_name)
    c.setFont("Helvetica", 11)
    c.drawRightString(right, H - 46, "BOOKING INVOICE")
    c.drawRightString(right, H - 62, d["invoice_no"])

    y = H - 120
    c.setFillColorRGB(*soft)
    c.setFont("Helvetica", 9)
    for line in [settings.business_address, settings.business_email, settings.business_phone]:
        if line:
            c.drawString(left, y, line)
            y -= 12
    c.drawRightString(right, H - 112, "Date: " + day(datetime.now(timezone.utc).astimezone()))

    def block(title, lines, x, y0):
        c.setFillColorRGB(*soft)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x, y0, title)
        c.setFillColorRGB(*ink)
        yy = y0 - 16
        for i, line in enumerate(lines):
            c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 11 if i == 0 else 10)
            c.drawString(x, yy, str(line)[:46])
            yy -= 14
        return yy

    top = min(y, H - 150) - 14
    block("BILLED TO", [d["guest"], d["guest_email"], d["guest_phone"] or ""], left, top)
    place = [d["property"], d["address"] or "", d["city"]]
    block("PROPERTY", [x for x in place if x], W / 2 + 10, top)

    ty = top - 84
    c.setStrokeColorRGB(0.84, 0.87, 0.84)
    c.setFillColorRGB(0.957, 0.965, 0.949)
    c.rect(left, ty - 6, right - left, 22, stroke=0, fill=1)
    c.setFillColorRGB(*ink)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 8, ty + 1, "Booking")
    c.drawRightString(right - 8, ty + 1, "Amount")

    nights = (d["check_out"] - d["check_in"]).days
    rows = [
        ("Room", d["room_type"]),
        ("Check-in", day(d["check_in"])),
        ("Check-out", day(d["check_out"])),
        ("Stay", f"{nights} night{'s' if nights != 1 else ''}, {d['rooms']} room{'s' if d['rooms'] != 1 else ''}, {d['guests']} guest{'s' if d['guests'] != 1 else ''}"),
    ]
    yy = ty - 24
    c.setFont("Helvetica", 10)
    for k, v in rows:
        c.setFillColorRGB(*soft)
        c.drawString(left + 8, yy, k)
        c.setFillColorRGB(*ink)
        c.drawString(left + 110, yy, v)
        yy -= 16

    yy -= 6
    c.line(left, yy + 8, right, yy + 8)
    total, adv = Decimal(d["total_amount"]), Decimal(d["advance_amount"])
    paid_online = d["paid_amount"] is not None
    c.setFont("Helvetica", 10)
    amounts = [("Total for the stay", rs(total), False)]
    if paid_online:
        amounts.append((f"Paid online" + (f" (payment {d['provider_payment_id']})" if d["provider_payment_id"] else ""), rs(d["paid_amount"]), False))
        due = total - Decimal(d["paid_amount"])
    else:
        amounts.append(("Paid online", "none recorded", False))
        due = total
    amounts.append(("Balance to pay at the property", rs(due), True))
    yy -= 8
    for k, v, bold in amounts:
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10)
        c.setFillColorRGB(*ink)
        c.drawString(left + 8, yy, k)
        c.drawRightString(right - 8, yy, v)
        yy -= 18

    yy -= 12
    c.setFillColorRGB(*soft)
    c.setFont("Helvetica", 9)
    notes = [
        "Thank you for booking with " + settings.business_name + ".",
        "Please show this invoice or your booking number at check-in. The balance is paid directly to the property.",
        f"Booking reference: {str(d['id'])[:8].upper()}   Booked on {day(d['created_at'])}",
        "This is a receipt for the booking. It is not a tax invoice.",
    ]
    for n in notes:
        c.drawString(left, yy, n)
        yy -= 13
    c.showPage()
    c.save()
    return buf.getvalue()


# ---------- email ----------

def email_enabled() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send_email(d: dict, pdf: bytes, to_host: bool = False) -> bool:
    """Emails the invoice PDF to the guest, or (to_host) a copy of it to the property owner."""
    if not email_enabled():
        return False
    msg = EmailMessage()
    nights = (d["check_out"] - d["check_in"]).days
    stay = f"Check-in {day(d['check_in'])}, check-out {day(d['check_out'])} ({nights} night{'s' if nights != 1 else ''})."
    if to_host:
        msg["Subject"] = f"New booking at {d['property']}: {d['guest']}, {day(d['check_in'])}"
        msg["To"] = d["host_email"]
        msg.set_content(
            f"Hello {d['host_name']},\n\n"
            f"A booking at {d['property']} is confirmed.\n"
            f"Guest: {d['guest']}{' (' + d['guest_phone'] + ')' if d.get('guest_phone') else ''}\n"
            f"{d['room_type']}, {d['rooms']} room(s), {d['guests']} guest(s). {stay}\n"
            f"Invoice {d['invoice_no']} is attached as your copy.\n\n"
            f"{settings.business_name}\n"
        )
    else:
        msg["Subject"] = f"Your {settings.business_name} invoice {d['invoice_no']}"
        msg["To"] = d["guest_email"]
        msg.set_content(
            f"Hello {d['guest']},\n\n"
            f"Your booking at {d['property']} is confirmed.\n"
            f"{stay}\n"
            f"Your invoice {d['invoice_no']} is attached.\n\n"
            f"{settings.business_name}\n"
        )
    msg["From"] = settings.smtp_from
    msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=f"{d['invoice_no']}.pdf")
    try:
        if settings.smtp_security == "ssl":
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            if settings.smtp_security == "starttls":
                server.starttls()
        with server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:  # an email problem must never break a booking
        log.exception("Could not email invoice %s", d["invoice_no"])
        return False


def email_invoice(booking_id: str, copy_to_host: bool = False) -> bool:
    with get_conn() as conn, conn.cursor() as cur:
        d = load(cur, booking_id)
    if not d:
        return False
    pdf = build_pdf(d)
    ok = send_email(d, pdf)
    if copy_to_host and d.get("host_email"):
        send_email(d, pdf, to_host=True)  # the owner's copy; a failure here never blocks the guest's
    return ok


def email_in_background(booking_id: str) -> None:
    """Called right after a booking is confirmed. Runs on its own thread so the guest never waits for the mail server."""
    if email_enabled():
        threading.Thread(target=email_invoice, args=(str(booking_id), True), daemon=True).start()
