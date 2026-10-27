"""Channel manager: keep availability in step with other booking sites through calendar (iCal) links.

Out: each room type has a private calendar link listing its sold-out nights. Paste it into Airbnb, Booking.com, etc.
In:  the host pastes links from those sites here. We read them every 15 minutes and take those nights out of
     the open rooms, so the same room can't be sold twice."""
import logging
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from .. import ical
from ..config import settings
from ..db import get_conn
from .owner import _own_room_type, owner_only

log = logging.getLogger("roomly")

router = APIRouter(prefix="/owner", tags=["channel manager"])
public = APIRouter(tags=["channel manager"])

MAX_FEEDS_PER_ROOM = 8


class ChannelIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    url: str = Field(min_length=8, max_length=1000)


def _export_url(token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/ical/{token}.ics"


def _feed_room(cur, feed_id: str, user: dict) -> dict:
    cur.execute("SELECT f.id, f.room_type_id FROM room_feeds f WHERE f.id = %s", (feed_id,))
    f = cur.fetchone()
    if not f:
        raise HTTPException(404, "Calendar link not found")
    _own_room_type(cur, str(f["room_type_id"]), user)
    return f


# ---------- host: manage links ----------

@router.get("/room-types/{room_type_id}/channels")
def list_channels(room_type_id: str, user: dict = Depends(owner_only)):
    with get_conn() as conn, conn.cursor() as cur:
        _own_room_type(cur, room_type_id, user)
        cur.execute("SELECT ical_token FROM room_types WHERE id = %s FOR UPDATE", (room_type_id,))
        token = cur.fetchone()["ical_token"]
        if not token:
            token = secrets.token_urlsafe(24)
            cur.execute("UPDATE room_types SET ical_token = %s WHERE id = %s", (token, room_type_id))
        cur.execute(
            """SELECT id, name, url, last_synced_at, last_status, last_error, events
               FROM room_feeds WHERE room_type_id = %s ORDER BY created_at""",
            (room_type_id,),
        )
        feeds = cur.fetchall()
    return {"export_url": _export_url(token), "feeds": feeds, "sync_minutes": 15}


@router.post("/room-types/{room_type_id}/channels", status_code=201)
def add_channel(room_type_id: str, body: ChannelIn, user: dict = Depends(owner_only)):
    url = body.url.strip().replace("webcal://", "https://", 1)
    try:
        ical._check_host(url)
    except ical.IcalError as e:
        raise HTTPException(400, str(e))
    with get_conn() as conn, conn.cursor() as cur:
        _own_room_type(cur, room_type_id, user)
        cur.execute("SELECT COUNT(*) AS n, bool_or(url = %s) AS dup FROM room_feeds WHERE room_type_id = %s", (url, room_type_id))
        info = cur.fetchone()
        if info["dup"]:
            raise HTTPException(409, "That calendar link is already added")
        if info["n"] >= MAX_FEEDS_PER_ROOM:
            raise HTTPException(400, f"You can add up to {MAX_FEEDS_PER_ROOM} calendar links per room")
        cur.execute("INSERT INTO room_feeds (room_type_id, name, url) VALUES (%s, %s, %s) RETURNING id", (room_type_id, body.name.strip(), url))
        feed_id = str(cur.fetchone()["id"])
    result = sync_feed(feed_id)  # read it right away so the host sees whether it worked
    return {"id": feed_id, **result}


@router.post("/channels/{feed_id}/sync")
def sync_now(feed_id: str, user: dict = Depends(owner_only)):
    with get_conn() as conn, conn.cursor() as cur:
        _feed_room(cur, feed_id, user)
    return sync_feed(feed_id)


@router.delete("/channels/{feed_id}")
def remove_channel(feed_id: str, user: dict = Depends(owner_only)):
    """Remove a link and give back the rooms it was holding."""
    with get_conn() as conn, conn.cursor() as cur:
        f = _feed_room(cur, feed_id, user)
        cur.execute("SELECT total_rooms FROM room_types WHERE id = %s", (f["room_type_id"],))
        total = cur.fetchone()["total_rooms"]
        cur.execute("SELECT day, applied FROM external_nights WHERE feed_id = %s AND day >= current_date ORDER BY day FOR UPDATE", (feed_id,))
        for row in cur.fetchall():
            if row["applied"]:
                cur.execute(
                    "UPDATE room_inventory SET available = LEAST(available + %s, %s) WHERE room_type_id = %s AND day = %s",
                    (row["applied"], total, f["room_type_id"], row["day"]),
                )
        cur.execute("DELETE FROM room_feeds WHERE id = %s", (feed_id,))
    return {"deleted": feed_id}


# ---------- reading a link ----------

def sync_feed(feed_id: str) -> dict:
    """Read one calendar link and bring the room's open nights in line with it. Safe to run any time, any number of times."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT f.id, f.url, f.room_type_id, rt.total_rooms FROM room_feeds f
               JOIN room_types rt ON rt.id = f.room_type_id WHERE f.id = %s""",
            (feed_id,),
        )
        feed = cur.fetchone()
    if not feed:
        return {"status": "error", "error": "Calendar link not found", "events": 0}

    try:
        events = ical.parse_events(ical.fetch_calendar(feed["url"]))
    except ical.IcalError as e:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE room_feeds SET last_synced_at = now(), last_status = 'error', last_error = %s WHERE id = %s",
                (str(e), feed_id),
            )
        return {"status": "error", "error": str(e), "events": 0}

    rt_id = str(feed["room_type_id"])
    total = feed["total_rooms"]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM room_feeds WHERE id = %s FOR UPDATE", (feed_id,))  # one sync of a link at a time
        if not cur.fetchone():
            return {"status": "error", "error": "Calendar link was removed", "events": 0}
        today = date.today()
        wanted = ical.nights_wanted(events, today, total)
        cur.execute("DELETE FROM external_nights WHERE feed_id = %s AND day < %s", (feed_id, today))  # past nights need no giving back
        cur.execute("SELECT day, applied FROM external_nights WHERE feed_id = %s", (feed_id,))
        existing = {r["day"]: r["applied"] for r in cur.fetchall()}
        days = sorted(set(wanted) | set(existing))
        avail: dict[date, int] = {}
        if days:
            cur.execute(
                "SELECT day, available FROM room_inventory WHERE room_type_id = %s AND day = ANY(%s) ORDER BY day FOR UPDATE",
                (rt_id, days),
            )
            avail = {r["day"]: r["available"] for r in cur.fetchall()}
        for step in ical.plan_sync(wanted, existing, avail, total):
            if step["new_avail"] is not None:
                cur.execute("UPDATE room_inventory SET available = %s WHERE room_type_id = %s AND day = %s", (step["new_avail"], rt_id, step["day"]))
            if step["wanted"] > 0:
                cur.execute(
                    """INSERT INTO external_nights (feed_id, room_type_id, day, wanted, applied) VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (feed_id, day) DO UPDATE SET wanted = EXCLUDED.wanted, applied = EXCLUDED.applied""",
                    (feed_id, rt_id, step["day"], step["wanted"], step["applied"]),
                )
            else:
                cur.execute("DELETE FROM external_nights WHERE feed_id = %s AND day = %s", (feed_id, step["day"]))
        cur.execute(
            "UPDATE room_feeds SET last_synced_at = now(), last_status = 'ok', last_error = NULL, events = %s WHERE id = %s",
            (len(wanted), feed_id),
        )
    return {"status": "ok", "error": None, "events": len(wanted)}


