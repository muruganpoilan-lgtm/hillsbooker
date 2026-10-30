"""Plain-text email through the same SMTP settings the invoices use. Returns False (and logs) instead of raising."""
import logging
import smtplib
import threading
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("hillbooker.mailer")


def enabled() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send(to: str, subject: str, body: str) -> bool:
    if not enabled():
        log.warning("Email is not set up (SMTP_HOST / SMTP_FROM empty); did not send '%s'", subject)
        return False
    msg = EmailMessage()
    msg["Subject"], msg["To"], msg["From"] = subject, to, settings.smtp_from
    msg.set_content(body)
    try:
        if settings.smtp_security == "ssl":
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
            if settings.smtp_security == "starttls":
                server.starttls()
        with server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        log.exception("Could not send email '%s'", subject)
        return False


def send_in_background(to: str, subject: str, body: str) -> None:
    threading.Thread(target=send, args=(to, subject, body), daemon=True).start()
