from django.conf import settings
from django.db import models


class AdvisoryQuery(models.Model):
    """
    Farmer submits a question → admin/expert responds.
    Phase 17 builds the full UI for this; the schema is defined now.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ANSWERED = "answered", "Answered"

    farmer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="advisory_queries",
    )
    # Optional link back to the scan this question was asked about. Only
    # ever set when the farmer followed the "Ask an Expert" nudge shown on
    # a low-confidence scan result (frontend's LowConfidenceNudge) -- a
    # question typed in normally has no scan attached. SET_NULL (not
    # CASCADE): deleting a scan later shouldn't take a farmer's question
    # and an expert's answer down with it.
    scan = models.ForeignKey(
        "scans.ScanHistory",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advisory_queries",
    )
    question = models.TextField()
    response = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Advisory queries"

    def __str__(self):
        return f"Query from {self.farmer.username} — {self.status}"
