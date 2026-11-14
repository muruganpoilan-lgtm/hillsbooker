import logging
import re
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import payout_service, razorpayx
from ..auth import require_role
from ..db import get_conn

log = logging.getLogger("roomly")
router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_role("admin")


@router.get("/properties/pending")
def pending_properties(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.name, p.type, p.city, p.created_at, u.name AS owner, u.email AS owner_email
               FROM properties p JOIN users u ON u.id = p.owner_id
               WHERE p.status = 'pending' ORDER BY p.created_at""",
        )
        return cur.fetchall()


def _set_status(property_id: str, status: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE properties SET status = %s WHERE id = %s RETURNING id", (status, property_id))
        if not cur.fetchone():
            raise HTTPException(404, "Property not found")
    return {"id": property_id, "status": status}


@router.post("/properties/{property_id}/approve")
def approve(property_id: str, user: dict = Depends(admin_only)):
    return _set_status(property_id, "approved")


@router.post("/properties/{property_id}/reject")
def reject(property_id: str, user: dict = Depends(admin_only)):
    return _set_status(property_id, "rejected")


@router.get("/vehicles/pending")
def pending_vehicles(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT v.id, v.name, v.kind, v.seats, v.city, v.price_per_day, v.created_at, u.name AS operator, u.email AS operator_email
               FROM vehicles v JOIN users u ON u.id = v.operator_id
               WHERE v.status = 'pending' ORDER BY v.created_at""",
        )
        return cur.fetchall()


