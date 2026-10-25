from fastapi import APIRouter, HTTPException, Response

from .. import invoice
from ..db import get_conn

router = APIRouter(tags=["invoices"])


@router.get("/invoices/{token}.pdf")
def download_invoice(token: str):
    """Opened from the link in the app, the website or the email. The signed token is the key; it expires after 60 days."""
    booking_id = invoice.booking_id_from_token(token)
    if not booking_id:
        raise HTTPException(404, "This invoice link has expired. Open your bookings and ask for a new one")
    with get_conn() as conn, conn.cursor() as cur:
        d = invoice.load(cur, booking_id)
    if not d:
        raise HTTPException(404, "There is no invoice for this booking")
    return Response(
        invoice.build_pdf(d),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{d["invoice_no"]}.pdf"'},
    )
