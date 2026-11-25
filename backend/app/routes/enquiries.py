"""Group tour and corporate tour enquiries. Anyone can send one; only the admin reads them.
The owner is told on WhatsApp (when the template is set up) and by email (when SMTP is set up). Failures never block the form."""
import logging
import re
import smtplib
from datetime import date
from email.message import EmailMessage
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import notify, ratelimit
from ..auth import require_role
from ..config import settings
from ..db import get_conn

log = logging.getLogger("hillbooker.enquiries")
public = APIRouter(prefix="/enquiries", tags=["enquiries"])
admin = APIRouter(prefix="/admin/enquiries", tags=["admin"])
admin_only = require_role("admin")
LABEL = {"group": "Group tour", "corporate": "Corporate tour", "package": "Trip package", "trip": "Plan my trip"}


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
    elapsed_ms: Optional[int] = None  # how long the form was open: people take seconds, bots none


LINK = re.compile(r"(https?://|www\.|\b[a-z0-9-]+\.(com|net|org|in|co|io|biz|info|shop|site|xyz|online)\b)", re.I)
MIN_FILL_MS = 3000  # a person cannot read and fill the form faster than this


def spam_reason(body, phone: str) -> Optional[str]:
    """Why this looks like an advert rather than an enquiry. None means it looks real.
    Takes any of the enquiry forms (tour, trip, package), so every field is read defensively.
    Kept deliberately narrow: a wrongly flagged enquiry is worse than one spam row to delete."""
    g = lambda k: getattr(body, k, None)
    notes = (g("notes") or "").strip()
    trip_given = any([g("destination"), g("start_date"), g("people"), g("budget"), g("city"), g("package_id")])

    # Someone pitching a service: a link, and nothing at all about a trip.
    if notes and LINK.search(notes) and not trip_given:
        return "a link in the notes and no trip details"

    # Their own email domain turns up in the message: self-promotion, not an enquiry.
    if g("email") and "@" in g("email"):
        domain = g("email").split("@")[-1].strip().lower()
        if not trip_given and len(domain) > 3 and domain in f"{notes} {g('company') or ''} {g('name') or ''}".lower():
            return "the sender's own website is being advertised in the message"

    # Submitted faster than anyone can type.
    if g("elapsed_ms") is not None and 0 <= g("elapsed_ms") < MIN_FILL_MS:
        return "the form was submitted in under 3 seconds"

    return None


def blocked_reason(cur, email: Optional[str], phone: Optional[str]) -> Optional[str]:
    """Why this sender is on the blocklist. None means they are not.
    Checked before the rules above: a known advertiser is spam whatever they write this time."""
    email = (email or "").strip().lower()
    digits = re.sub(r"\D", "", phone or "")
    wanted = []
    if email and "@" in email:
        wanted.append(("email", email))
        wanted.append(("domain", email.split("@")[-1]))
    if digits:
        wanted.append(("phone", digits))
    if not wanted:
        return None
    cur.execute(
        "SELECT kind, value FROM enquiry_blocklist WHERE (kind, value) IN %s",
        (tuple(wanted),),
    )
    hit = cur.fetchone()
    if not hit:
        return None
    return {
        "domain": f"the domain {hit['value']} is blocked",
        "email": f"the address {hit['value']} is blocked",
        "phone": "this phone number is blocked",
    }[hit["kind"]]


def spam_check(cur, body, phone: str) -> Optional[str]:
    """The whole spam decision for any of the enquiry forms: blocklist first, then the rules."""
    return blocked_reason(cur, getattr(body, "email", None), phone) or spam_reason(body, phone)


def _mail(subject: str, text: str) -> None:
    """Emails the business address when SMTP is set up. Never raises."""
    to = settings.business_email
    if not (settings.smtp_host and settings.smtp_from and to):
        return
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"], msg["To"] = settings.smtp_from, to
        msg.set_content(text)
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) if settings.smtp_security == "ssl" else smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
        with server:
            if settings.smtp_security == "starttls":
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception:
        log.exception("Could not send an email to the business address")


def _email(row: dict) -> None:
    _mail(
        f"New {LABEL[row['kind']].lower()} enquiry: {row['name']}",
        "\n".join(f"{k}: {row.get(k) or '-'}" for k in ("name", "company", "phone", "email", "destination", "start_date", "people", "budget", "notes")),
    )


