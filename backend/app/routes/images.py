"""Smaller copies of uploaded photos, so pages don't download a 5 MB phone photo to show a 300 px card.

GET /img/<storage key>?w=640 returns the photo at that width as WebP. The first request makes the copy and keeps it
under uploads/_thumbs; later requests are served straight from disk, and browsers may keep it for a year (the key
never changes for a given photo). Works for every photo already uploaded, with nothing to run first."""
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from PIL import Image, ImageOps

from ..storage import upload_root

router = APIRouter(tags=["images"])

WIDTHS = (320, 640, 960, 1600)
THUMBS = "_thumbs"
CACHE = {"Cache-Control": "public, max-age=31536000, immutable"}
Image.MAX_IMAGE_PIXELS = 60_000_000  # refuse absurdly large images instead of using all the memory


def _source(key: str) -> Path:
    root = upload_root().resolve()
    path = (root / key).resolve()
    if root not in path.parents or not path.is_file() or path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(404, "Photo not found")
    if THUMBS in path.relative_to(root).parts:
        raise HTTPException(404, "Photo not found")
    return path


@router.get("/img/{key:path}")
def resized(key: str, w: int = Query(640)):
    src = _source(key)
    width = min(WIDTHS, key=lambda x: abs(x - w))  # only a few sizes, so the cache can't be flooded
    out = upload_root().resolve() / THUMBS / f"w{width}" / (key + ".webp")
    if not out.is_file() or out.stat().st_mtime < src.stat().st_mtime:
        out.parent.mkdir(parents=True, exist_ok=True)
        try:
            with Image.open(src) as im:
                im = ImageOps.exif_transpose(im)  # phone photos taken sideways stay upright
                im = im.convert("RGB")
                if im.width > width:
                    im = im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)
                tmp = out.with_name(f"{out.name}.{uuid.uuid4().hex}.tmp")  # two visitors at once never share a temp file
                im.save(tmp, "WEBP", quality=72, method=4)
                tmp.replace(out)
        except (OSError, ValueError, Image.DecompressionBombError):
            # Not a readable image: send the original rather than a broken picture.
            return FileResponse(src, headers=CACHE)
    return FileResponse(out, media_type="image/webp", headers=CACHE)
