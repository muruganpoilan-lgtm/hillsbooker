"""Travel guides (blog). Anyone can read published posts; only the admin writes them."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ..auth import require_role
from ..db import get_conn
from .owner import _delete_photo, _upload_photos

public = APIRouter(prefix="/blog", tags=["blog"])
admin = APIRouter(prefix="/admin/blog", tags=["blog (admin)"])
admin_only = require_role("admin")


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:70] or "guide"


def _exists(cur, post_id: str, user: dict):
    cur.execute("SELECT id FROM blog_posts WHERE id = %s", (post_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Guide not found")


def _clean(v: Optional[str]) -> Optional[str]:
    v = (v or "").strip()
    return v or None


# ---------- readers ----------

@public.get("")
def list_posts():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT b.id, b.slug, b.title, b.city, b.summary, b.published_at,
                      (SELECT url FROM blog_photos WHERE post_id = b.id ORDER BY position LIMIT 1) AS photo
               FROM blog_posts b WHERE b.published ORDER BY b.published_at DESC NULLS LAST, b.created_at DESC"""
        )
        return cur.fetchall()


@public.get("/{slug}")
def get_post(slug: str):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM blog_posts WHERE slug = %s AND published", (slug,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Guide not found")
        cur.execute("SELECT id, url FROM blog_photos WHERE post_id = %s ORDER BY position", (p["id"],))
        p["photos"] = cur.fetchall()
        return p


# ---------- admin ----------

class PostIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    city: Optional[str] = Field(default=None, max_length=80)
    summary: Optional[str] = Field(default=None, max_length=300)
    body: str = Field(default="", max_length=40000)
    published: bool = False


@admin.get("")
def admin_list(user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, slug, title, city, published, published_at, updated_at FROM blog_posts ORDER BY created_at DESC")
        return cur.fetchall()


@admin.get("/{post_id}")
def admin_get(post_id: str, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM blog_posts WHERE id = %s", (post_id,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Guide not found")
        cur.execute("SELECT id, url FROM blog_photos WHERE post_id = %s ORDER BY position", (post_id,))
        p["photos"] = cur.fetchall()
        return p


@admin.post("", status_code=201)
def admin_create(body: PostIn, user: dict = Depends(admin_only)):
    base = _slugify(body.title)
    with get_conn() as conn, conn.cursor() as cur:
        slug, n = base, 1
        while True:
            cur.execute("SELECT 1 FROM blog_posts WHERE slug = %s", (slug,))
            if not cur.fetchone():
                break
            n += 1
            slug = f"{base}-{n}"
        cur.execute(
            """INSERT INTO blog_posts (slug, title, city, summary, body, published, published_at)
               VALUES (%s,%s,%s,%s,%s,%s, CASE WHEN %s THEN now() END) RETURNING *""",
            (slug, body.title.strip(), _clean(body.city), _clean(body.summary), body.body, body.published, body.published),
        )
        return cur.fetchone()


@admin.put("/{post_id}")
def admin_update(post_id: str, body: PostIn, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE blog_posts SET title=%s, city=%s, summary=%s, body=%s, published=%s,
                      published_at = CASE WHEN %s AND published_at IS NULL THEN now() ELSE published_at END,
                      updated_at = now()
               WHERE id=%s RETURNING *""",
            (body.title.strip(), _clean(body.city), _clean(body.summary), body.body, body.published, body.published, post_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Guide not found")
        return row


@admin.delete("/{post_id}")
def admin_delete(post_id: str, user: dict = Depends(admin_only)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM blog_posts WHERE id = %s RETURNING id", (post_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Guide not found")
    return {"deleted": post_id}


@admin.post("/{post_id}/photos", status_code=201)
def admin_upload_photos(post_id: str, files: list[UploadFile] = File(...), user: dict = Depends(admin_only)):
    return _upload_photos("blog_photos", "post_id", post_id, f"blog/{post_id}", files, user, _exists)


@admin.delete("/{post_id}/photos/{photo_id}")
def admin_delete_photo(post_id: str, photo_id: int, user: dict = Depends(admin_only)):
    return _delete_photo("blog_photos", "post_id", post_id, photo_id, user, _exists)
