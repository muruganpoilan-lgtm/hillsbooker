"""Travel vehicles: public browsing, operator management and guest bookings.

Availability works differently from rooms. An operator owns `quantity` identical vehicles; a booking uses
`count` of them on every day from start_date to end_date. To book, we lock the vehicle row, then check each
day: confirmed bookings plus unexpired holds must leave `count` free. Locking the row makes two guests
asking for the last van wait for each other, so it can't be sold twice."""
from datetime import date
from decimal import ROUND_CEILING, Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import current_user, require_role
from ..config import settings
from ..db import get_conn
from ..schemas import TripIn, TripUpdate, VehicleBookingIn, VehicleIn, VehicleUpdate
from .owner import REMOVED_KEEP_DAYS, _delete_photo, _upload_photos

public = APIRouter(prefix="/vehicles", tags=["vehicles"])
operator = APIRouter(prefix="/operator", tags=["vehicle operators"])
guest = APIRouter(prefix="/vehicle-bookings", tags=["vehicle bookings"])
operator_only = require_role("operator", "owner", "admin")  # property owners can list vehicles too

_BUSY = "(vb.status = 'confirmed' OR (vb.status = 'held' AND vb.hold_expires_at > now()))"


def max_used(cur, vehicle_id: str, start: date, end: date, exclude: str | None = None) -> int:
    """The most vehicles in use on any single day between start and end (both included)."""
    cur.execute(
        f"""SELECT COALESCE(MAX(used), 0) AS m FROM (
              SELECT d::date AS day, COALESCE(SUM(vb.count), 0) AS used
              FROM generate_series(%s::date, %s::date, interval '1 day') d
              LEFT JOIN vehicle_bookings vb ON vb.vehicle_id = %s AND vb.start_date <= d::date AND vb.end_date >= d::date
                   AND {_BUSY} AND (%s::uuid IS NULL OR vb.id <> %s::uuid)
              GROUP BY d) t""",
        (start, end, vehicle_id, exclude, exclude),
    )
    return int(cur.fetchone()["m"])


def release_expired_vehicle_holds(cur) -> int:
    cur.execute("UPDATE vehicle_bookings SET status = 'expired' WHERE status = 'held' AND hold_expires_at < now()")
    return cur.rowcount


def expire_holds() -> int:
    with get_conn() as conn, conn.cursor() as cur:
        return release_expired_vehicle_holds(cur)


def advance_for(total: Decimal, percent: int) -> Decimal:
    return min(total, (total * percent / Decimal(100)).quantize(Decimal(1), rounding=ROUND_CEILING))


# ---------- public ----------

@public.get("")
def list_vehicles(city: str | None = None, kind: str | None = None, seats: int | None = None,
                  start: date | None = None, end: date | None = None):
    """Approved vehicles. With dates, only those with at least one vehicle free on every day."""
    where = ["v.status = 'approved'"]
    params: list = []
    if city:
        where.append("lower(v.city) = lower(%s)")
        params.append(city.strip())
    if kind:
        where.append("v.kind = %s")
        params.append(kind)
    if seats:
        where.append("v.seats >= %s")
        params.append(seats)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT v.id, v.name, v.kind, v.seats, v.ac, v.city, v.price_per_day, v.km_per_day, v.quantity,
                       v.advance_percent,
                       (SELECT url FROM vehicle_photos WHERE vehicle_id = v.id ORDER BY position LIMIT 1) AS photo,
                       (SELECT MIN(price) FROM vehicle_trips WHERE vehicle_id = v.id AND active) AS trip_from
                FROM vehicles v WHERE {' AND '.join(where)} ORDER BY v.price_per_day, v.name LIMIT 100""",
            params,
        )
        rows = cur.fetchall()
        if start:
            last = end or start
            keep = []
            for r in rows:
                free = r["quantity"] - max_used(cur, str(r["id"]), start, max(last, start))
                if free > 0:
                    r["free"] = free
                    keep.append(r)
            rows = keep
        return rows


@public.get("/{vehicle_id}")
def vehicle_detail(vehicle_id: str, start: date | None = None, end: date | None = None):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT v.id, v.name, v.kind, v.seats, v.ac, v.city, v.description, v.price_per_day, v.km_per_day,
                      v.extra_km_rate, v.quantity, v.advance_percent, u.name AS operator
               FROM vehicles v JOIN users u ON u.id = v.operator_id
               WHERE v.id = %s AND v.status = 'approved'""",
            (vehicle_id,),
        )
        v = cur.fetchone()
        if not v:
            raise HTTPException(404, "Vehicle not found")
        cur.execute("SELECT id, url FROM vehicle_photos WHERE vehicle_id = %s ORDER BY position", (vehicle_id,))
        v["photos"] = cur.fetchall()
        cur.execute(
            "SELECT id, title, from_place, to_place, details, price FROM vehicle_trips WHERE vehicle_id = %s AND active ORDER BY price",
            (vehicle_id,),
        )
        v["trips"] = cur.fetchall()
        if start:
            v["free"] = v["quantity"] - max_used(cur, vehicle_id, start, max(end or start, start))
        return v


