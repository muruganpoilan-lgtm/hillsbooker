from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str = "postgresql://roomly:roomly@localhost:5432/roomly"
    jwt_secret: str = "dev-secret-change-me"
    jwt_hours: int = 24 * 7
    hold_minutes: int = 10
    # Dev only: lets a guest confirm a held booking without paying. Keep False in production.
    allow_fake_confirm: bool = False

    # Razorpay (https://dashboard.razorpay.com/app/keys). Leave empty to keep payments off.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_api_base: str = "https://api.razorpay.com/v1"
    # Cancelling at least this many hours before check-in refunds everything; later cancellations get no refund.
    refund_full_hours: int = 48

    # Invoices. The business details print at the top of every invoice.
    business_name: str = "Hill Booker"
    business_address: str = ""
    business_email: str = ""
    business_phone: str = ""
    # Email sending (any SMTP account: your hosting email, Brevo, Gmail app password, ...). Leave smtp_host empty to keep email off.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""        # e.g. "Hill Booker <bookings@hillbooker.com>"
    smtp_security: str = "starttls"  # starttls, ssl or none

    # Sign in with Google (Google Cloud Console > APIs & Services > Credentials > OAuth client ID, type "Web application").
    # Leave the id empty to hide the Google button.
    google_client_id: str = ""
    google_client_secret: str = ""
    site_url: str = "https://hillbooker.com"  # where web sign-ins are sent back to

    # Hill Booker's commission, as a percent of each advance payment. Taken from the host's share; the guest pays no extra.
    commission_percent: float = 2.0

    # Direct UPI: how long a booking stays held while the host checks that the money arrived.
    upi_hold_hours: int = 12

    # WhatsApp alerts to hosts (Meta WhatsApp Business Cloud API). Leave the token empty to keep alerts off.
    whatsapp_token: str = ""       # permanent access token
    whatsapp_phone_id: str = ""    # the sender number's Phone Number ID
    whatsapp_template: str = "new_booking"
    whatsapp_lang: str = "en"
    whatsapp_host_copy_template: str = ""  # approved template with a PDF header that sends the owner a copy; empty = off
    whatsapp_invoice_template: str = ""  # approved template that sends the guest their invoice link; empty = off

    # Photo uploads. Local disk for development; swap storage.py for S3 or Cloudinary in production.
    upload_dir: str = "uploads"
    public_base_url: str = "http://localhost:8000"
    max_upload_mb: int = 5
    max_photos_per_item: int = 20


settings = Settings()


def payments_enabled() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def google_enabled() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)
