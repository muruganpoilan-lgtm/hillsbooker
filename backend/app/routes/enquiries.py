"""Group tour and corporate tour enquiries. Anyone can send one; only the admin reads them.
The owner is told on WhatsApp (when the template is set up) and by email (when SMTP is set up). Failures never block the form."""
import logging
import smtplib
from datetime import date
from email.message import EmailMessage
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import notify
from ..auth import require_role
from ..config import settings
from ..db import get_conn

log = logging.getLogger("hillbooker.enquiries")
public = APIRouter(prefix="/enquiries", tags=["enquiries"])
admin = APIRouter(prefix="/admin/enquiries", tags=["admin"])
admin_only = require_role("admin")
LABEL = {"group": "Group tour", "corporate": "Corporate tour"}


class EnquiryIn(BaseModel):
    kind: Literal["group", "corporate"]
    name: str = Field(min_length=2, max_length=80)
    company: Optional[str] = Field(default=None, max_length=120)
    phone: str = Field(min_length=7, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    destination: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[date] = None
    people: Optional[int] = Field(default=None, ge=1, le=5000)
    budget: Optional[str] = Field(default=None, max_length=60)
    notes: Optional[str] = Field(default=None, max_length=1000)
    website: Optional[str] = None  # hidden field: real people leave it empty, form-filling bots don't


def _email(row: dict) -> None:
    to = settings.business_email
    if not (settings.smtp_host and settings.smtp_from and to):
        return
    try:
        msg = EmailMessage()
        msg["Subject"] = f"New {LABEL[row['kind']].lower()} enquiry: {row['name']}"
        msg["From"], msg["To"] = settings.smtp_from, to
        msg.set_content(
            "\n".join(f"{k}: {row.get(k) or '-'}" for k in ("name", "company", "phone", "email", "destination", "start_date", "people", "budget", "notes"))
        )
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) if settings.smtp_security == "ssl" else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if settings.smtp_security == "starttls":
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception:
        log.exception("Could not email an enquiry")


@public.post("", status_code=201)
def create_enquiry(body: EnquiryIn):
    if body.website:  # a bot filled the hidden field: pretend it worked
        return {"ok": True}
    phone = notify.wa_number(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid phone number")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM enquiries WHERE phone = %s AND created_at > now() - interval '1 hour'", (phone,))
        if cur.fetchone()["n"] >= 3:
            raise HTTPException(429, "We already have your enquiry. We will call you soon")
        cur.execute(
            """INSERT INTO enquiries (kind, name, company, phone, email, destination, start_date, people, budget, notes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (body.kind, body.name.strip(), body.company, phone, body.email, body.destination, body.start_date, body.people, body.budget, body.notes),
        )
        row = cur.fetchone()
    notify.enquiry_in_background(row)
    _email(row)
    return {"ok": True}


@admin.get("")
def list_enquiries(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM enquiries ORDER BY (status = 'new') DESC, created_at DESC LIMIT 500")
        return cur.fetchall()


class StatusIn(BaseModel):
    status: Literal["new", "contacted", "won", "lost"]


@admin.put("/{enquiry_id}")
def set_status(enquiry_id: str, body: StatusIn, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE enquiries SET status = %s WHERE id = %s RETURNING id", (body.status, enquiry_id))
        if not cur.fetchone():
            raise HTTPException(404, "Enquiry not found")
    return {"id": enquiry_id, "status": body.status}