def sync_all() -> int:
    """Run on a timer from main.py: read every saved calendar link."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM room_feeds ORDER BY last_synced_at NULLS FIRST LIMIT 500")
        ids = [str(r["id"]) for r in cur.fetchall()]
    for fid in ids:
        try:
            sync_feed(fid)
        except Exception:
            log.exception("Could not sync calendar link %s", fid)
    return len(ids)


# ---------- our calendar, read by other sites ----------

@public.get("/ical/{token}.ics")
def export_calendar(token: str):
    """Sold-out nights of one room type. The long random token is the only access control, as on other sites."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT rt.id, rt.name AS room, p.name AS property FROM room_types rt
               JOIN properties p ON p.id = rt.property_id WHERE rt.ical_token = %s""",
            (token,),
        )
        rt = cur.fetchone()
        if not rt:
            raise HTTPException(404, "Calendar not found")
        cur.execute(
            """SELECT day FROM room_inventory WHERE room_type_id = %s AND day >= current_date
                 AND day < current_date + %s AND available <= 0 ORDER BY day""",
            (rt["id"], ical.HORIZON_DAYS + 1),
        )
        days = [r["day"] for r in cur.fetchall()]
    body = ical.build_ics(token, f"{rt['property']} - {rt['room']}", ical.sold_out_ranges(days))
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-store"})
