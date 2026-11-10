from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model — set up in Phase 2, before any real migrations exist.
    Swapping Django's default User model later is painful, so we do it now
    even though we only need a couple of extra fields today.
    """

    class Role(models.TextChoices):
        FARMER = "farmer", "Farmer"
        ADMIN = "admin", "Admin / Expert"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.FARMER,
    )
    preferred_language = models.CharField(
        max_length=10,
        choices=[("en", "English"), ("kn", "Kannada"), ("hi", "Hindi")],
        default="en",
    )
    phone_number = models.CharField(max_length=15, blank=True)
    home_location = models.CharField(max_length=200, blank=True)
    is_verified = models.BooleanField(
        default=False,
        help_text="Set to True once the user confirms their email address."
    )

    class UnitsArea(models.TextChoices):
        ACRE = "acre", "Acre"
        HECTARE = "hectare", "Hectare"

    class UnitsWeight(models.TextChoices):
        KG = "kg", "Kilogram"
        TONNE = "tonne", "Tonne"

    class OnboardingStatus(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"

    units_area = models.CharField(
        max_length=10,
        choices=UnitsArea.choices,
        default=UnitsArea.ACRE,
    )
    units_weight = models.CharField(
        max_length=10,
        choices=UnitsWeight.choices,
        default=UnitsWeight.KG,
    )
    onboarding_status = models.CharField(
        max_length=15,
        choices=OnboardingStatus.choices,
        default=OnboardingStatus.NOT_STARTED,
        help_text=(
            "Tracks the /welcome guided onboarding flow per-account (not "
            "localStorage) so it is completed only once, including across "
            "devices. A farmer who already had an active crop tracker at "
            "migration time is backfilled to 'completed' instead of "
            "'not_started'."
        ),
    )

    def __str__(self):
        return f"{self.username} ({self.role})"
