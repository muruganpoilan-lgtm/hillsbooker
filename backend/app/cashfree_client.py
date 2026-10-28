"""Small Cashfree Payments client using only the standard library: create an order, read an order and its
payments back, refund a payment, and check webhook signatures. Docs: https://www.cashfree.com/docs/"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request
from decimal import Decimal

from .config import settings

API_VERSION = "2023-08-01"


class CashfreeError(Exception):
    pass


def _base() -> str:
    return "https://api.cashfree.com/pg" if settings.cashfree_env.strip().lower() == "production" else "https://sandbox.cashfree.com/pg"


def _call(method: str, path: str, payload: dict | None = None):
    req = urllib.request.Request(
        f"{_base()}{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "x-client-id": settings.cashfree_app_id,
            "x-client-secret": settings.cashfree_secret_key,
            "x-api-version": API_VERSION,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = str(json.loads(e.read()).get("message", ""))
        except Exception:
            pass
        raise CashfreeError(detail or f"Cashfree answered with HTTP {e.code}") from e
    except Exception as e:
        raise CashfreeError("Could not reach Cashfree") from e


def _phone(raw: str | None) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    return digits[-10:] if len(digits) >= 10 else "9999999999"  # Cashfree insists on a 10 digit number


def create_order(order_id: str, amount: Decimal, customer_id: str, name: str | None, email: str | None, phone: str | None, return_url: str, note: str) -> dict:
    customer = {"customer_id": customer_id.replace("-", "")[:50], "customer_phone": _phone(phone)}
    if email:
        customer["customer_email"] = email
    if name and len(name.strip()) >= 3:
        customer["customer_name"] = name.strip()[:100]
    meta = {"return_url": return_url}
    notify = f"{settings.api_public_url.rstrip('/')}/payments/cashfree/webhook"
    if notify.startswith("https://"):
        meta["notify_url"] = notify
    return _call(
        "POST",
        "/orders",
        {
            "order_id": order_id,
            "order_amount": float(Decimal(amount).quantize(Decimal("0.01"))),
            "order_currency": "INR",
            "customer_details": customer,
            "order_meta": meta,
            "order_note": note[:200] if len(note) >= 3 else "Hill Booker booking",
        },
    )


def get_order(order_id: str) -> dict:
    return _call("GET", f"/orders/{order_id}")


def successful_payment_id(order_id: str) -> str | None:
    """The Cashfree payment id of this order's successful payment, or None if nothing has succeeded."""
    payments = _call("GET", f"/orders/{order_id}/payments")
    for p in payments if isinstance(payments, list) else []:
        if p.get("payment_status") == "SUCCESS":
            return str(p.get("cf_payment_id"))
    return None


def refund(order_id: str, refund_id: str, amount: Decimal, note: str) -> dict:
    return _call(
        "POST",
        f"/orders/{order_id}/refunds",
        {"refund_id": refund_id, "refund_amount": float(Decimal(amount).quantize(Decimal("0.01"))), "refund_note": note[:100] if len(note) >= 3 else "Refund"},
    )


def valid_webhook_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    """Cashfree signs timestamp + raw body with HMAC-SHA256 using your secret key, then base64-encodes it."""
    if not (timestamp and signature and settings.cashfree_secret_key):
        return False
    digest = hmac.new(settings.cashfree_secret_key.encode(), timestamp.encode() + raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)
