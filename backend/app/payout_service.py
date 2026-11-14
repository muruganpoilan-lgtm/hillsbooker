"""Paying hosts through RazorpayX, built so that no payment can be paid twice.

1. The host's ready payments are locked to a new payout row BEFORE any money request is sent.
2. The payout request carries the payout id as its idempotency key, so repeating it can never pay twice.
3. If Razorpay clearly refuses, the payments are released and become due again.
   If we cannot be sure what happened (a timeout), they stay locked as "processing" until Razorpay's webhook
   or the Check status button settles it, or the admin releases them after checking the Razorpay dashboard."""
import hashlib
import logging
import re
from decimal import Decimal

from . import razorpayx
from .db import get_conn
from .razorpay_client import RazorpayError

log = logging.getLogger("roomly")

UPI_LIMIT = Decimal("100000")    # most a single UPI payout may carry
IMPS_LIMIT = Decimal("500000")   # most a single IMPS payout may carry
_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")


def _money(x) -> str:
    return f"Rs {Decimal(x):,.2f}"


def _result(host_id: str, ok, message: str, **extra) -> dict:
    return {"host_id": host_id, "ok": ok, "message": message, **extra}


def _destination(host: dict, total: Decimal):
    """Returns (mode, cache signature, label), or a plain-words reason why this host cannot be paid automatically."""
    upi, acct = host.get("upi_id"), host.get("bank_account")
    if not upi and not acct:
        return "This host has not added a UPI ID or a bank account yet"
    if upi and total <= UPI_LIMIT:
        return ("UPI", f"upi:{upi}", f"UPI {upi}")
    if acct and total <= IMPS_LIMIT:
        sig = hashlib.sha256(f"{host['bank_ifsc']}|{acct}|{host['bank_holder']}".encode()).hexdigest()[:32]
        return ("IMPS", f"bank:{sig}", f"Bank {'X' * max(len(acct) - 4, 0)}{acct[-4:]}")
    return "The amount is above what one automatic transfer can carry (Rs 1,00,000 by UPI, Rs 5,00,000 by bank). Pay this one by hand"


def _fund_account(host_id: str, host: dict, mode: str, signature: str) -> str:
    """The RazorpayX fund account for this host's UPI ID or bank account, created once and remembered."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT fund_account_id FROM razorpayx_fund_accounts WHERE host_id = %s AND signature = %s", (host_id, signature))
        row = cur.fetchone()
        if row:
            return row["fund_account_id"]
        cur.execute("SELECT contact_id FROM razorpayx_contacts WHERE host_id = %s", (host_id,))
        c = cur.fetchone()
    contact_id = c["contact_id"] if c else None
    if not contact_id:
        phone = re.sub(r"\D", "", host.get("phone") or "") or None
        contact_id = razorpayx.create_contact(host["name"], host.get("email"), phone, host_id)
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO razorpayx_contacts (host_id, contact_id) VALUES (%s, %s) ON CONFLICT (host_id) DO NOTHING", (host_id, contact_id))
    if mode == "UPI":
        fund_id = razorpayx.create_vpa_account(contact_id, host["upi_id"])
    else:
        fund_id = razorpayx.create_bank_account(contact_id, host["bank_holder"], host["bank_ifsc"], host["bank_account"])
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO razorpayx_fund_accounts (host_id, signature, fund_account_id) VALUES (%s, %s, %s) ON CONFLICT (host_id, signature) DO NOTHING",
            (host_id, signature, fund_id),
        )
    return fund_id


def release(payout_id: str, reason: str) -> bool:
    """Marks a payout that is still processing as failed and makes its payments due again."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE payouts SET status = 'failed', failure_reason = %s WHERE id = %s AND status = 'processing' RETURNING id", (reason[:300], payout_id))
        if not cur.fetchone():
            return False
        cur.execute("UPDATE payments SET payout_id = NULL WHERE payout_id = %s", (payout_id,))
    return True


def _note(payout_id: str, text: str) -> None:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE payouts SET failure_reason = %s WHERE id = %s AND status = 'processing'", (text[:300], payout_id))


def apply_status(status: str, payout_id: str | None = None, provider_id: str | None = None, utr: str | None = None, reason: str | None = None) -> str | None:
    """Brings our record in line with what Razorpay says. Safe to call again and again.
    Returns 'paid', 'failed', 'processing', or None when the payout is not one of ours."""
    status = (status or "").lower()
    with get_conn() as conn, conn.cursor() as cur:
        if payout_id and _UUID.match(payout_id):
            cur.execute("SELECT id, status FROM payouts WHERE id = %s FOR UPDATE", (payout_id,))
        elif provider_id:
            cur.execute("SELECT id, status FROM payouts WHERE provider_payout_id = %s FOR UPDATE", (provider_id,))
        else:
            return None
        row = cur.fetchone()
        if not row:
            return None
        pid = str(row["id"])
        if provider_id:
            cur.execute("UPDATE payouts SET provider_payout_id = %s WHERE id = %s AND provider_payout_id IS NULL", (provider_id, pid))
        if status == "processed":
            if row["status"] == "processing":
                cur.execute(
                    "UPDATE payouts SET status = 'paid', reference = COALESCE(%s, %s, reference), paid_at = now(), failure_reason = NULL WHERE id = %s",
                    (utr, provider_id, pid),
                )
            return "paid"
        if status in ("reversed", "cancelled", "rejected", "failed"):
            if row["status"] in ("processing", "paid"):
                cur.execute("UPDATE payouts SET status = 'failed', failure_reason = %s WHERE id = %s", ((reason or f"Razorpay says: {status}")[:300], pid))
                cur.execute("UPDATE payments SET payout_id = NULL WHERE payout_id = %s", (pid,))
            return "failed"
        return "processing"