@public.post("", status_code=201)
def create_enquiry(body: EnquiryIn, request: Request):
    if body.website:  # a bot filled the hidden field: pretend it worked
        return {"ok": True}
    ratelimit.form_guard(request)
    phone = notify.wa_number(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid phone number")
    with get_conn() as conn, conn.cursor() as cur:
        # Kept, not thrown away, so a wrongly flagged enquiry can still be found under "spam".
        spam = spam_check(cur, body, phone)
        cur.execute("SELECT count(*) AS n FROM enquiries WHERE phone = %s AND created_at > now() - interval '1 hour'", (phone,))
        if cur.fetchone()["n"] >= 3:
            raise HTTPException(429, "We already have your enquiry. We will call you soon")
        cur.execute(
            """INSERT INTO enquiries (kind, name, company, phone, email, destination, start_date, people, budget, notes, status)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (body.kind, body.name.strip(), body.company, phone, body.email, body.destination, body.start_date, body.people, body.budget, body.notes,
             "spam" if spam else "new"),
        )
        row = cur.fetchone()
    if spam:
        # No WhatsApp, no email: the point is not to be interrupted by adverts.
        log.info("Enquiry marked as spam (%s): %s / %s", spam, row["name"], phone)
        return {"ok": True}  # the sender is told nothing, so a bot does not come back with a new wording
    notify.enquiry_in_background(row)
    _email(row)
    return {"ok": True}


@admin.get("")
def list_enquiries(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        # Spam last, so the real enquiries are what the admin sees first.
        cur.execute("SELECT * FROM enquiries ORDER BY (status = 'spam'), (status = 'new') DESC, created_at DESC LIMIT 500")
        return cur.fetchall()


class StatusIn(BaseModel):
    # 'spam' included: the dashboard offers it, and an advert the rules missed is marked by hand.
    status: Literal["new", "contacted", "won", "lost", "spam"]


@admin.put("/{enquiry_id}")
def set_status(enquiry_id: str, body: StatusIn, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE enquiries SET status = %s WHERE id = %s RETURNING id", (body.status, enquiry_id))
        if not cur.fetchone():
            raise HTTPException(404, "Enquiry not found")
    return {"id": enquiry_id, "status": body.status}


# --- Blocked senders -------------------------------------------------------
# Blocking by domain is the useful default: an advertiser who gets no reply from one
# address simply writes again from another at the same company.

class BlockIn(BaseModel):
    kind: Literal["domain", "email", "phone"]
    value: str = Field(min_length=3, max_length=160)
    note: Optional[str] = Field(default=None, max_length=200)


@admin.get("/blocklist/all")
def list_blocked(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM enquiry_blocklist ORDER BY created_at DESC")
        return cur.fetchall()


@admin.post("/blocklist/all", status_code=201)
def add_blocked(body: BlockIn, user: dict = Depends(admin_only)):
    value = body.value.strip().lower()
    if body.kind == "phone":
        value = re.sub(r"\D", "", value)
    elif body.kind == "domain":
        value = value.split("@")[-1].lstrip("@")  # paste a whole address, get the domain
    if len(value) < 3:
        raise HTTPException(422, "That is too short to block")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO enquiry_blocklist (kind, value, note) VALUES (%s, %s, %s)
               ON CONFLICT (kind, value) DO UPDATE SET note = COALESCE(EXCLUDED.note, enquiry_blocklist.note)
               RETURNING *""",
            (body.kind, value, body.note),
        )
        row = cur.fetchone()
        # Everything already sitting in the inbox from this sender becomes spam too.
        if body.kind == "domain":
            cur.execute("UPDATE enquiries SET status='spam' WHERE status <> 'spam' AND lower(email) LIKE %s", (f"%@{value}",))
        elif body.kind == "email":
            cur.execute("UPDATE enquiries SET status='spam' WHERE status <> 'spam' AND lower(email) = %s", (value,))
        else:
            cur.execute("UPDATE enquiries SET status='spam' WHERE status <> 'spam' AND regexp_replace(phone, '\\D', '', 'g') = %s", (value,))
        row["also_marked"] = cur.rowcount
    return row


@admin.delete("/blocklist/all/{block_id}")
def remove_blocked(block_id: str, user: dict = Depends(admin_only)):
    """Unblocks a sender. Enquiries already filed as spam stay as they are."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM enquiry_blocklist WHERE id = %s RETURNING id", (block_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Not on the blocklist")
    return {"id": block_id}
