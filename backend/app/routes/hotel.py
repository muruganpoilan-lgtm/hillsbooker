"""Manage my hotel: a free hotel management tool for hosts.

Rooms, a guest register (Hill Booker bookings plus walk-in guests), staff records, attendance and salary.
Everything here is private to the account that holds the property. Unlike the listing pages, an admin gets
no extra access: staff and salary records are the hotel's own business.
"""
import io
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

from ..auth import require_role
from ..db import get_conn

router = APIRouter(prefix="/hotel", tags=["manage my hotel"])
host = require_role("owner", "operator", "admin")
IST = ZoneInfo("Asia/Kolkata")

MAX_ROOMS = 500
MAX_STAFF = 300
MAX_MONEY = Decimal("10000000")
ZERO = Decimal(0)

RoomStatus = Literal["free", "occupied", "cleaning", "repair"]
IdType = Literal["aadhaar", "voter", "driving", "passport", "pan", "other"]
ID_NAMES = {"aadhaar": "Aadhaar (last 4 digits)", "voter": "Voter ID", "driving": "Driving licence", "passport": "Passport",
            "pan": "PAN card", "other": "Other ID"}
MAX_NIGHTS = 366
AttendanceStatus = Literal["present", "absent", "half", "leave"]


def _today() -> date:
    return datetime.now(IST).date()


def _clean(v: str | None) -> str | None:
    """Trim text; empty text becomes nothing."""
    if v is None:
        return None
    v = v.strip()
    return v or None


def _check_id(id_type: str | None, id_number: str | None) -> None:
    """Hotels are not allowed to keep full Aadhaar numbers, so only the last 4 digits (masked Aadhaar) are accepted."""
    if id_number and not id_type:
        raise HTTPException(400, "Choose the type of ID proof")
    if id_type == "aadhaar" and id_number and not (len(id_number) == 4 and id_number.isdigit()):
        raise HTTPException(400, "For Aadhaar, enter only the last 4 digits")


# ---------- walk-in guests and the rooms on sale online ----------
# A walk-in guest in a room takes one room of that room type out of room_inventory for each night of the stay,
# so Hill Booker cannot sell it again. hotel_guest_nights remembers which nights, so they can be given back.

def _release_nights(cur, guest_id, from_day: date | None = None) -> None:
    """Give a walk-in guest's nights (today onwards, or from_day onwards) back to the rooms on sale."""
    start = max(from_day or _today(), _today())
    cur.execute(
        """SELECT n.day, n.room_type_id, n.applied, rt.total_rooms FROM hotel_guest_nights n
           JOIN room_types rt ON rt.id = n.room_type_id WHERE n.guest_id = %s AND n.day >= %s ORDER BY n.day""",
        (str(guest_id), start),
    )
    rows = cur.fetchall()
    applied = [r["day"] for r in rows if r["applied"]]
    if applied:
        rt, total = str(rows[0]["room_type_id"]), rows[0]["total_rooms"]
        cur.execute("SELECT day FROM room_inventory WHERE room_type_id = %s AND day = ANY(%s::date[]) ORDER BY day FOR UPDATE", (rt, applied))
        cur.fetchall()
        # Never open more than is really free: all rooms, minus bookings, other sites' nights and other walk-in guests.
        cur.execute(
            """UPDATE room_inventory ri SET available = LEAST(ri.available + 1, GREATEST(%(total)s
                   - (SELECT COALESCE(SUM(b.rooms), 0) FROM bookings b WHERE b.room_type_id = ri.room_type_id
                        AND b.status IN ('held', 'confirmed') AND b.check_in <= ri.day AND b.check_out > ri.day)
                   - (SELECT COALESCE(SUM(x.wanted), 0) FROM external_nights x WHERE x.room_type_id = ri.room_type_id AND x.day = ri.day)
                   - (SELECT count(*) FROM hotel_guest_nights n WHERE n.room_type_id = ri.room_type_id AND n.day = ri.day
                        AND n.guest_id <> %(g)s), 0))
               WHERE ri.room_type_id = %(rt)s AND ri.day = ANY(%(days)s::date[]) AND NOT ri.blocked""",
            {"total": total, "g": str(guest_id), "rt": rt, "days": applied},
        )
    cur.execute("DELETE FROM hotel_guest_nights WHERE guest_id = %s AND day >= %s", (str(guest_id), start))


def _hold_nights(cur, guest_id, room_id, check_in: date, check_out: date) -> list[date]:
    """Take the guest's nights (today onwards) out of the rooms on sale. Returns the nights on which no room of
    that type was open any more: on those, an online guest may already have the room."""
    if not room_id:
        return []
    cur.execute("SELECT room_type_id FROM hotel_rooms WHERE id = %s", (str(room_id),))
    row = cur.fetchone()
    if not row or not row["room_type_id"]:
        return []
    rt = str(row["room_type_id"])
    day, days = max(check_in, _today()), []
    while day < check_out:
        days.append(day)
        day += timedelta(days=1)
    if not days:
        return []
    cur.execute(
        "SELECT day, available, blocked FROM room_inventory WHERE room_type_id = %s AND day = ANY(%s::date[]) ORDER BY day FOR UPDATE",
        (rt, days),
    )
    inv = {r["day"]: r for r in cur.fetchall()}
    full = []
    for d in days:
        r = inv.get(d)
        took = bool(r and r["available"] > 0)
        if took:
            cur.execute("UPDATE room_inventory SET available = available - 1 WHERE room_type_id = %s AND day = %s", (rt, d))
        elif r and not r["blocked"]:
            full.append(d)  # the night was on sale and every room is already taken
        cur.execute(
            """INSERT INTO hotel_guest_nights (guest_id, room_type_id, day, applied) VALUES (%s, %s, %s, %s)
               ON CONFLICT (guest_id, day) DO UPDATE SET room_type_id = EXCLUDED.room_type_id, applied = EXCLUDED.applied""",
            (str(guest_id), rt, d, took),
        )
    return full