def _set_vehicle_status(vehicle_id: str, status: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE vehicles SET status = %s WHERE id = %s RETURNING id", (status, vehicle_id))
        if not cur.fetchone():
            raise HTTPException(404, "Vehicle not found")
    return {"id": vehicle_id, "status": status}


@router.post("/vehicles/{vehicle_id}/approve")
def approve_vehicle(vehicle_id: str, user: dict = Depends(admin_only)):
    return _set_vehicle_status(vehicle_id, "approved")


@router.post("/vehicles/{vehicle_id}/reject")
def reject_vehicle(vehicle_id: str, user: dict = Depends(admin_only)):
    return _set_vehicle_status(vehicle_id, "rejected")


# ---------- removed listings (kept 30 days, then deleted) ----------

@router.get("/removed")
def removed_listings(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT 'property' AS kind, p.id, p.name, p.city, p.removed_at, u.email AS host_email
               FROM properties p JOIN users u ON u.id = p.owner_id WHERE p.status = 'removed'
               UNION ALL
               SELECT 'vehicle', v.id, v.name, v.city, v.removed_at, u.email
               FROM vehicles v JOIN users u ON u.id = v.operator_id WHERE v.status = 'removed'
               ORDER BY removed_at DESC""",
        )
        return cur.fetchall()


@router.post("/properties/{property_id}/restore")
def restore_property(property_id: str, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE properties SET status = 'approved', removed_at = NULL WHERE id = %s AND status = 'removed' RETURNING id", (property_id,))
        if not cur.fetchone():
            raise HTTPException(404, "No removed property with that id")
    return {"id": property_id, "status": "approved"}


@router.post("/vehicles/{vehicle_id}/restore")
def restore_vehicle(vehicle_id: str, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE vehicles SET status = 'approved', removed_at = NULL WHERE id = %s AND status = 'removed' RETURNING id", (vehicle_id,))
        if not cur.fetchone():
            raise HTTPException(404, "No removed vehicle with that id")
    return {"id": vehicle_id, "status": "approved"}


# ---------- payouts: what Hill Booker owes hosts for payments made online ----------

# A payment is ready to pay out when it was paid online, is not paid out yet, its booking is confirmed and check-in has passed.
# The host's share is what the guest paid, minus Hill Booker's commission, minus any refund.
# "separate" marks a property whose real owner has their own UPI ID or bank account saved by the admin: its share is
# paid to that owner on its own line, not to the account that holds the listing.
_PAYOUT_READY = """
SELECT pm.id AS payment_id, (pm.amount - pm.commission - pm.refunded_amount) AS share,
       s.host_id, s.item, s.guest, s.start_date, s.end_date, s.property_id, s.separate
FROM payments pm
JOIN (
  SELECT 'stay' AS kind, b.id, b.status, p.name AS item, g.name AS guest, b.check_in AS start_date, b.check_out AS end_date, p.owner_id AS host_id,
         p.id AS property_id, (COALESCE(p.owner_upi, '') <> '' OR COALESCE(p.owner_bank_account, '') <> '') AS separate
  FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.user_id
  UNION ALL
  SELECT 'vehicle', b.id, b.status, v.name, g.name, b.start_date, b.end_date, v.operator_id, NULL::uuid, false
  FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users g ON g.id = b.user_id
) s ON (s.kind = 'stay' AND pm.booking_id = s.id) OR (s.kind = 'vehicle' AND pm.vehicle_booking_id = s.id)
WHERE pm.status = 'paid' AND pm.provider IN ('razorpay', 'cashfree') AND pm.payout_id IS NULL
  AND s.status = 'confirmed' AND s.start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  AND (pm.amount - pm.commission - pm.refunded_amount) > 0
"""


def _bank(r) -> dict | None:
    """A host's bank details for the admin to pay by bank transfer (admin-only screen)."""
    if not r.get("bank_account"):
        return None
    return {"holder": r["bank_holder"], "account": r["bank_account"], "ifsc": r["bank_ifsc"]}


def _owner_payee(r) -> dict:
    """The payout line for one property's real owner (details the admin saved on the property)."""
    bank = None
    if r.get("owner_bank_account"):
        bank = {"holder": r["owner_bank_holder"], "account": r["owner_bank_account"], "ifsc": r["owner_bank_ifsc"]}
    return {"host_id": str(r["host_id"]), "property_id": str(r["property_id"]), "property_name": r["item"],
            "host_name": r["owner_name"] or f"Owner of {r['item']}", "upi_id": r["owner_upi"], "phone": r["owner_whatsapp"], "bank": bank}


@router.get("/payouts")
def payouts_overview(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""SELECT r.*, h.name AS host_name, h.upi_id, h.phone, h.bank_holder, h.bank_account, h.bank_ifsc,
                       p.owner_name, p.owner_whatsapp, p.owner_upi, p.owner_bank_account, p.owner_bank_ifsc, p.owner_bank_holder
                FROM ({_PAYOUT_READY}) r JOIN users h ON h.id = r.host_id LEFT JOIN properties p ON p.id = r.property_id
                ORDER BY h.name, r.start_date"""
        )
        rows = cur.fetchall()
        cur.execute(
            """SELECT po.id, po.amount, po.upi_id, po.reference, po.paid_at,
                      CASE WHEN po.property_id IS NULL THEN h.name ELSE COALESCE(NULLIF(p.owner_name, ''), 'Owner') || ' (' || p.name || ')' END AS host_name,
                      po.method, po.status, po.failure_reason, po.destination
               FROM payouts po JOIN users h ON h.id = po.host_id LEFT JOIN properties p ON p.id = po.property_id
               ORDER BY po.paid_at DESC LIMIT 100"""
        )
        history = cur.fetchall()
        cur.execute("SELECT COALESCE(sum(amount), 0) AS total FROM payouts WHERE status <> 'failed'")
        paid_total = cur.fetchone()["total"]
        cur.execute(
            """SELECT u.id, u.name, u.phone, u.upi_id, u.bank_holder, u.bank_account, u.bank_ifsc,
                      COALESCE((SELECT sum(amount) FROM payouts WHERE host_id = u.id AND property_id IS NULL AND status <> 'failed'), 0) AS paid_out
               FROM users u WHERE u.role IN ('owner', 'operator') ORDER BY u.name"""
        )
        everyone = cur.fetchall()
        # Every property where the admin saved the real owner's details, so the admin can see where to pay each one.
        cur.execute(
            """SELECT p.id, p.name, p.city, p.status, p.owner_name, p.owner_whatsapp, p.owner_upi, p.owner_bank_account, p.owner_bank_ifsc, p.owner_bank_holder,
                      h.name AS account_name,
                      COALESCE((SELECT sum(amount) FROM payouts WHERE property_id = p.id AND status <> 'failed'), 0) AS paid_out
               FROM properties p JOIN users h ON h.id = p.owner_id
               WHERE p.status <> 'removed' AND (COALESCE(p.owner_name, '') <> '' OR COALESCE(p.owner_whatsapp, '') <> ''
                     OR COALESCE(p.owner_upi, '') <> '' OR COALESCE(p.owner_bank_account, '') <> '')
               ORDER BY p.name"""
        )
        owner_props = cur.fetchall()
    hosts: dict[str, dict] = {}
    for r in rows:
        if r["separate"]:
            key = f"p:{r['property_id']}"
            base = _owner_payee(r)
        else:
            key = str(r["host_id"])
            base = {"host_id": str(r["host_id"]), "property_id": None, "host_name": r["host_name"], "upi_id": r["upi_id"], "phone": r["phone"], "bank": _bank(r)}
        h = hosts.setdefault(key, {**base, "key": key, "amount": Decimal(0), "items": []})
        h["amount"] += Decimal(r["share"])
        item = {"item": r["item"], "guest": r["guest"], "start_date": r["start_date"], "end_date": r["end_date"], "share": r["share"]}
        if not r["separate"] and r["owner_name"]:
            item["owner_name"] = r["owner_name"]  # owner saved, but no UPI or bank yet: paid with the account's other listings
        h["items"].append(item)
    host_list = list(hosts.values())
    all_hosts = [
        {"host_id": str(e["id"]), "host_name": e["name"], "phone": e["phone"], "upi_id": e["upi_id"], "has_bank": bool(e["bank_account"]),
         "due": hosts[str(e["id"])]["amount"] if str(e["id"]) in hosts else Decimal(0), "paid_out": e["paid_out"]}
        for e in everyone
    ]
    property_owners = [
        {"property_id": str(o["id"]), "property_name": o["name"], "city": o["city"], "status": o["status"], "account_name": o["account_name"],
         "owner_name": o["owner_name"], "whatsapp": o["owner_whatsapp"], "upi_id": o["owner_upi"],
         "bank": {"holder": o["owner_bank_holder"], "account": o["owner_bank_account"], "ifsc": o["owner_bank_ifsc"]} if o["owner_bank_account"] else None,
         "due": hosts[f"p:{o['id']}"]["amount"] if f"p:{o['id']}" in hosts else Decimal(0), "paid_out": o["paid_out"]}
        for o in owner_props
    ]
    return {"all_hosts": all_hosts, "property_owners": property_owners, "hosts": host_list, "due_total": sum((h["amount"] for h in host_list), Decimal(0)),
            "paid_total": paid_total, "history": history, "razorpayx_enabled": razorpayx.enabled()}


class XItem(BaseModel):
    host_id: str
    expected_amount: Decimal


class XPayIn(BaseModel):
    items: list[XItem] = Field(min_length=1, max_length=50)


@router.post("/payouts/razorpayx")
def pay_via_razorpayx(body: XPayIn, user: dict = Depends(admin_only)):
    """Pays each listed host their due share through RazorpayX. One host failing never stops the others."""
    if not razorpayx.enabled():
        raise HTTPException(409, "Automatic payouts are not switched on yet")
    seen: set[str] = set()
    results = []
    for it in body.items:
        if it.host_id in seen:
            continue
        seen.add(it.host_id)
        try:
            results.append(payout_service.pay_host(it.host_id, it.expected_amount, user["id"]))
        except Exception:
            log.exception("RazorpayX payout for host %s crashed", it.host_id)
            results.append({"host_id": it.host_id, "ok": None, "message": "Something went wrong. Check Paid out below before trying again"})
    return {"results": results}


@router.post("/payouts/{payout_id}/sync")
def sync_payout(payout_id: str, user: dict = Depends(admin_only)):
    """Asks Razorpay where a payout stands and updates it here."""
    try:
        status = payout_service.sync(payout_id)
    except LookupError:
        raise HTTPException(404, "Payout not found")
    except razorpayx.RazorpayError as e:
        raise HTTPException(502, f"Razorpay: {e}")
    return {"status": status}


class ReleaseIn(BaseModel):
    confirm_not_sent: bool = False


@router.post("/payouts/{payout_id}/release")
def release_payout(payout_id: str, body: ReleaseIn, user: dict = Depends(admin_only)):
    """For a payout stuck on 'processing' because Razorpay never answered. Makes the money due again, so only use
    it after checking in RazorpayX that nothing was sent."""
    if not body.confirm_not_sent:
        raise HTTPException(400, "Confirm that you checked RazorpayX and no money was sent")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT provider_payout_id FROM payouts WHERE id = %s AND method = 'razorpayx' AND status = 'processing'", (payout_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(404, "No processing payout with that id")
    if row["provider_payout_id"]:
        try:
            state = payout_service.sync(payout_id)  # Razorpay may have settled it meanwhile
        except razorpayx.RazorpayError as e:
            raise HTTPException(502, f"Could not ask Razorpay: {e}")
        if state == "failed":
            return {"released": True}  # Razorpay itself says it failed, and the money is due again
    if not payout_service.release(payout_id, "Released by admin: no money was sent"):
        raise HTTPException(409, "Razorpay shows this payout as sent or still in progress, so it cannot be released")
    return {"released": True}


class PayoutIn(BaseModel):
    host_id: str
    reference: str
    expected_amount: Decimal
    property_id: str | None = None  # set when paying one property's own owner (their UPI or bank saved on the property)


@router.post("/payouts")
def record_payout(body: PayoutIn, user: dict = Depends(admin_only)):
    """Records that you paid a host by UPI. Covers every payment that is ready for that host right now.
    expected_amount is what the screen showed: if it changed meanwhile (a refund, a new check-in), nothing is saved."""
    ref = body.reference.strip()
    if not re.fullmatch(r"[A-Za-z0-9]{6,30}", ref):
        raise HTTPException(400, "Enter the reference of your transfer (letters and numbers only, 6 to 30 characters)")
    with get_conn() as conn, conn.cursor() as cur:
        if body.property_id:
            cur.execute("SELECT owner_id AS host_id, owner_upi AS upi_id FROM properties WHERE id = %s", (body.property_id,))
            host = cur.fetchone()
            if not host or str(host["host_id"]) != body.host_id:
                raise HTTPException(404, "Property not found")
            where, args = "r.property_id = %s AND r.separate", (body.property_id,)
        else:
            cur.execute("SELECT upi_id FROM users WHERE id = %s", (body.host_id,))
            host = cur.fetchone()
            if not host:
                raise HTTPException(404, "Host not found")
            where, args = "r.host_id = %s AND NOT r.separate", (body.host_id,)
        cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE {where}", args)
        ready = cur.fetchall()
        if ready:
            cur.execute("SELECT id FROM payments WHERE id = ANY(%s) FOR UPDATE", ([r["payment_id"] for r in ready],))
            cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE {where}", args)
            ready = cur.fetchall()
        total = sum((Decimal(r["share"]) for r in ready), Decimal(0))
        if total <= 0:
            raise HTTPException(409, "Nothing is due to this host right now. Refresh the page")
        if total != body.expected_amount:
            raise HTTPException(409, f"The amount due changed to Rs {total:,.2f} since you opened this page. Refresh and check before paying")
        cur.execute(
            "INSERT INTO payouts (host_id, amount, upi_id, reference, created_by, property_id) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, paid_at",
            (body.host_id, total, host["upi_id"], ref, user["id"], body.property_id),
        )
        po = cur.fetchone()
        cur.execute("UPDATE payments SET payout_id = %s WHERE id = ANY(%s)", (po["id"], [r["payment_id"] for r in ready]))
    return {"id": str(po["id"]), "amount": total, "paid_at": po["paid_at"], "payments": len(ready)}


# ---------- overview: the numbers on the admin home page ----------

_IST_TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date"


@router.get("/overview")
def overview(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        # Confirmed bookings (stays and vehicles) with the day they were made, India time.
        bookings_cte = f"""
          WITH b AS (
            SELECT 'stay' AS kind, id, (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, total_amount, property_id, NULL::uuid AS vehicle_id
              FROM bookings WHERE status = 'confirmed'
            UNION ALL
            SELECT 'vehicle', id, (created_at AT TIME ZONE 'Asia/Kolkata')::date, total_amount, NULL::uuid, vehicle_id
              FROM vehicle_bookings WHERE status = 'confirmed'
          )"""
        cur.execute(
            bookings_cte
            + f"""SELECT
                 count(*) FILTER (WHERE day = {_IST_TODAY}) AS today,
                 count(*) FILTER (WHERE day > {_IST_TODAY} - 7) AS week,
                 count(*) FILTER (WHERE day > {_IST_TODAY} - 30) AS month,
                 count(*) AS total,
                 count(*) FILTER (WHERE kind = 'stay' AND day > {_IST_TODAY} - 30) AS month_stays,
                 count(*) FILTER (WHERE kind = 'vehicle' AND day > {_IST_TODAY} - 30) AS month_vehicles,
                 COALESCE(sum(total_amount) FILTER (WHERE day > {_IST_TODAY} - 30), 0) AS month_value
               FROM b"""
        )
        bookings = cur.fetchone()

        # Money that came in online. A payment counts on the day it was paid; refunds are taken off.
        cur.execute(
            f"""SELECT
                 COALESCE(sum(amount - refunded_amount) FILTER (WHERE d = {_IST_TODAY}), 0) AS today,
                 COALESCE(sum(amount - refunded_amount) FILTER (WHERE d > {_IST_TODAY} - 7), 0) AS week,
                 COALESCE(sum(amount - refunded_amount) FILTER (WHERE d > {_IST_TODAY} - 30), 0) AS month,
                 COALESCE(sum(commission) FILTER (WHERE d > {_IST_TODAY} - 30 AND status = 'paid'), 0) AS month_commission,
                 COALESCE(sum(commission) FILTER (WHERE status = 'paid'), 0) AS total_commission,
                 COALESCE(sum(refunded_amount) FILTER (WHERE d > {_IST_TODAY} - 30), 0) AS month_refunded
               FROM (SELECT amount, refunded_amount, commission, status, (updated_at AT TIME ZONE 'Asia/Kolkata')::date AS d
                     FROM payments WHERE status IN ('paid', 'refunded') AND provider IN ('razorpay', 'cashfree')) p"""
        )
        money = cur.fetchone()

        # Last 14 days, one row per day, so the chart has no gaps.
        cur.execute(
            bookings_cte
            + f"""SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
                         count(b.id) AS bookings, COALESCE(sum(b.total_amount), 0) AS value
                  FROM generate_series({_IST_TODAY} - 13, {_IST_TODAY}, interval '1 day') AS g(day)
                  LEFT JOIN b ON b.day = g.day::date
                  GROUP BY g.day ORDER BY g.day"""
        )
        daily = cur.fetchall()

        cur.execute(
            bookings_cte
            + f"""SELECT COALESCE(p.city, v.city) AS city, count(*) AS bookings
                  FROM b LEFT JOIN properties p ON p.id = b.property_id LEFT JOIN vehicles v ON v.id = b.vehicle_id
                  WHERE b.day > {_IST_TODAY} - 30
                  GROUP BY 1 ORDER BY bookings DESC, city LIMIT 5"""
        )
        top_cities = cur.fetchall()

        cur.execute(
            f"""SELECT
                 (SELECT count(*) FROM users) AS users,
                 (SELECT count(*) FROM users WHERE created_at > now() - interval '7 days') AS new_users,
                 (SELECT count(*) FROM users WHERE role IN ('owner', 'operator')) AS hosts,
                 (SELECT count(*) FROM properties WHERE status = 'approved') AS properties,
                 (SELECT count(*) FROM vehicles WHERE status = 'approved') AS vehicles,
                 (SELECT count(*) FROM properties WHERE status = 'pending') AS pending_properties,
                 (SELECT count(*) FROM vehicles WHERE status = 'pending') AS pending_vehicles,
                 (SELECT count(*) FROM enquiries WHERE status = 'new') AS new_enquiries,
                 (SELECT count(*) FROM support_tickets WHERE status <> 'resolved') AS open_tickets,
                 (SELECT count(*) FROM bookings WHERE status = 'confirmed' AND check_in = {_IST_TODAY} + 1) AS checkins_tomorrow,
                 (SELECT count(*) FROM bookings WHERE status = 'confirmed' AND check_in BETWEEN {_IST_TODAY} AND {_IST_TODAY} + 7) AS checkins_week"""
        )
        counts = cur.fetchone()

        cur.execute(f"SELECT COALESCE(sum(share), 0) AS due FROM ({_PAYOUT_READY}) r")
        due = cur.fetchone()["due"]

        cur.execute(
            """SELECT * FROM (
                 SELECT 'stay' AS kind, b.created_at, p.name AS item, g.name AS guest, b.total_amount, b.check_in AS start_date
                   FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.user_id WHERE b.status = 'confirmed'
                 UNION ALL
                 SELECT 'vehicle', b.created_at, v.name, g.name, b.total_amount, b.start_date
                   FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users g ON g.id = b.user_id WHERE b.status = 'confirmed'
               ) x ORDER BY created_at DESC LIMIT 8"""
        )
        recent = cur.fetchall()
    return {"bookings": bookings, "money": money, "daily": daily, "top_cities": top_cities, "counts": counts, "payouts_due": due, "recent": recent}


@router.get("/badges")
def badges(user: dict = Depends(admin_only)):
    """Small counts for the admin side menu: what is waiting for the admin."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT
                 (SELECT count(*) FROM properties WHERE status = 'pending') AS pending_properties,
                 (SELECT count(*) FROM vehicles WHERE status = 'pending') AS pending_vehicles,
                 (SELECT count(*) FROM enquiries WHERE status = 'new') AS new_enquiries,
                 (SELECT count(*) FROM support_tickets WHERE status <> 'resolved') AS open_tickets,
                 (SELECT count(*) FROM property_photos WHERE status = 'pending')
                   + (SELECT count(*) FROM room_type_photos WHERE status = 'pending')
                   + (SELECT count(*) FROM vehicle_photos WHERE status = 'pending') AS pending_photos"""
        )
        out = cur.fetchone()
        cur.execute(f"SELECT COALESCE(sum(share), 0) AS due FROM ({_PAYOUT_READY}) r")
        out["payouts_due"] = cur.fetchone()["due"]
        return out


# ---------- photo review: photos from hosts wait here until the admin approves them ----------

_PHOTO_TABLE = {"property": "property_photos", "room": "room_type_photos", "vehicle": "vehicle_photos"}


@router.get("/photos/pending")
def pending_photos(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT * FROM (
                 SELECT 'property' AS kind, ph.id, ph.url, ph.created_at, p.id AS listing_id, p.name AS listing, p.city, NULL::text AS room, h.name AS host
                   FROM property_photos ph JOIN properties p ON p.id = ph.property_id JOIN users h ON h.id = p.owner_id
                  WHERE ph.status = 'pending' AND p.status <> 'removed'
                 UNION ALL
                 SELECT 'room', ph.id, ph.url, ph.created_at, p.id, p.name, p.city, rt.name, h.name
                   FROM room_type_photos ph JOIN room_types rt ON rt.id = ph.room_type_id
                   JOIN properties p ON p.id = rt.property_id JOIN users h ON h.id = p.owner_id
                  WHERE ph.status = 'pending' AND p.status <> 'removed'
                 UNION ALL
                 SELECT 'vehicle', ph.id, ph.url, ph.created_at, v.id, v.name, v.city, NULL, h.name
                   FROM vehicle_photos ph JOIN vehicles v ON v.id = ph.vehicle_id JOIN users h ON h.id = v.operator_id
                  WHERE ph.status = 'pending' AND v.status <> 'removed'
               ) x ORDER BY listing, created_at LIMIT 500"""
        )
        return cur.fetchall()


class PhotoRef(BaseModel):
    kind: Literal["property", "room", "vehicle"]
    id: int


class PhotoReview(BaseModel):
    items: list[PhotoRef] = Field(min_length=1, max_length=200)
    action: Literal["approve", "reject"]
    reason: Optional[str] = Field(default=None, max_length=200)


@router.post("/photos/review")
def review_photos(body: PhotoReview, user: dict = Depends(admin_only)):
    """Approves or rejects photos that are still waiting. A rejected photo stays with the host, with the reason, until they remove it."""
    reason = (body.reason or "").strip()
    if body.action == "reject" and len(reason) < 3:
        raise HTTPException(400, "Write a short reason, so the host knows what to fix")
    done = 0
    with get_conn() as conn, conn.cursor() as cur:
        for kind, table in _PHOTO_TABLE.items():
            ids = [i.id for i in body.items if i.kind == kind]
            if not ids:
                continue
            cur.execute(
                f"UPDATE {table} SET status = %s, reject_reason = %s WHERE id = ANY(%s) AND status = 'pending' RETURNING id",
                ("approved" if body.action == "approve" else "rejected", reason if body.action == "reject" else None, ids),
            )
            done += len(cur.fetchall())
    return {"updated": done}
