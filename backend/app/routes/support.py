"""Customer-care tickets. Anyone can send one from the website; only the admin reads and answers them.
The team is told on WhatsApp (using the enquiry alert) and by email when those are set up. Failures never block the form."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import notify
from ..auth import require_role
from ..db import get_conn
from .enquiries import _mail

public = APIRouter(prefix="/support", tags=["support"])
admin = APIRouter(prefix="/admin/support", tags=["support (admin)"])
admin_only = require_role("admin")

Topic = Literal["booking", "payment", "cancellation", "vehicle", "host", "app", "other"]
TOPIC_LABEL = {
    "booking": "Booking help",
    "payment": "Payment or refund",
    "cancellation": "Cancellation",
    "vehicle": "Car or bike rental",
    "host": "Listing my property",
    "app": "App or website problem",
    "other": "Something else",
}


class TicketIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    topic: Topic
    booking_ref: Optional[str] = Field(default=None, max_length=40)
    message: str = Field(min_length=5, max_length=2000)
    website: Optional[str] = None  # hidden field for bots


def _clean(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


@public.post("", status_code=201)
def create_ticket(body: TicketIn):
    if body.website:
        return {"ticket_no": 0}
    phone = notify.wa_number(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid phone number")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM support_tickets WHERE phone = %s AND created_at > now() - interval '1 hour'", (phone,))
        if cur.fetchone()["n"] >= 5:
            raise HTTPException(429, "We already have your messages. We will contact you soon")
        cur.execute(
            """INSERT INTO support_tickets (name, phone, email, topic, booking_ref, message)
               VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
            (body.name.strip(), phone, _clean(body.email), body.topic, _clean(body.booking_ref), body.message.strip()),
        )
        row = cur.fetchone()
    # Reuses the enquiry alert: "New customer-care enquiry on Hill Booker from <name>, phone <phone>. Destination: <topic>."
    notify.enquiry_in_background(
        {"kind": "support", "name": row["name"], "company": None, "phone": phone, "destination": TOPIC_LABEL[row["topic"]], "start_date": None, "people": None}
    )
    _mail(
        f"Support ticket #{row['ticket_no']}: {TOPIC_LABEL[row['topic']]}",
        "\n".join(f"{k}: {row.get(k) or '-'}" for k in ("name", "phone", "email", "topic", "booking_ref", "message")),
    )
    return {"ticket_no": row["ticket_no"]}


@admin.get("")
def admin_list(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT * FROM support_tickets
               ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at DESC LIMIT 500"""
        )
        return cur.fetchall()


class TicketUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved"]
    admin_note: Optional[str] = Field(default=None, max_length=1000)


@admin.put("/{ticket_id}")
def admin_update(ticket_id: str, body: TicketUpdate, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE support_tickets SET status=%s, admin_note=%s, updated_at=now() WHERE id=%s RETURNING *",
            (body.status, _clean(body.admin_note), ticket_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Ticket not found")
        return row