def sync(payout_id: str) -> str:
    """Asks Razorpay for the payout's current status and updates our record."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT provider_payout_id, status FROM payouts WHERE id = %s AND method = 'razorpayx'", (payout_id,))
        row = cur.fetchone()
    if not row:
        raise LookupError("Payout not found")
    if not row["provider_payout_id"]:
        return row["status"]
    p = razorpayx.get_payout(row["provider_payout_id"])
    reason = (p.get("status_details") or {}).get("description") or p.get("failure_reason")
    return apply_status(p.get("status"), payout_id=payout_id, provider_id=p["id"], utr=p.get("utr"), reason=reason) or row["status"]


def pay_host(host_id: str, expected: Decimal, admin_id: str) -> dict:
    """Pays one host everything that is ready for them. expected is the amount the screen showed.
    Properties whose real owner has their own payout details are left out: those are paid by hand to that owner."""
    from .routes.admin import _PAYOUT_READY  # imported here because routes.admin imports this module

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT name, email, phone, upi_id, bank_holder, bank_account, bank_ifsc FROM users WHERE id = %s", (host_id,))
        host = cur.fetchone()
        if not host:
            return _result(host_id, False, "Host not found")
        cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE r.host_id = %s AND NOT r.separate", (host_id,))
        ready = cur.fetchall()
        if ready:
            cur.execute("SELECT id FROM payments WHERE id = ANY(%s) FOR UPDATE", ([r["payment_id"] for r in ready],))
            cur.execute(f"SELECT payment_id, share FROM ({_PAYOUT_READY}) r WHERE r.host_id = %s AND NOT r.separate", (host_id,))
            ready = cur.fetchall()
        total = sum((Decimal(r["share"]) for r in ready), Decimal(0))
        if total <= 0:
            return _result(host_id, False, "Nothing is due to this host right now")
        if total != Decimal(expected):
            return _result(host_id, False, f"The amount due changed to {_money(total)}. Refresh and check before paying")
        dest = _destination(host, total)
        if isinstance(dest, str):
            return _result(host_id, False, dest)
        mode, signature, label = dest
        cur.execute(
            """INSERT INTO payouts (host_id, amount, upi_id, reference, created_by, method, status, destination)
               VALUES (%s, %s, %s, 'pending', %s, 'razorpayx', 'processing', %s) RETURNING id""",
            (host_id, total, host["upi_id"], admin_id, label),
        )
        payout_id = str(cur.fetchone()["id"])
        cur.execute("UPDATE payments SET payout_id = %s WHERE id = ANY(%s)", (payout_id, [r["payment_id"] for r in ready]))
    # The payments are now locked to this payout. Nothing below can make them payable a second time.

    try:
        fund_id = _fund_account(host_id, host, mode, signature)
    except RazorpayError as e:
        release(payout_id, f"Razorpay: {e}")  # no payout was requested yet, so nothing can have been sent
        return _result(host_id, False, f"Razorpay could not set up the transfer: {e}")

    try:
        res = razorpayx.create_payout(fund_id, int((total * 100).to_integral_value()), mode, payout_id)
    except RazorpayError as e:
        if e.definite:
            release(payout_id, f"Razorpay: {e}")
            return _result(host_id, False, f"Razorpay refused the payout: {e}")
        _note(payout_id, "Razorpay did not answer clearly. Check the RazorpayX dashboard before doing anything else.")
        log.exception("RazorpayX payout %s: no clear answer", payout_id)
        return _result(host_id, None, "Razorpay did not answer clearly, so the money may or may not have been sent. Do NOT pay this host again. Check RazorpayX > Payouts, then use Check status")

    reason = (res.get("status_details") or {}).get("description")
    state = apply_status(res.get("status"), payout_id=payout_id, provider_id=res.get("id"), utr=res.get("utr"), reason=reason)
    if state == "failed":
        return _result(host_id, False, f"Razorpay did not send it: {reason or res.get('status')}")
    if state == "paid":
        return _result(host_id, True, f"{_money(total)} sent to {label}", status="paid")
    return _result(host_id, True, f"{_money(total)} is on its way to {label}", status="processing")
