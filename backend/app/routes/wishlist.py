import uuid

from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_conn

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


def _pid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(404, "Place not found")


@router.get("/ids")
def saved_ids(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT property_id FROM wishlist WHERE user_id = %s", (user["id"],))
        return {"ids": [str(r["property_id"]) for r in cur.fetchall()]}


@router.get("")
def saved_places(user: dict = Depends(current_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT p.id, p.name, p.type, p.city, p.rating_avg, p.rating_count,
                      (SELECT MIN(base_price) FROM room_types rt WHERE rt.property_id = p.id) AS price_from,
                      (SELECT url FROM property_photos ph WHERE ph.property_id = p.id AND ph.status = 'approved' ORDER BY position LIMIT 1) AS photo
               FROM wishlist w JOIN properties p ON p.id = w.property_id
               WHERE w.user_id = %s AND p.status = 'approved'
               ORDER BY w.created_at DESC LIMIT 200""",
            (user["id"],),
        )
        return cur.fetchall()


@router.put("/{property_id}", status_code=204)
def save_place(property_id: str, user: dict = Depends(current_user)):
    pid = _pid(property_id)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM properties WHERE id = %s AND status = 'approved'", (pid,))
        if not cur.fetchone():
            raise HTTPException(404, "Place not found")
        cur.execute(
            "INSERT INTO wishlist (user_id, property_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user["id"], pid),
        )


@router.delete("/{property_id}", status_code=204)
def unsave_place(property_id: str, user: dict = Depends(current_user)):
    pid = _pid(property_id)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM wishlist WHERE user_id = %s AND property_id = %s", (user["id"], pid))
