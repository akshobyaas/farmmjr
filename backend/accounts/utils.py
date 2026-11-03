import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token, password_reset_token

logger = logging.getLogger(__name__)


def _send_mail_fail_soft(*, subject, message, recipient_list):
    """
    Wraps send_mail so a broken mail server (timeout, auth failure, DNS
    blip -- anything it can raise) is logged and swallowed rather than
    propagated. Mirrors advisory/utils.py's notify_admins_of_pending_query,
    which already uses fail_silently=True for the same reason: "a broken
    mail server should never block" the thing the user actually asked for.

    Every caller here runs AFTER an account mutation (user created, email
    changed, ...) that has already been saved to the database -- letting a
    mail error raise past that point would 500 a request whose real work
    already succeeded, leaving the account in a state the user can't see
    and can't retry into (e.g. "username already exists" on a retry after
    a registration that actually went through).
    """
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            fail_silently=False,
        )
    except Exception:
        logger.exception("Failed to send email (subject=%r, to=%r)", subject, recipient_list)


def send_verification_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)
    link = f"{settings.FRONTEND_URL_FOR_LINKS}/verify-email/{uid}/{token}/"

    _send_mail_fail_soft(
        subject="Verify your Smart Farming account",
        message=(
            f"Hi {user.username},\n\n"
            f"Please verify your email by clicking the link below. "
            f"This link expires in 30 minutes.\n\n{link}\n\n"
            f"If you didn't create this account, you can ignore this email."
        ),
        recipient_list=[user.email],
    )


def send_account_found_email(user):
    _send_mail_fail_soft(
        subject="Your Smart Farming username",
        message=(
            f"Hi,\n\n"
            f"You (or someone using this email address) asked to recover the "
            f"username for this Smart Farming account. It is:\n\n{user.username}\n\n"
            f"If you didn't request this, you can safely ignore this email."
        ),
        recipient_list=[user.email],
    )


def send_password_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = password_reset_token.make_token(user)
    link = f"{settings.FRONTEND_URL_FOR_LINKS}/reset-password/{uid}/{token}/"

    _send_mail_fail_soft(
        subject="Reset your Smart Farming password",
        message=(
            f"Hi {user.username},\n\n"
            f"We received a request to reset your password. This link expires "
            f"in 30 minutes and can only be used once:\n\n{link}\n\n"
            f"If you didn't request this, you can safely ignore this email — "
            f"your password will not be changed."
        ),
        recipient_list=[user.email],
    )