def apply_waiting_holds(cur, room_type_id, start: date, end: date) -> None:
    """Called when rooms come back on sale (a cancelled or expired booking). A walk-in guest who could not take a
    night out of the rooms on sale, because none was open then, takes it now."""
    cur.execute(
        """SELECT n.guest_id, n.day FROM hotel_guest_nights n
           JOIN room_inventory ri ON ri.room_type_id = n.room_type_id AND ri.day = n.day
           WHERE n.room_type_id = %s AND n.day >= %s AND n.day < %s AND NOT n.applied AND ri.available > 0 AND NOT ri.blocked
           ORDER BY n.day FOR UPDATE OF ri""",
        (str(room_type_id), start, end),
    )
    for n in cur.fetchall():
        cur.execute(
            "UPDATE room_inventory SET available = available - 1 WHERE room_type_id = %s AND day = %s AND available > 0 RETURNING day",
            (str(room_type_id), n["day"]),
        )
        if cur.fetchone():
            cur.execute("UPDATE hotel_guest_nights SET applied = true WHERE guest_id = %s AND day = %s", (str(n["guest_id"]), n["day"]))


def _room_is_taken(cur, room_id, check_in: date, check_out: date, skip_guest=None, skip_booking=None) -> str | None:
    """The name of a guest already in this room for overlapping dates, if any."""
    args = {"r": str(room_id), "in": check_in, "out": check_out}
    not_me = ""
    if skip_guest:
        not_me, args["sg"] = " AND g.id <> %(sg)s", str(skip_guest)
    cur.execute(
        f"""SELECT g.name FROM hotel_guests g
            WHERE g.room_id = %(r)s AND g.checked_out_at IS NULL AND g.check_in < %(out)s AND g.check_out > %(in)s{not_me} LIMIT 1""",
        args,
    )
    row = cur.fetchone()
    if row:
        return row["name"]
    args.pop("sg", None)
    not_me = ""
    if skip_booking:
        not_me, args["sb"] = " AND b.id <> %(sb)s", str(skip_booking)
    cur.execute(
        f"""SELECT u.name FROM hotel_booking_extras e
            JOIN bookings b ON b.id = e.booking_id JOIN users u ON u.id = b.user_id
            WHERE e.room_id = %(r)s AND e.checked_out_at IS NULL AND b.status = 'confirmed'
              AND b.check_in < %(out)s AND b.check_out > %(in)s{not_me} LIMIT 1""",
        args,
    )
    row = cur.fetchone()
    return row["name"] if row else None


def _mark_room(cur, room_id, status: str) -> None:
    cur.execute("UPDATE hotel_rooms SET status = %s WHERE id = %s", (status, str(room_id)))


# ---------- who may see what ----------

