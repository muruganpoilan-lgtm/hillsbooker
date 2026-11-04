"""RazorpayX payouts: send a host's share straight to their UPI ID or bank account from your RazorpayX balance.
Docs: https://razorpay.com/docs/x/apis/ . The same API key and secret as normal Razorpay are used."""
import hashlib
import hmac

from .config import settings
from .razorpay_client import RazorpayError, _call, _same  # noqa: F401  (RazorpayError is re-exported)


def enabled() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret and settings.razorpayx_account_number)


def create_contact(name: str, email: str | None, phone: str | None, host_id: str) -> str:
    body = {"name": name[:50], "type": "vendor", "reference_id": host_id}
    if email:
        body["email"] = email
    if phone:
        body["contact"] = phone
    return _call("POST", "/contacts", body)["id"]


def create_vpa_account(contact_id: str, upi_id: str) -> str:
    return _call("POST", "/fund_accounts", {"contact_id": contact_id, "account_type": "vpa", "vpa": {"address": upi_id}})["id"]


def create_bank_account(contact_id: str, holder: str, ifsc: str, account: str) -> str:
    body = {"contact_id": contact_id, "account_type": "bank_account", "bank_account": {"name": holder, "ifsc": ifsc, "account_number": account}}
    return _call("POST", "/fund_accounts", body)["id"]


def create_payout(fund_account_id: str, amount_paise: int, mode: str, reference_id: str) -> dict:
    """reference_id is our payout id. It is also the idempotency key, so asking twice can never pay twice."""
    return _call(
        "POST", "/payouts",
        {
            "account_number": settings.razorpayx_account_number,
            "fund_account_id": fund_account_id,
            "amount": amount_paise,
            "currency": "INR",
            "mode": mode,
            "purpose": "payout",
            "queue_if_low_balance": False,
            "reference_id": reference_id,
            "narration": "Hill Booker payout",
        },
        headers={"X-Payout-Idempotency": reference_id},
    )


def get_payout(payout_id: str) -> dict:
    return _call("GET", f"/payouts/{payout_id}")


def valid_webhook_signature(raw_body: bytes, signature: str) -> bool:
    if not settings.razorpayx_webhook_secret:
        return False
    expected = hmac.new(settings.razorpayx_webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return _same(expected, signature)
