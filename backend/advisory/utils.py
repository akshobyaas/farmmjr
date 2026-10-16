import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

User = get_user_model()

# Mirrors frontend/src/components/LowConfidenceNudge.jsx's
# LOW_CONFIDENCE_THRESHOLD. Kept as a separate backend constant rather than
# importing across apps: this is the trust boundary -- a request is only
# ever treated as "came from a low-confidence scan" because the server
# re-checked the scan's own confidence, not because the client said so.
LOW_CONFIDENCE_THRESHOLD = 0.6


def should_notify_admins(query):
    """
    True only when `query` is linked to a scan (i.e. it came through the
    "Ask an Expert" nudge, not a normally typed-in question) and that
    scan's own stored confidence is below the threshold.
    """
    scan = query.scan
    if scan is None or scan.confidence is None:
        return False
    return scan.confidence < LOW_CONFIDENCE_THRESHOLD


def notify_admins_of_pending_query(query):
    """
    Emails every admin/expert account that a low-confidence scan produced
    a new question needing review. Mirrors the send_mail usage in
    accounts/utils.py (send_verification_email, send_password_reset_email),
    but fail_silently=True here on purpose: a broken mail server should
    never block a farmer's question from being saved -- this notification
    is a convenience on top of the admin's own /advisory queue, not a
    required step in the flow.
    """
    recipients = list(
        User.objects.filter(role=User.Role.ADMIN).exclude(email="").values_list("email", flat=True)
    )
    if not recipients:
        logger.warning("Low-confidence advisory query #%s has no admin recipients to notify.", query.id)
        return

    scan = query.scan
    disease_name = scan.predicted_disease.name if scan and scan.predicted_disease else "an unidentified disease"
    confidence_pct = f"{scan.confidence * 100:.1f}%" if scan and scan.confidence is not None else "unknown"
    link = f"{settings.FRONTEND_URL_FOR_LINKS}/advisory"

    send_mail(
        subject="New low-confidence scan needs your review",
        message=(
            f"{query.farmer.username} asked a question after a low-confidence scan result.\n\n"
            f"Predicted: {disease_name} ({confidence_pct} confidence)\n\n"
            f"Question:\n{query.question}\n\n"
            f"Review and answer it here: {link}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipients,
        fail_silently=True,
    )