def _mine(cur, property_id, user: dict) -> dict:
    cur.execute("SELECT id, owner_id, name FROM properties WHERE id = %s AND status <> 'removed'", (str(property_id),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Property not found")
    if str(row["owner_id"]) != user["id"]:
        raise HTTPException(403, "That's not your property")
    return row


def _my_room(cur, room_id, user: dict) -> dict:
    cur.execute("SELECT id, property_id, label FROM hotel_rooms WHERE id = %s", (str(room_id),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Room not found")
    _mine(cur, row["property_id"], user)
    return row


def _my_guest(cur, guest_id, user: dict) -> dict:
    cur.execute("SELECT * FROM hotel_guests WHERE id = %s", (str(guest_id),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Guest not found")
    _mine(cur, row["property_id"], user)
    return row


def _my_staff(cur, staff_id, user: dict) -> dict:
    cur.execute("SELECT * FROM hotel_staff WHERE id = %s", (str(staff_id),))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Staff member not found")
    _mine(cur, row["property_id"], user)
    return row


def _room_in_property(cur, room_id, property_id) -> None:
    cur.execute("SELECT 1 FROM hotel_rooms WHERE id = %s AND property_id = %s", (str(room_id), str(property_id)))
    if not cur.fetchone():
        raise HTTPException(400, "That room is not in this property")


def _room_type_in_property(cur, room_type_id, property_id) -> None:
    cur.execute("SELECT 1 FROM room_types WHERE id = %s AND property_id = %s", (str(room_type_id), str(property_id)))
    if not cur.fetchone():
        raise HTTPException(400, "That room type is not in this property")


@router.get("/properties")
def my_hotels(user: dict = Depends(host)):
    """The properties this account can manage here."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, city, type FROM properties WHERE owner_id = %s AND status <> 'removed' ORDER BY created_at",
            (user["id"],),
        )
        return cur.fetchall()


# ---------- rooms ----------

class RoomIn(BaseModel):
    label: str = Field(min_length=1, max_length=30)
    room_type_id: UUID | None = None
    note: str | None = Field(default=None, max_length=200)


class RoomUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=30)
    room_type_id: UUID | None = None
    status: RoomStatus | None = None
    note: str | None = Field(default=None, max_length=200)


@router.get("/{property_id}/rooms")
def list_rooms(property_id: UUID, user: dict = Depends(host)):
    """Every room with its status and who is staying in it today, plus today's Hill Booker bookings by room type."""
    today = _today()
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute(
            """SELECT r.id, r.label, r.status, r.note, r.room_type_id, rt.name AS room_type,
                      rt.base_price, rt.max_guests, rt.bed_type, rt.bed_count,
                      g.kind AS guest_kind, g.id AS guest_id, g.name AS guest_name, g.phone AS guest_phone,
                      g.check_out AS guest_until, g.balance AS guest_balance
               FROM hotel_rooms r
               LEFT JOIN room_types rt ON rt.id = r.room_type_id
               LEFT JOIN LATERAL (
                 -- Who is in the room now. A guest leaving today stays on the card until "Check out" is pressed.
                 SELECT x.* FROM (
                   SELECT 'walkin' AS kind, hg.id, hg.name, hg.phone, hg.check_out, hg.total_amount - hg.paid_amount AS balance
                     FROM hotel_guests hg
                    WHERE hg.room_id = r.id AND hg.checked_out_at IS NULL AND hg.check_in <= %(today)s AND hg.check_out >= %(today)s
                   UNION ALL
                   SELECT 'hillbooker', b.id, u.name, u.phone, b.check_out,
                          b.total_amount - COALESCE(b.advance_amount, b.total_amount) - e.collected
                     FROM hotel_booking_extras e
                     JOIN bookings b ON b.id = e.booking_id JOIN users u ON u.id = b.user_id
                    WHERE e.room_id = r.id AND e.checked_out_at IS NULL AND b.status = 'confirmed'
                      AND b.check_in <= %(today)s AND b.check_out >= %(today)s
                 ) x ORDER BY x.check_out LIMIT 1
               ) g ON true
               WHERE r.property_id = %(p)s
               ORDER BY lower(regexp_replace(r.label, '\\d+', '', 'g')),
                        NULLIF(regexp_replace(r.label, '\\D', '', 'g'), '')::numeric NULLS LAST, lower(r.label)""",
            {"p": str(property_id), "today": today},
        )
        rooms = cur.fetchall()
        cur.execute(
            """SELECT rt.id, rt.name, rt.total_rooms,
                      (SELECT COALESCE(SUM(b.rooms), 0) FROM bookings b
                        WHERE b.room_type_id = rt.id AND b.status = 'confirmed'
                          AND b.check_in <= %(today)s AND b.check_out > %(today)s) AS booked_today,
                      (SELECT count(*) FROM hotel_rooms r WHERE r.room_type_id = rt.id) AS listed
               FROM room_types rt WHERE rt.property_id = %(p)s ORDER BY rt.base_price, rt.name""",
            {"p": str(property_id), "today": today},
        )
        types = cur.fetchall()
        # Hill Booker guests who are due in (or already staying) and have not been given a room yet.
        cur.execute(
            """SELECT b.id, u.name, u.phone, b.check_in, b.check_out, b.guests AS people, b.rooms, b.room_type_id, rt.name AS room_type,
                      b.total_amount - COALESCE(b.advance_amount, b.total_amount) - COALESCE(e.collected, 0) AS balance
               FROM bookings b JOIN users u ON u.id = b.user_id JOIN room_types rt ON rt.id = b.room_type_id
               LEFT JOIN hotel_booking_extras e ON e.booking_id = b.id
               WHERE b.property_id = %(p)s AND b.status = 'confirmed' AND b.check_in <= %(today)s AND b.check_out > %(today)s
                 AND e.room_id IS NULL AND e.checked_out_at IS NULL
               ORDER BY b.check_in, u.name""",
            {"p": str(property_id), "today": today},
        )
        arrivals = cur.fetchall()
    return {"today": today, "rooms": rooms, "room_types": types, "arrivals": arrivals}


@router.post("/{property_id}/rooms", status_code=201)
def add_room(property_id: UUID, body: RoomIn, user: dict = Depends(host)):
    label = _clean(body.label)
    if not label:
        raise HTTPException(400, "Give the room a name or number")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        if body.room_type_id:
            _room_type_in_property(cur, body.room_type_id, property_id)
        cur.execute("SELECT count(*) AS n FROM hotel_rooms WHERE property_id = %s", (str(property_id),))
        if cur.fetchone()["n"] >= MAX_ROOMS:
            raise HTTPException(400, f"A property can have up to {MAX_ROOMS} rooms here")
        cur.execute(
            """INSERT INTO hotel_rooms (property_id, room_type_id, label, note) VALUES (%s, %s, %s, %s)
               ON CONFLICT DO NOTHING RETURNING id""",
            (str(property_id), str(body.room_type_id) if body.room_type_id else None, label, _clean(body.note)),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(409, f"There is already a room called {label}")
        return {"id": row["id"]}


@router.post("/{property_id}/rooms/auto", status_code=201)
def add_rooms_from_types(property_id: UUID, user: dict = Depends(host)):
    """Create the missing rooms from the listing: a room type with 4 rooms gets "Name 1" to "Name 4"."""
    made = 0
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT lower(label) AS l FROM hotel_rooms WHERE property_id = %s", (str(property_id),))
        taken = {r["l"] for r in cur.fetchall()}
        cur.execute(
            """SELECT rt.id, rt.name, rt.total_rooms, (SELECT count(*) FROM hotel_rooms r WHERE r.room_type_id = rt.id) AS listed
               FROM room_types rt WHERE rt.property_id = %s ORDER BY rt.base_price, rt.name""",
            (str(property_id),),
        )
        for rt in cur.fetchall():
            need = rt["total_rooms"] - rt["listed"]
            n = 0
            while need > 0 and len(taken) < MAX_ROOMS and n < 2000:
                n += 1
                label = f"{rt['name'][:24].strip()} {n}"
                if label.lower() in taken:
                    continue
                cur.execute(
                    "INSERT INTO hotel_rooms (property_id, room_type_id, label) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id",
                    (str(property_id), str(rt["id"]), label),
                )
                if cur.fetchone():
                    made += 1
                    need -= 1
                taken.add(label.lower())
    return {"created": made}


@router.patch("/rooms/{room_id}")
def update_room(room_id: UUID, body: RoomUpdate, user: dict = Depends(host)):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        room = _my_room(cur, room_id, user)
        if "label" in changes:
            changes["label"] = _clean(changes["label"])
            if not changes["label"]:
                raise HTTPException(400, "Give the room a name or number")
            cur.execute(
                "SELECT 1 FROM hotel_rooms WHERE property_id = %s AND lower(label) = lower(%s) AND id <> %s",
                (str(room["property_id"]), changes["label"], str(room_id)),
            )
            if cur.fetchone():
                raise HTTPException(409, f"There is already a room called {changes['label']}")
        if "status" in changes and changes["status"] is None:
            raise HTTPException(400, "Choose a status")
        if "room_type_id" in changes and changes["room_type_id"] is not None:
            _room_type_in_property(cur, changes["room_type_id"], room["property_id"])
            changes["room_type_id"] = str(changes["room_type_id"])
        if "note" in changes:
            changes["note"] = _clean(changes["note"])
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_rooms SET {sets} WHERE id = %s", (*changes.values(), str(room_id)))
    return {"id": str(room_id), "updated": list(changes)}


@router.delete("/rooms/{room_id}")
def delete_room(room_id: UUID, user: dict = Depends(host)):
    """Removes the room from the board. Guests who stayed in it stay in the register, without a room."""
    with get_conn() as conn, conn.cursor() as cur:
        _my_room(cur, room_id, user)
        cur.execute("DELETE FROM hotel_rooms WHERE id = %s", (str(room_id),))
    return {"deleted": str(room_id)}


# ---------- guest register ----------

class GuestIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    check_in: date
    check_out: date
    room_id: UUID | None = None
    people: int = Field(default=1, ge=1, le=50)
    total_amount: Decimal = Field(default=ZERO, ge=0, le=MAX_MONEY, decimal_places=2)
    paid_amount: Decimal = Field(default=ZERO, ge=0, le=MAX_MONEY, decimal_places=2)
    note: str | None = Field(default=None, max_length=300)
    address: str | None = Field(default=None, max_length=300)
    id_type: IdType | None = None
    id_number: str | None = Field(default=None, max_length=30)

    @model_validator(mode="after")
    def _check(self):
        if self.check_out <= self.check_in:
            raise ValueError("Check-out must be after check-in")
        if (self.check_out - self.check_in).days > MAX_NIGHTS:
            raise ValueError("A stay can be up to one year long")
        if self.paid_amount > self.total_amount:
            raise ValueError("The amount paid is more than the total")
        return self


class GuestUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    check_in: date | None = None
    check_out: date | None = None
    room_id: UUID | None = None
    people: int | None = Field(default=None, ge=1, le=50)
    total_amount: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, decimal_places=2)
    paid_amount: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, decimal_places=2)
    note: str | None = Field(default=None, max_length=300)
    address: str | None = Field(default=None, max_length=300)
    id_type: IdType | None = None
    id_number: str | None = Field(default=None, max_length=30)


class BookingExtraIn(BaseModel):
    room_id: UUID | None = None
    collected: Decimal = Field(default=ZERO, ge=0, le=MAX_MONEY, decimal_places=2)
    note: str | None = Field(default=None, max_length=300)
    address: str | None = Field(default=None, max_length=300)
    id_type: IdType | None = None
    id_number: str | None = Field(default=None, max_length=30)


class BookingRoomIn(BaseModel):
    room_id: UUID


def _range(date_from: str | None, date_to: str | None) -> tuple[date, date]:
    today = _today()
    try:
        start = date.fromisoformat(date_from) if date_from else today - timedelta(days=30)
        end = date.fromisoformat(date_to) if date_to else today + timedelta(days=60)
    except ValueError:
        raise HTTPException(400, "Dates must look like 2026-10-30")
    if end < start:
        raise HTTPException(400, "The end date is before the start date")
    if end - start > timedelta(days=366):
        raise HTTPException(400, "Pick a range of one year or less")
    return start, end


def _load_guests(cur, property_id, start: date, end: date) -> list[dict]:
    """Hill Booker's confirmed bookings and the host's own guests whose stay touches the date range."""
    args = {"p": str(property_id), "from": start, "to": end}
    cur.execute(
        """SELECT 'hillbooker' AS source, b.id, u.name, u.phone, b.check_in, b.check_out, b.guests AS people, b.rooms,
                  rt.name AS room_type, r.id AS room_id, r.label AS room, b.total_amount,
                  COALESCE(b.advance_amount, b.total_amount) AS paid_online, COALESCE(e.collected, 0) AS collected, e.note,
                  e.address, e.id_type, e.id_number, e.checked_out_at
           FROM bookings b
           JOIN users u ON u.id = b.user_id
           JOIN room_types rt ON rt.id = b.room_type_id
           LEFT JOIN hotel_booking_extras e ON e.booking_id = b.id
           LEFT JOIN hotel_rooms r ON r.id = e.room_id
           WHERE b.property_id = %(p)s AND b.status = 'confirmed' AND b.check_in <= %(to)s AND b.check_out >= %(from)s""",
        args,
    )
    rows = cur.fetchall()
    cur.execute(
        """SELECT 'walkin' AS source, g.id, g.name, g.phone, g.check_in, g.check_out, g.people, 1 AS rooms,
                  rt.name AS room_type, r.id AS room_id, r.label AS room, g.total_amount,
                  0::numeric AS paid_online, g.paid_amount AS collected, g.note,
                  g.address, g.id_type, g.id_number, g.checked_out_at
           FROM hotel_guests g
           LEFT JOIN hotel_rooms r ON r.id = g.room_id
           LEFT JOIN room_types rt ON rt.id = r.room_type_id
           WHERE g.property_id = %(p)s AND g.check_in <= %(to)s AND g.check_out >= %(from)s""",
        args,
    )
    rows += cur.fetchall()
    for r in rows:
        r["paid"] = Decimal(r["paid_online"]) + Decimal(r["collected"])
        r["balance"] = Decimal(r["total_amount"]) - r["paid"]
    rows.sort(key=lambda r: (r["check_in"], r["name"].lower()), reverse=True)
    return rows


def _guest_totals(rows: list[dict]) -> dict:
    return {
        "guests": len(rows),
        "total": sum((Decimal(r["total_amount"]) for r in rows), ZERO),
        "paid": sum((r["paid"] for r in rows), ZERO),
        "balance": sum((r["balance"] for r in rows), ZERO),
    }


@router.get("/{property_id}/guests")
def list_guests(property_id: UUID, date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
                user: dict = Depends(host)):
    start, end = _range(date_from, date_to)
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        rows = _load_guests(cur, property_id, start, end)
    return {"from": start, "to": end, "today": _today(), "guests": rows, "totals": _guest_totals(rows)}


@router.post("/{property_id}/guests", status_code=201)
def add_guest(property_id: UUID, body: GuestIn, user: dict = Depends(host)):
    """Add a guest who booked directly with the hotel."""
    name = _clean(body.name)
    if not name:
        raise HTTPException(400, "Give the guest's name")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        id_number = _clean(body.id_number)
        _check_id(body.id_type, id_number)
        if body.room_id:
            _room_in_property(cur, body.room_id, property_id)
            cur.execute("SELECT id FROM hotel_rooms WHERE id = %s FOR UPDATE", (str(body.room_id),))  # one check-in to a room at a time
            other = _room_is_taken(cur, body.room_id, body.check_in, body.check_out)
            if other:
                raise HTTPException(409, f"{other} already has this room for those dates. Check them out first, or choose another room")
        cur.execute(
            """INSERT INTO hotel_guests (property_id, room_id, name, phone, check_in, check_out, people, total_amount, paid_amount, note,
                                         address, id_type, id_number)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (str(property_id), str(body.room_id) if body.room_id else None, name, _clean(body.phone), body.check_in, body.check_out,
             body.people, body.total_amount, body.paid_amount, _clean(body.note), _clean(body.address), body.id_type, id_number),
        )
        gid = cur.fetchone()["id"]
        full = _hold_nights(cur, gid, body.room_id, body.check_in, body.check_out)
        if body.room_id and body.check_in <= _today() < body.check_out:
            _mark_room(cur, body.room_id, "occupied")
        return {"id": gid, "full_nights": full}


@router.patch("/guests/{guest_id}")
def update_guest(guest_id: UUID, body: GuestUpdate, user: dict = Depends(host)):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        old = _my_guest(cur, guest_id, user)
        for col in ("name", "check_in", "check_out", "people", "total_amount", "paid_amount"):
            if col in changes and changes[col] is None:
                raise HTTPException(400, f"{col.replace('_', ' ').capitalize()} can't be empty")
        if "name" in changes:
            changes["name"] = _clean(changes["name"])
            if not changes["name"]:
                raise HTTPException(400, "Give the guest's name")
        for col in ("phone", "note", "address", "id_number"):
            if col in changes:
                changes[col] = _clean(changes[col])
        if changes.get("room_id") is not None:
            _room_in_property(cur, changes["room_id"], old["property_id"])
            changes["room_id"] = str(changes["room_id"])
        new = {**old, **changes}
        if new["check_out"] <= new["check_in"]:
            raise HTTPException(400, "Check-out must be after check-in")
        if (new["check_out"] - new["check_in"]).days > MAX_NIGHTS:
            raise HTTPException(400, "A stay can be up to one year long")
        if Decimal(new["paid_amount"]) > Decimal(new["total_amount"]):
            raise HTTPException(400, "The amount paid is more than the total")
        _check_id(new["id_type"], new["id_number"])
        moved = any(col in changes for col in ("room_id", "check_in", "check_out"))
        if moved and new["room_id"] and not old["checked_out_at"]:
            cur.execute("SELECT id FROM hotel_rooms WHERE id = %s FOR UPDATE", (str(new["room_id"]),))
            other = _room_is_taken(cur, new["room_id"], new["check_in"], new["check_out"], skip_guest=guest_id)
            if other:
                raise HTTPException(409, f"{other} already has this room for those dates. Choose another room or other dates")
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_guests SET {sets} WHERE id = %s", (*changes.values(), str(guest_id)))
        full = []
        if moved and not old["checked_out_at"]:  # the nights kept off Hill Booker follow the new room and dates
            _release_nights(cur, guest_id)
            full = _hold_nights(cur, guest_id, new["room_id"], new["check_in"], new["check_out"])
    return {"id": str(guest_id), "updated": list(changes), "full_nights": full}


@router.post("/guests/{guest_id}/checkout")
def check_out_guest(guest_id: UUID, user: dict = Depends(host)):
    """The guest has left. The room goes to cleaning, and any nights left of the stay go back on sale."""
    today = _today()
    with get_conn() as conn, conn.cursor() as cur:
        g = _my_guest(cur, guest_id, user)
        if g["checked_out_at"]:
            raise HTTPException(409, "This guest is already checked out")
        if g["check_in"] > today:
            raise HTTPException(409, "This guest has not arrived yet. Delete the entry if they are not coming")
        _release_nights(cur, guest_id)
        left = min(g["check_out"], max(today, g["check_in"] + timedelta(days=1)))  # leaving early shortens the stay
        cur.execute("UPDATE hotel_guests SET checked_out_at = now(), check_out = %s WHERE id = %s", (left, str(guest_id)))
        if g["room_id"]:
            _mark_room(cur, g["room_id"], "cleaning")
    return {"id": str(guest_id), "check_out": left}


@router.delete("/guests/{guest_id}")
def delete_guest(guest_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _my_guest(cur, guest_id, user)
        _release_nights(cur, guest_id)
        cur.execute("DELETE FROM hotel_guests WHERE id = %s", (str(guest_id),))
    return {"deleted": str(guest_id)}


@router.put("/bookings/{booking_id}/extra")
def set_booking_extra(booking_id: UUID, body: BookingExtraIn, user: dict = Depends(host)):
    """For a Hill Booker booking: the room given, the balance collected at the property, and the guest's address and ID proof."""
    id_number = _clean(body.id_number)
    _check_id(body.id_type, id_number)
    with get_conn() as conn, conn.cursor() as cur:
        b = _my_booking(cur, booking_id, user)
        if body.collected > Decimal(b["balance_due"]):
            raise HTTPException(400, f"The balance to collect for this booking is Rs {Decimal(b['balance_due']):,.2f}")
        if body.room_id:
            _booking_room_free(cur, b, booking_id, body.room_id)
        cur.execute(
            """INSERT INTO hotel_booking_extras (booking_id, room_id, collected, note, address, id_type, id_number)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (booking_id) DO UPDATE SET room_id = EXCLUDED.room_id, collected = EXCLUDED.collected, note = EXCLUDED.note,
                 address = EXCLUDED.address, id_type = EXCLUDED.id_type, id_number = EXCLUDED.id_number, updated_at = now()""",
            (str(booking_id), str(body.room_id) if body.room_id else None, body.collected, _clean(body.note), _clean(body.address),
             body.id_type, id_number),
        )
    return {"id": str(booking_id), "collected": body.collected}


def _my_booking(cur, booking_id, user: dict) -> dict:
    cur.execute(
        """SELECT b.property_id, b.status, b.check_in, b.check_out,
                  b.total_amount - COALESCE(b.advance_amount, b.total_amount) AS balance_due
           FROM bookings b WHERE b.id = %s""",
        (str(booking_id),),
    )
    b = cur.fetchone()
    if not b:
        raise HTTPException(404, "Booking not found")
    _mine(cur, b["property_id"], user)
    if b["status"] != "confirmed":
        raise HTTPException(409, "Only confirmed bookings can be changed here")
    return b


def _booking_room_free(cur, b: dict, booking_id, room_id) -> None:
    _room_in_property(cur, room_id, b["property_id"])
    cur.execute("SELECT id FROM hotel_rooms WHERE id = %s FOR UPDATE", (str(room_id),))
    other = _room_is_taken(cur, room_id, b["check_in"], b["check_out"], skip_booking=booking_id)
    if other:
        raise HTTPException(409, f"{other} already has this room for those dates. Check them out first, or choose another room")


@router.post("/bookings/{booking_id}/room")
def give_booking_a_room(booking_id: UUID, body: BookingRoomIn, user: dict = Depends(host)):
    """Check a Hill Booker guest in to a room from the room board. Nothing else about the booking changes."""
    today = _today()
    with get_conn() as conn, conn.cursor() as cur:
        b = _my_booking(cur, booking_id, user)
        _booking_room_free(cur, b, booking_id, body.room_id)
        cur.execute(
            """INSERT INTO hotel_booking_extras (booking_id, room_id) VALUES (%s, %s)
               ON CONFLICT (booking_id) DO UPDATE SET room_id = EXCLUDED.room_id, checked_out_at = NULL, updated_at = now()""",
            (str(booking_id), str(body.room_id)),
        )
        if b["check_in"] <= today <= b["check_out"]:
            _mark_room(cur, body.room_id, "occupied")
    return {"id": str(booking_id), "room_id": str(body.room_id)}


@router.post("/bookings/{booking_id}/checkout")
def check_out_booking(booking_id: UUID, user: dict = Depends(host)):
    """A Hill Booker guest has left: the room goes to cleaning. The booking and its payments are not changed."""
    with get_conn() as conn, conn.cursor() as cur:
        b = _my_booking(cur, booking_id, user)
        if b["check_in"] > _today():
            raise HTTPException(409, "This guest has not arrived yet")
        cur.execute(
            """INSERT INTO hotel_booking_extras (booking_id, checked_out_at) VALUES (%s, now())
               ON CONFLICT (booking_id) DO UPDATE SET checked_out_at = now(), updated_at = now() RETURNING room_id""",
            (str(booking_id),),
        )
        room = cur.fetchone()["room_id"]
        if room:
            _mark_room(cur, room, "cleaning")
    return {"id": str(booking_id)}


# ---------- staff ----------

class StaffIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    job: str | None = Field(default=None, max_length=60)
    joined_on: date | None = None
    monthly_salary: Decimal = Field(default=ZERO, ge=0, le=MAX_MONEY, decimal_places=2)
    note: str | None = Field(default=None, max_length=300)


class StaffUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    job: str | None = Field(default=None, max_length=60)
    joined_on: date | None = None
    left_on: date | None = None
    monthly_salary: Decimal | None = Field(default=None, ge=0, le=MAX_MONEY, decimal_places=2)
    active: bool | None = None
    note: str | None = Field(default=None, max_length=300)


@router.get("/{property_id}/staff")
def list_staff(property_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute(
            """SELECT id, name, phone, job, joined_on, left_on, monthly_salary, active, note
               FROM hotel_staff WHERE property_id = %s ORDER BY active DESC, lower(name)""",
            (str(property_id),),
        )
        return cur.fetchall()


@router.post("/{property_id}/staff", status_code=201)
def add_staff(property_id: UUID, body: StaffIn, user: dict = Depends(host)):
    name = _clean(body.name)
    if not name:
        raise HTTPException(400, "Give the staff member's name")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT count(*) AS n FROM hotel_staff WHERE property_id = %s", (str(property_id),))
        if cur.fetchone()["n"] >= MAX_STAFF:
            raise HTTPException(400, f"A property can have up to {MAX_STAFF} staff records")
        cur.execute(
            """INSERT INTO hotel_staff (property_id, name, phone, job, joined_on, monthly_salary, note)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (str(property_id), name, _clean(body.phone), _clean(body.job), body.joined_on, body.monthly_salary, _clean(body.note)),
        )
        return {"id": cur.fetchone()["id"]}


@router.patch("/staff/{staff_id}")
def update_staff(staff_id: UUID, body: StaffUpdate, user: dict = Depends(host)):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        old = _my_staff(cur, staff_id, user)
        for col in ("name", "monthly_salary", "active"):
            if col in changes and changes[col] is None:
                raise HTTPException(400, f"{col.replace('_', ' ').capitalize()} can't be empty")
        if "name" in changes:
            changes["name"] = _clean(changes["name"])
            if not changes["name"]:
                raise HTTPException(400, "Give the staff member's name")
        for col in ("phone", "job", "note"):
            if col in changes:
                changes[col] = _clean(changes[col])
        # Marking someone as left records the date; bringing them back clears it.
        if changes.get("active") is False and "left_on" not in changes and not old["left_on"]:
            changes["left_on"] = _today()
        if changes.get("active") is True:
            changes["left_on"] = None
        new = {**old, **changes}
        if new["joined_on"] and new["left_on"] and new["left_on"] < new["joined_on"]:
            raise HTTPException(400, "The leaving date is before the joining date")
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the model, never from the request
        cur.execute(f"UPDATE hotel_staff SET {sets} WHERE id = %s", (*changes.values(), str(staff_id)))
    return {"id": str(staff_id), "updated": list(changes)}


@router.delete("/staff/{staff_id}")
def delete_staff(staff_id: UUID, user: dict = Depends(host)):
    """Deletes a record added by mistake. Someone with salary or advance entries is kept: mark them as left instead."""
    with get_conn() as conn, conn.cursor() as cur:
        _my_staff(cur, staff_id, user)
        cur.execute("SELECT 1 FROM hotel_salary_payments WHERE staff_id = %s LIMIT 1", (str(staff_id),))
        if cur.fetchone():
            raise HTTPException(409, "This person has salary entries, so the record is kept. Mark them as left instead")
        cur.execute("DELETE FROM hotel_staff WHERE id = %s", (str(staff_id),))
    return {"deleted": str(staff_id)}


# ---------- attendance ----------

class Mark(BaseModel):
    staff_id: UUID
    status: AttendanceStatus | None = None  # nothing clears the mark


class AttendanceIn(BaseModel):
    day: date
    marks: list[Mark] = Field(min_length=1, max_length=MAX_STAFF)


def _attendance_day(day: date) -> None:
    today = _today()
    if day > today:
        raise HTTPException(400, "Attendance can't be marked for a future date")
    if day < today - timedelta(days=366):
        raise HTTPException(400, "That date is more than a year ago")


@router.get("/{property_id}/attendance")
def get_attendance(property_id: UUID, day: date | None = None, user: dict = Depends(host)):
    day = day or _today()
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute(
            """SELECT s.id AS staff_id, s.name, s.job, s.active, a.status
               FROM hotel_staff s LEFT JOIN hotel_attendance a ON a.staff_id = s.id AND a.day = %(d)s
               WHERE s.property_id = %(p)s
                 AND (a.status IS NOT NULL
                      OR ((s.joined_on IS NULL OR s.joined_on <= %(d)s) AND (s.left_on IS NULL OR s.left_on >= %(d)s)))
               ORDER BY lower(s.name)""",
            {"p": str(property_id), "d": day},
        )
        return {"day": day, "today": _today(), "staff": cur.fetchall()}


@router.put("/{property_id}/attendance")
def set_attendance(property_id: UUID, body: AttendanceIn, user: dict = Depends(host)):
    _attendance_day(body.day)
    ids = [str(m.staff_id) for m in body.marks]
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT id FROM hotel_staff WHERE property_id = %s AND id = ANY(%s::uuid[])", (str(property_id), ids))
        if len(cur.fetchall()) != len(set(ids)):
            raise HTTPException(400, "Some of those staff members are not in this property")
        for m in body.marks:
            if m.status is None:
                cur.execute("DELETE FROM hotel_attendance WHERE staff_id = %s AND day = %s", (str(m.staff_id), body.day))
            else:
                cur.execute(
                    """INSERT INTO hotel_attendance (staff_id, day, status) VALUES (%s, %s, %s)
                       ON CONFLICT (staff_id, day) DO UPDATE SET status = EXCLUDED.status""",
                    (str(m.staff_id), body.day, m.status),
                )
    return {"day": body.day, "saved": len(body.marks)}


# ---------- salary ----------

class SalaryPaymentIn(BaseModel):
    staff_id: UUID
    month: str = Field(pattern=r"^\d{4}-\d{2}$")  # the salary month this money counts for, e.g. 2026-11
    kind: Literal["salary", "advance"]
    amount: Decimal = Field(gt=0, le=MAX_MONEY, decimal_places=2)
    paid_on: date | None = None
    note: str | None = Field(default=None, max_length=300)


def _month(text: str | None) -> date:
    if not text:
        return _today().replace(day=1)
    try:
        m = date.fromisoformat(f"{text}-01")
    except ValueError:
        raise HTTPException(400, "The month must look like 2026-11")
    if not 2000 <= m.year <= 2100:
        raise HTTPException(400, "The month must look like 2026-11")
    return m


def _next_month(m: date) -> date:
    return (m.replace(day=28) + timedelta(days=4)).replace(day=1)


def _load_salary(cur, property_id, month: date) -> tuple[list[dict], list[dict]]:
    args = {"p": str(property_id), "m": month, "next": _next_month(month)}
    cur.execute(
        """SELECT s.id, s.name, s.job, s.phone, s.active, s.joined_on, s.left_on, s.monthly_salary,
                  COALESCE(p.advances, 0) AS advances, COALESCE(p.salary_paid, 0) AS salary_paid,
                  COALESCE(a.present, 0) AS present, COALESCE(a.half, 0) AS half,
                  COALESCE(a.absent, 0) AS absent, COALESCE(a.leave, 0) AS leave
           FROM hotel_staff s
           LEFT JOIN LATERAL (
             SELECT SUM(amount) FILTER (WHERE kind = 'advance') AS advances, SUM(amount) FILTER (WHERE kind = 'salary') AS salary_paid
             FROM hotel_salary_payments WHERE staff_id = s.id AND month = %(m)s
           ) p ON true
           LEFT JOIN LATERAL (
             SELECT count(*) FILTER (WHERE status = 'present') AS present, count(*) FILTER (WHERE status = 'half') AS half,
                    count(*) FILTER (WHERE status = 'absent') AS absent, count(*) FILTER (WHERE status = 'leave') AS leave
             FROM hotel_attendance WHERE staff_id = s.id AND day >= %(m)s AND day < %(next)s
           ) a ON true
           WHERE s.property_id = %(p)s
             AND (p.advances IS NOT NULL OR p.salary_paid IS NOT NULL
                  OR ((s.joined_on IS NULL OR s.joined_on < %(next)s) AND (s.left_on IS NULL OR s.left_on >= %(m)s)))
           ORDER BY lower(s.name)""",
        args,
    )
    staff = cur.fetchall()
    for s in staff:
        s["balance"] = Decimal(s["monthly_salary"]) - Decimal(s["advances"]) - Decimal(s["salary_paid"])
    cur.execute(
        """SELECT sp.id, sp.staff_id, s.name, sp.kind, sp.amount, sp.paid_on, sp.note
           FROM hotel_salary_payments sp JOIN hotel_staff s ON s.id = sp.staff_id
           WHERE s.property_id = %(p)s AND sp.month = %(m)s ORDER BY sp.paid_on, sp.created_at""",
        args,
    )
    return staff, cur.fetchall()


def _salary_totals(staff: list[dict]) -> dict:
    return {
        "staff": len(staff),
        "salary": sum((Decimal(s["monthly_salary"]) for s in staff), ZERO),
        "advances": sum((Decimal(s["advances"]) for s in staff), ZERO),
        "paid": sum((Decimal(s["salary_paid"]) for s in staff), ZERO),
        "balance": sum((s["balance"] for s in staff), ZERO),
    }


@router.get("/{property_id}/salary")
def salary_month(property_id: UUID, month: str | None = None, user: dict = Depends(host)):
    """One month's salary sheet. Balance = monthly salary minus advances minus salary already paid."""
    m = _month(month)
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        staff, payments = _load_salary(cur, property_id, m)
    return {"month": f"{m:%Y-%m}", "staff": staff, "payments": payments, "totals": _salary_totals(staff)}


@router.post("/{property_id}/salary/payments", status_code=201)
def add_salary_payment(property_id: UUID, body: SalaryPaymentIn, user: dict = Depends(host)):
    m = _month(body.month)
    paid_on = body.paid_on or _today()
    if paid_on > _today() + timedelta(days=1):
        raise HTTPException(400, "The payment date is in the future")
    with get_conn() as conn, conn.cursor() as cur:
        _mine(cur, property_id, user)
        cur.execute("SELECT 1 FROM hotel_staff WHERE id = %s AND property_id = %s", (str(body.staff_id), str(property_id)))
        if not cur.fetchone():
            raise HTTPException(400, "That staff member is not in this property")
        cur.execute(
            """INSERT INTO hotel_salary_payments (staff_id, month, kind, amount, paid_on, note)
               VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
            (str(body.staff_id), m, body.kind, body.amount, paid_on, _clean(body.note)),
        )
        return {"id": cur.fetchone()["id"]}


@router.delete("/salary/payments/{payment_id}")
def delete_salary_payment(payment_id: UUID, user: dict = Depends(host)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT s.property_id FROM hotel_salary_payments sp JOIN hotel_staff s ON s.id = sp.staff_id WHERE sp.id = %s",
            (str(payment_id),),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        _mine(cur, row["property_id"], user)
        cur.execute("DELETE FROM hotel_salary_payments WHERE id = %s", (str(payment_id),))
    return {"deleted": str(payment_id)}


# ---------- Excel downloads ----------

def _xlsx(title: str, subtitle: str, sheets: list[dict], filename: str) -> Response:
    """sheets: [{name, headers, rows, money (column numbers), dates (column numbers), widths {column: width}}]"""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    font, bold = Font(name="Arial", size=10), Font(name="Arial", size=10, bold=True)
    head_fill = PatternFill("solid", fgColor="1F4E79")
    head_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    thin = Side(style="thin", color="CCCCCC")
    money_fmt = '#,##0.00;(#,##0.00);"-"'
    wb = Workbook()
    for i, sh in enumerate(sheets):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = sh["name"][:31]
        ws["A1"], ws["A1"].font = title, Font(name="Arial", size=14, bold=True)
        ws["A2"], ws["A2"].font = subtitle, font
        head_row = 4
        for col, h in enumerate(sh["headers"], 1):
            c = ws.cell(head_row, col, h)
            c.font, c.fill, c.alignment = head_font, head_fill, Alignment(vertical="center", wrap_text=True)
            ws.column_dimensions[get_column_letter(col)].width = sh.get("widths", {}).get(col, max(12, min(34, len(h) + 4)))
        for r, row in enumerate(sh["rows"], head_row + 1):
            last = sh.get("total_row") and r == head_row + len(sh["rows"])
            for col, v in enumerate(row, 1):
                c = ws.cell(r, col, v)
                c.font = bold if last else font
                c.border = Border(bottom=thin)
                if col in sh.get("money", ()):
                    c.number_format = money_fmt
                if col in sh.get("dates", ()):
                    c.number_format = "DD-MMM-YYYY"
        ws.freeze_panes = ws.cell(head_row + 1, 1)
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _text(v) -> str:
    """Text typed by the host or a guest. A leading = + - @ would be read by Excel as a formula, so it is written as plain text."""
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s


@router.get("/{property_id}/guests.xlsx")
def guests_xlsx(property_id: UUID, date_from: str | None = Query(None, alias="from"), date_to: str | None = Query(None, alias="to"),
                user: dict = Depends(host)):
    start, end = _range(date_from, date_to)
    with get_conn() as conn, conn.cursor() as cur:
        prop = _mine(cur, property_id, user)
        rows = _load_guests(cur, property_id, start, end)
    data = [
        [r["check_in"], r["check_out"], _text(r["name"]), _text(r["phone"]), "Hill Booker" if r["source"] == "hillbooker" else "Direct",
         _text(r["room"] or r["room_type"]), r["people"], float(r["total_amount"]), float(r["paid_online"]), float(r["collected"]),
         float(r["balance"]), _text(r["address"]), ID_NAMES.get(r["id_type"], ""), _text(r["id_number"]), _text(r["note"])]
        for r in rows
    ]
    t = _guest_totals(rows)
    data.append(["", "", "Total", "", "", "", "", float(t["total"]), float(sum((Decimal(r["paid_online"]) for r in rows), ZERO)),
                 float(sum((Decimal(r["collected"]) for r in rows), ZERO)), float(t["balance"]), "", "", "", ""])
    return _xlsx(
        f"{prop['name']}: guest register",
        f"Stays between {start:%d %b %Y} and {end:%d %b %Y}. Amounts in rupees.",
        [{"name": "Guests", "headers": ["Check-in", "Check-out", "Guest", "Phone", "Booked through", "Room", "People", "Total", "Paid online",
                                        "Paid at property", "Balance", "Address", "ID proof", "ID number", "Note"],
          "rows": data, "money": (8, 9, 10, 11), "dates": (1, 2), "widths": {3: 26, 4: 16, 6: 20, 12: 36, 13: 24, 14: 18, 15: 34},
          "total_row": True}],
        f"guest-register-{start:%Y%m%d}-{end:%Y%m%d}.xlsx",
    )


@router.get("/{property_id}/salary.xlsx")
def salary_xlsx(property_id: UUID, month: str | None = None, user: dict = Depends(host)):
    m = _month(month)
    with get_conn() as conn, conn.cursor() as cur:
        prop = _mine(cur, property_id, user)
        staff, payments = _load_salary(cur, property_id, m)
    t = _salary_totals(staff)
    rows = [
        [_text(s["name"]), _text(s["job"]), _text(s["phone"]), s["present"], s["half"], s["absent"], s["leave"], float(s["monthly_salary"]),
         float(s["advances"]), float(s["salary_paid"]), float(s["balance"])]
        for s in staff
    ]
    rows.append(["Total", "", "", "", "", "", "", float(t["salary"]), float(t["advances"]), float(t["paid"]), float(t["balance"])])
    return _xlsx(
        f"{prop['name']}: salary for {m:%B %Y}",
        "Balance = monthly salary minus advances minus salary paid. Amounts in rupees.",
        [
            {"name": "Salary", "headers": ["Staff", "Job", "Phone", "Days present", "Half days", "Days absent", "Leave", "Monthly salary",
                                           "Advances", "Salary paid", "Balance"],
             "rows": rows, "money": (8, 9, 10, 11), "widths": {1: 26, 2: 20, 3: 16}, "total_row": True},
            {"name": "Entries", "headers": ["Date", "Staff", "Type", "Amount", "Note"],
             "rows": [[p["paid_on"], _text(p["name"]), "Advance" if p["kind"] == "advance" else "Salary", float(p["amount"]), _text(p["note"])]
                      for p in payments],
             "money": (4,), "dates": (1,), "widths": {2: 26, 5: 40}},
        ],
        f"salary-{m:%Y-%m}.xlsx",
    )
