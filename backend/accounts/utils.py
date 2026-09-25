from django.conf import settings
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token, password_reset_token


def send_verification_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)
    link = f"{settings.FRONTEND_URL_FOR_LINKS}/verify-email/{uid}/{token}/"

    send_mail(
        subject="Verify your Smart Farming account",
        message=(
            f"Hi {user.username},\n\n"
            f"Please verify your email by clicking the link below. "
            f"This link expires in 30 minutes.\n\n{link}\n\n"
            f"If you didn't create this account, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_password_reset_email(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = password_reset_token.make_token(user)
    link = f"{settings.FRONTEND_URL_FOR_LINKS}/reset-password/{uid}/{token}/"

    send_mail(
        subject="Reset your Smart Farming password",
        message=(
            f"Hi {user.username},\n\n"
            f"We received a request to reset your password. This link expires "
            f"in 30 minutes and can only be used once:\n\n{link}\n\n"
            f"If you didn't request this, you can safely ignore this email — "
            f"your password will not be changed."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
