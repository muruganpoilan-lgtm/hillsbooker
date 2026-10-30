import re
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_role
from ..db import get_conn

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
_PAYOUT_READY = """
SELECT pm.id AS payment_id, (pm.amount - pm.commission - pm.refunded_amount) AS share,
       s.host_id, s.item, s.guest, s.start_date, s.end_date
FROM payments pm
JOIN (
  SELECT 'stay' AS kind, b.id, b.status, p.name AS item, g.name AS guest, b.check_in AS start_date, b.check_out AS end_date, p.owner_id AS host_id
  FROM bookings b JOIN properties p ON p.id = b.property_id JOIN users g ON g.id = b.user_id
  UNION ALL
  SELECT 'vehicle', b.id, b.status, v.name, g.name, b.start_date, b.end_date, v.operator_id
  FROM vehicle_bookings b JOIN vehicles v ON v.id = b.vehicle_id JOIN users g ON g.id = b.user_id
) s ON (s.kind = 'stay' AND pm.booking_id = s.id) OR (s.kind = 'vehicle' AND pm.vehicle_booking_id = s.id)
WHERE pm.status = 'paid' AND pm.provider IN ('razorpay', 'cashfree') AND pm.payout_id IS NULL
  AND s.status = 'confirmed' AND s.start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  AND (pm.amount - pm.commission - pm.refunded_amount) > 0
"""


@router.get("/payouts")
def payouts_overview(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT r.*, h.name AS host_name, h.upi_id, h.phone FROM ({_PAYOUT_READY}) r JOIN users h ON h.id = r.host_id ORDER BY h.name, r.start_date")
        rows = cur.fetchall()
        cur.execute(
            """SELECT po.id, po.amount, po.upi_id, po.reference, po.paid_at, h.name AS host_name
               FROM payouts po JOIN users h ON h.id = po.host_id ORDER BY po.paid_at DESC LIMIT 100"""
        )
        history = cur.fetchall()
        cur.execute("SELECT COALESCE(sum(amount), 0) AS total FROM payouts")
        paid_total = cur.fetchone()["total"]
        cur.execute(
            """SELECT u.id, u.name, u.phone, u.upi_id, COALESCE((SELECT sum(amount) FROM payouts WHERE host_id = u.id), 0) AS paid_out
               FROM users u WHERE u.role IN ('owner', 'operator') ORDER BY u.name"""
        )
        everyone = cur.fetchall()
    hosts: dict[str, dict] = {}
    for r in rows:
        h = hosts.setdefault(str(r["host_id"]), {"host_id": str(r["host_id"]), "host_name": r["host_name"], "upi_id": r["upi_id"], "phone": r["phone"], "amount": Decimal(0), "items": []})
        h["amount"] += Decimal(r["share"])
        h["items"].append({"item": r["item"], "guest": r["guest"], "start_date": r["start_date"], "end_date": r["end_date"], "share": r["share"]})
    host_list = list(hosts.values())
    all_hosts = [
        {"host_id": str(e["id"]), "host_name": e["name"], "phone": e["phone"], "upi_id": e["upi_id"],
         "due": hosts[str(e["id"])]["amount"] if str(e["id"]) in hosts else Decimal(0), "paid_out": e["paid_out"]}
        for e in everyone
    ]
    return {"all_hosts": all_hosts, "hosts": host_list, "due_total": sum((h["amount"] for h in host_list), Decimal(0)), "paid_total": paid_total, "history": history}


class PayoutIn(BaseModel):
    host_id: str
    reference: str
    expected_amount: Decimal


@router.post("/payouts")
def record_payout(body: PayoutIn, user: dict = Depends(admin_only)):
    """Records that you paid a host by UPI. Covers every payment that is ready for that host right now.
    expected_amount is what the screen showed: if it changed meanwhile (a refund, a new check-in), nothing is saved."""
    ref = body.reference.strip()
    if not re.fullmatch(r"[A-Za-z0-9]{6,30}", ref):
        raise HTTPException(400, "Enter the UPI reference of your transfer (letters and numbers only, 6 to 30 characters)")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT upi_id FROM users WHERE id = %s", (body.host_id,))
        host = cur.fetchone()
        if not host:
            raise HTTPException(404, "Host not found")
        cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE r.host_id = %s", (body.host_id,))
        ready = cur.fetchall()
        if ready:
            cur.execute("SELECT id FROM payments WHERE id = ANY(%s) FOR UPDATE", ([r["payment_id"] for r in ready],))
            cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE r.host_id = %s", (body.host_id,))
            ready = cur.fetchall()
        total = sum((Decimal(r["share"]) for r in ready), Decimal(0))
        if total <= 0:
            raise HTTPException(409, "Nothing is due to this host right now. Refresh the page")
        if total != body.expected_amount:
            raise HTTPException(409, f"The amount due changed to Rs {total:,.2f} since you opened this page. Refresh and check before paying")
        cur.execute(
            "INSERT INTO payouts (host_id, amount, upi_id, reference, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id, paid_at",
            (body.host_id, total, host["upi_id"], ref, user["id"]),
        )
        po = cur.fetchone()
        cur.execute("UPDATE payments SET payout_id = %s WHERE id = ANY(%s)", (po["id"], [r["payment_id"] for r in ready]))
    return {"id": str(po["id"]), "amount": total, "paid_at": po["paid_at"], "payments": len(ready)}
