"""Trip packages. Guests browse them and send an enquiry (it lands in the enquiries list); only the admin makes and edits them."""
import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import notify
from ..auth import require_role
from ..db import get_conn
from .enquiries import _email
from .owner import _delete_photo, _upload_photos

public = APIRouter(prefix="/packages", tags=["packages"])
admin = APIRouter(prefix="/admin/packages", tags=["packages (admin)"])
admin_only = require_role("admin")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "package"


def _exists(cur, package_id: str, user: dict):
    cur.execute("SELECT id FROM packages WHERE id = %s", (package_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Package not found")


# ---------- guests ----------

@public.get("")
def list_packages(city: str = ""):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.slug, p.title, p.destination, p.nights, p.days, p.price_per_person, p.min_people, p.summary,
                      (SELECT url FROM package_photos WHERE package_id = p.id ORDER BY position LIMIT 1) AS photo
               FROM packages p
               WHERE p.active AND (%s = '' OR lower(p.destination) = lower(%s))
               ORDER BY p.position, p.created_at DESC""",
            (city.strip(), city.strip()),
        )
        return cur.fetchall()


@public.get("/{slug}")
def get_package(slug: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM packages WHERE slug = %s AND active", (slug,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Package not found")
        cur.execute("SELECT id, url FROM package_photos WHERE package_id = %s ORDER BY position", (p["id"],))
        p["photos"] = cur.fetchall()
        return p


class PackageEnquiryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    start_date: Optional[date] = None
    people: Optional[int] = Field(default=None, ge=1, le=500)
    notes: Optional[str] = Field(default=None, max_length=1000)
    website: Optional[str] = None  # hidden field for bots


@public.post("/{slug}/enquiry", status_code=201)
def package_enquiry(slug: str, body: PackageEnquiryIn):
    if body.website:
        return {"ok": True}
    phone = notify.wa_number(body.phone)
    if not phone:
        raise HTTPException(422, "Please enter a valid phone number")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, title FROM packages WHERE slug = %s AND active", (slug,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Package not found")
        cur.execute("SELECT count(*) AS n FROM enquiries WHERE phone = %s AND created_at > now() - interval '1 hour'", (phone,))
        if cur.fetchone()["n"] >= 3:
            raise HTTPException(429, "We already have your enquiry. We will call you soon")
        cur.execute(
            """INSERT INTO enquiries (kind, name, phone, email, destination, start_date, people, notes, package_id)
               VALUES ('package', %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (body.name.strip(), phone, body.email, p["title"], body.start_date, body.people, body.notes, p["id"]),
        )
        row = cur.fetchone()
    notify.enquiry_in_background(row)
    _email(row)
    return {"ok": True}


# ---------- admin ----------

class PackageIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    destination: str = Field(min_length=2, max_length=80)
    nights: int = Field(ge=0, le=30)
    days: int = Field(ge=1, le=31)
    price_per_person: float = Field(ge=0, le=10_000_000)
    min_people: int = Field(default=2, ge=1, le=500)
    summary: Optional[str] = Field(default=None, max_length=300)
    itinerary: Optional[str] = Field(default=None, max_length=6000)
    includes: Optional[str] = Field(default=None, max_length=2000)
    excludes: Optional[str] = Field(default=None, max_length=2000)
    position: int = Field(default=0, ge=0, le=9999)
    active: bool = True


@admin.get("")
def admin_list(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.*, (SELECT count(*) FROM enquiries e WHERE e.package_id = p.id) AS enquiries
               FROM packages p ORDER BY p.position, p.created_at DESC"""
        )
        return cur.fetchall()


@admin.get("/{package_id}")
def admin_get(package_id: str, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM packages WHERE id = %s", (package_id,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Package not found")
        cur.execute("SELECT id, url FROM package_photos WHERE package_id = %s ORDER BY position", (package_id,))
        p["photos"] = cur.fetchall()
        return p


def _clean(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


@admin.post("", status_code=201)
def admin_create(body: PackageIn, user: dict = Depends(admin_only)):
    base = _slugify(body.title)
    with get_conn() as conn, conn.cursor() as cur:
        slug, n = base, 1
        while True:
            cur.execute("SELECT 1 FROM packages WHERE slug = %s", (slug,))
            if not cur.fetchone():
                break
            n += 1
            slug = f"{base}-{n}"
        cur.execute(
            """INSERT INTO packages (slug, title, destination, nights, days, price_per_person, min_people, summary, itinerary,
                                     includes, excludes, position, active)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (slug, body.title.strip(), body.destination.strip(), body.nights, body.days, body.price_per_person, body.min_people,
             _clean(body.summary), _clean(body.itinerary), _clean(body.includes), _clean(body.excludes), body.position, body.active),
        )
        return cur.fetchone()


@admin.put("/{package_id}")
def admin_update(package_id: str, body: PackageIn, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE packages SET title=%s, destination=%s, nights=%s, days=%s, price_per_person=%s, min_people=%s, summary=%s,
                      itinerary=%s, includes=%s, excludes=%s, position=%s, active=%s WHERE id=%s RETURNING *""",
            (body.title.strip(), body.destination.strip(), body.nights, body.days, body.price_per_person, body.min_people,
             _clean(body.summary), _clean(body.itinerary), _clean(body.includes), _clean(body.excludes), body.position, body.active, package_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Package not found")
        return row


@admin.post("/{package_id}/photos", status_code=201)
def admin_upload_photos(package_id: str, files: list[UploadFile] = File(...), user: dict = Depends(admin_only)):
    return _upload_photos("package_photos", "package_id", package_id, f"packages/{package_id}", files, user, _exists)


@admin.delete("/{package_id}/photos/{photo_id}")
def admin_delete_photo(package_id: str, photo_id: int, user: dict = Depends(admin_only)):
    return _delete_photo("package_photos", "package_id", package_id, photo_id, user, _exists)
