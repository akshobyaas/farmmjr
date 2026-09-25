from django.conf import settings
from django.db import models
from crops.models import Disease


class ScanHistory(models.Model):
    """
    One record per disease-detection scan a farmer performs.
    Phase 10 will populate `predicted_disease` and `confidence` for real;
    Phase 8 just defines the shape and handles secure upload.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,  # deleting a user deletes their scan history too (right to erasure)
        related_name="scan_history",
    )
    image = models.ImageField(upload_to="scans/%Y/%m/", blank=True, null=True)
    predicted_disease = models.ForeignKey(
        Disease,
        on_delete=models.SET_NULL,  # never delete a scan just because disease data changed later
        null=True,
        blank=True,
        related_name="scans",
    )
    confidence = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Scan history"

    def __str__(self):
        disease = self.predicted_disease.name if self.predicted_disease else "Unprocessed"
        return f"Scan by {self.user.username} — {disease}"