# ---------- operator ----------

def _own_vehicle(cur, vehicle_id: str, user: dict):
    cur.execute("SELECT operator_id FROM vehicles WHERE id = %s", (vehicle_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Vehicle not found")
    if user["role"] != "admin" and str(row["operator_id"]) != user["id"]:
        raise HTTPException(403, "That's not your vehicle")


@operator.post("/vehicles", status_code=201)
def create_vehicle(body: VehicleIn, user: dict = Depends(operator_only)):
    status = "approved" if user["role"] == "admin" else "pending"   # operators' listings wait for approval
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO vehicles (operator_id, name, kind, seats, ac, city, description, price_per_day,
                                     km_per_day, extra_km_rate, quantity, advance_percent, status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
            (user["id"], body.name, body.kind, body.seats, body.ac, body.city, body.description, body.price_per_day,
             body.km_per_day, body.extra_km_rate, body.quantity, body.advance_percent, status),
        )
        return {"id": cur.fetchone()["id"], "status": status}


@operator.get("/vehicles")
def my_vehicles(user: dict = Depends(operator_only)):
    sql = """SELECT v.id, v.name, v.kind, v.seats, v.city, v.price_per_day, v.quantity, v.status,
                    (SELECT url FROM vehicle_photos WHERE vehicle_id = v.id ORDER BY position LIMIT 1) AS photo
             FROM vehicles v WHERE v.status <> 'removed'"""
    params: tuple = ()
    if user["role"] != "admin":
        sql += " AND v.operator_id = %s"
        params = (user["id"],)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql + " ORDER BY v.created_at DESC", params)
        return cur.fetchall()


@operator.get("/vehicles/{vehicle_id}")
def my_vehicle(vehicle_id: str, user: dict = Depends(operator_only)):
    with get_conn() as conn, conn.cursor() as cur:
        _own_vehicle(cur, vehicle_id, user)
        cur.execute(
            """SELECT id, name, kind, seats, ac, city, description, price_per_day, km_per_day, extra_km_rate,
                      quantity, advance_percent, status FROM vehicles WHERE id = %s""",
            (vehicle_id,),
        )
        v = cur.fetchone()
        cur.execute("SELECT id, url, position FROM vehicle_photos WHERE vehicle_id = %s ORDER BY position", (vehicle_id,))
        v["photos"] = cur.fetchall()
        cur.execute(
            "SELECT id, title, from_place, to_place, details, price, active FROM vehicle_trips WHERE vehicle_id = %s ORDER BY created_at",
            (vehicle_id,),
        )
        v["trips"] = cur.fetchall()
        return v


@operator.patch("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: str, body: VehicleUpdate, user: dict = Depends(operator_only)):
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        _own_vehicle(cur, vehicle_id, user)
        sets = ", ".join(f"{col} = %s" for col in changes)  # column names come from the schema model
        cur.execute(f"UPDATE vehicles SET {sets} WHERE id = %s", (*changes.values(), vehicle_id))
        if user["role"] != "admin":
            cur.execute("UPDATE vehicles SET status = 'pending' WHERE id = %s AND status = 'rejected'", (vehicle_id,))
        cur.execute("SELECT status FROM vehicles WHERE id = %s", (vehicle_id,))
        return {"id": vehicle_id, "status": cur.fetchone()["status"]}


@operator.delete("/vehicles/{vehicle_id}")
def remove_vehicle(vehicle_id: str, user: dict = Depends(operator_only)):
    """Hides the vehicle from guests. The data stays on the server for 30 days (admin can restore it),
    then a nightly job deletes it for good. Refused while a guest has an upcoming or in-progress hire."""
    with get_conn() as conn, conn.cursor() as cur:
        _own_vehicle(cur, vehicle_id, user)
        cur.execute(
            """SELECT 1 FROM vehicle_bookings WHERE vehicle_id = %s
                 AND ((status = 'confirmed' AND end_date >= current_date)
                   OR (status = 'held' AND hold_expires_at > now())) LIMIT 1""",
            (vehicle_id,),
        )
        if cur.fetchone():
            raise HTTPException(409, "Guests have upcoming bookings for this vehicle. Wait until the trips are over, or cancel them first")
        cur.execute("UPDATE vehicles SET status = 'removed', removed_at = now() WHERE id = %s AND status <> 'removed'", (vehicle_id,))
    return {"id": vehicle_id, "result": "removed", "kept_days": REMOVED_KEEP_DAYS}


def purge_removed_vehicles() -> int:
    """Delete vehicles removed more than 30 days ago. Ones with booking history stay hidden (invoices refer to them)."""
    done = 0
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT v.id FROM vehicles v
               WHERE v.status = 'removed' AND v.removed_at < now() - make_interval(days => %s)
                 AND NOT EXISTS (SELECT 1 FROM vehicle_bookings b WHERE b.vehicle_id = v.id)""",
            (REMOVED_KEEP_DAYS,),
        )
        ids = [r["id"] for r in cur.fetchall()]
        keys: list[str] = []
        for vid in ids:
            cur.execute("SELECT storage_key FROM vehicle_photos WHERE vehicle_id = %s", (vid,))
            keys += [r["storage_key"] for r in cur.fetchall()]
            cur.execute("DELETE FROM vehicles WHERE id = %s", (vid,))
            done += 1
    for key in keys:
        delete_image(key)
    return done


@operator.post("/vehicles/{vehicle_id}/photos", status_code=201)
def upload_vehicle_photos(vehicle_id: str, files: list[UploadFile] = File(...), user: dict = Depends(operator_only)):
    return _upload_photos("vehicle_photos", "vehicle_id", vehicle_id, f"vehicles/{vehicle_id}", files, user, _own_vehicle)


@operator.delete("/vehicles/{vehicle_id}/photos/{photo_id}")
def delete_vehicle_photo(vehicle_id: str, photo_id: int, user: dict = Depends(operator_only)):
    return _delete_photo("vehicle_photos", "vehicle_id", vehicle_id, photo_id, user, _own_vehicle)


@operator.post("/vehicles/{vehicle_id}/trips", status_code=201)
def add_trip(vehicle_id: str, body: TripIn, user: dict = Depends(operator_only)):
    with get_conn() as conn, conn.cursor() as cur:
        _own_vehicle(cur, vehicle_id, user)
        cur.execute(
            "INSERT INTO vehicle_trips (vehicle_id, title, from_place, to_place, details, price) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            (vehicle_id, body.title, body.from_place, body.to_place, body.details, body.price),
        )
        return {"id": cur.fetchone()["id"]}


def _own_trip(cur, trip_id: str, user: dict) -> str:
    cur.execute("SELECT vehicle_id FROM vehicle_trips WHERE id = %s", (trip_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Trip not found")
    _own_vehicle(cur, str(row["vehicle_id"]), user)
    return str(row["vehicle_id"])


@operator.patch("/trips/{trip_id}")
def update_trip(trip_id: str, body: TripUpdate, user: dict = Depends(operator_only)):
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(400, "Nothing to change")
    with get_conn() as conn, conn.cursor() as cur:
        _own_trip(cur, trip_id, user)
        sets = ", ".join(f"{col} = %s" for col in changes)
        cur.execute(f"UPDATE vehicle_trips SET {sets} WHERE id = %s", (*changes.values(), trip_id))
        return {"id": trip_id, "updated": list(changes)}


@operator.delete("/trips/{trip_id}")
def remove_trip(trip_id: str, user: dict = Depends(operator_only)):
    """Trips with past bookings can't vanish, so removing one just stops it being offered."""
    with get_conn() as conn, conn.cursor() as cur:
        _own_trip(cur, trip_id, user)
        cur.execute("UPDATE vehicle_trips SET active = false WHERE id = %s", (trip_id,))
        return {"id": trip_id, "active": False}


@operator.get("/vehicle-bookings")
def operator_bookings(user: dict = Depends(operator_only)):
    sql = """SELECT b.id, v.name AS vehicle, t.title AS trip, b.start_date, b.end_date, b.count, b.passengers,
                    b.pickup, b.note, b.total_amount, b.advance_amount,
                    b.total_amount - b.advance_amount AS balance_due, b.status,
                    u.name AS guest, u.phone AS guest_phone
             FROM vehicle_bookings b
             JOIN vehicles v ON v.id = b.vehicle_id
             LEFT JOIN vehicle_trips t ON t.id = b.trip_id
             JOIN users u ON u.id = b.user_id
             WHERE b.status IN ('confirmed', 'cancelled')"""
    params: tuple = ()
    if user["role"] != "admin":
        sql += " AND v.operator_id = %s"
        params = (user["id"],)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql + " ORDER BY b.start_date DESC LIMIT 200", params)
        return cur.fetchall()


# ---------- guest bookings ----------

@guest.post("", status_code=201)
def create_vehicle_booking(body: VehicleBookingIn, user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_vehicle_holds(cur)
        # Locking the vehicle row makes concurrent bookings of the same vehicle take turns.
        cur.execute(
            """SELECT id, seats, quantity, price_per_day, advance_percent, status
               FROM vehicles WHERE id = %s FOR UPDATE""",
            (body.vehicle_id,),
        )
        v = cur.fetchone()
        if not v or v["status"] != "approved":
            raise HTTPException(404, "Vehicle not found")
        if body.count > v["quantity"]:
            raise HTTPException(400, f"Only {v['quantity']} of this vehicle are available")
        if body.passengers > v["seats"] * body.count:
            raise HTTPException(400, f"This vehicle seats {v['seats']}. Add another vehicle or choose a bigger one")

        if body.trip_id:
            cur.execute("SELECT price FROM vehicle_trips WHERE id = %s AND vehicle_id = %s AND active", (body.trip_id, body.vehicle_id))
            trip = cur.fetchone()
            if not trip:
                raise HTTPException(404, "That trip isn't offered any more")
            total = trip["price"] * body.count
        else:
            days = (body.end_date - body.start_date).days + 1
            total = v["price_per_day"] * days * body.count

        if v["quantity"] - max_used(cur, body.vehicle_id, body.start_date, body.end_date) < body.count:
            raise HTTPException(409, "That vehicle was just booked for your dates. Try other dates")

        advance = advance_for(total, v["advance_percent"])
        cur.execute(
            """INSERT INTO vehicle_bookings (user_id, vehicle_id, trip_id, start_date, end_date, count, passengers,
                                             pickup, note, total_amount, advance_amount, status, hold_expires_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'held', now() + make_interval(mins => %s))
               RETURNING id, total_amount, advance_amount, hold_expires_at""",
            (user["id"], body.vehicle_id, body.trip_id, body.start_date, body.end_date, body.count, body.passengers,
             body.pickup, body.note, total, advance, settings.hold_minutes),
        )
        b = cur.fetchone()
    return {"booking_id": b["id"], "status": "held", "total_amount": b["total_amount"], "advance_amount": b["advance_amount"],
            "balance_due": b["total_amount"] - b["advance_amount"], "pay_before": b["hold_expires_at"]}


@guest.get("/mine")
def my_vehicle_bookings(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        release_expired_vehicle_holds(cur)
        cur.execute(
            """SELECT b.id, v.name AS vehicle, v.kind, v.city, t.title AS trip, b.start_date, b.end_date, b.count,
                      b.passengers, b.pickup, b.total_amount, b.advance_amount,
                      b.total_amount - b.advance_amount AS balance_due, b.status, b.hold_expires_at,
                      CASE WHEN b.status = 'confirmed' THEN o.name END AS operator,
                      CASE WHEN b.status = 'confirmed' THEN o.phone END AS operator_phone,
                      EXISTS (SELECT 1 FROM payments pm WHERE pm.vehicle_booking_id = b.id AND pm.provider = 'upi_direct' AND pm.status = 'created') AS upi_pending,
                      (o.upi_id IS NOT NULL) AS host_upi
               FROM vehicle_bookings b
               JOIN vehicles v ON v.id = b.vehicle_id
               JOIN users o ON o.id = v.operator_id
               LEFT JOIN vehicle_trips t ON t.id = b.trip_id
               WHERE b.user_id = %s ORDER BY b.created_at DESC""",
            (user["id"],),
        )
        return cur.fetchall()


@guest.post("/{booking_id}/confirm")
def confirm_vehicle_booking(booking_id: str, user: dict = Depends(current_user)):
    """Dev-only shortcut, same switch as for rooms."""
    if not settings.allow_fake_confirm:
        raise HTTPException(403, "Payment is required to confirm a booking")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT user_id, status, hold_expires_at < now() AS late FROM vehicle_bookings WHERE id = %s FOR UPDATE", (booking_id,))
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] != "held" or b["late"]:
            raise HTTPException(409, "Your hold ended. Search again" if b["status"] in ("held", "expired") else f"This booking is already {b['status']}")
        cur.execute("UPDATE vehicle_bookings SET status = 'confirmed', hold_expires_at = NULL WHERE id = %s", (booking_id,))
    return {"booking_id": booking_id, "status": "confirmed"}


@guest.post("/{booking_id}/cancel")
def cancel_vehicle_booking(booking_id: str, user: dict = Depends(current_user)):
    refund_args = None
    refund = {"status": "none", "amount": 0, "reason": "no_payment"}
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, user_id, status, start_date FROM vehicle_bookings WHERE id = %s FOR UPDATE", (booking_id,))
        b = cur.fetchone()
        if not b or str(b["user_id"]) != user["id"]:
            raise HTTPException(404, "Booking not found")
        if b["status"] not in ("held", "confirmed"):
            raise HTTPException(409, f"This booking is already {b['status']}")
        if b["start_date"] < date.today():
            raise HTTPException(409, "You can't cancel a trip that has already started")
        cur.execute("UPDATE vehicle_bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = %s", (booking_id,))
        if b["status"] == "confirmed":
            cur.execute("SELECT id, provider_payment_id, amount FROM payments WHERE vehicle_booking_id = %s AND status = 'paid' FOR UPDATE", (booking_id,))
            pay = cur.fetchone()
            if pay:
                refund["reason"] = "too_late"
                cur.execute(
                    "SELECT (%s::date::timestamp AT TIME ZONE 'Asia/Kolkata') - now() >= make_interval(hours => %s) AS full",
                    (b["start_date"], settings.refund_full_hours),
                )
                if cur.fetchone()["full"]:
                    refund_args = (str(pay["id"]), pay["provider_payment_id"], pay["amount"], "Cancelled by guest")
                    refund = {"status": "refunded", "amount": pay["amount"], "reason": "full"}
    if refund_args:
        from .payments import refund_payment

        refund["status"] = refund_payment(*refund_args)
    return {"booking_id": booking_id, "status": "cancelled", "refund": refund}
