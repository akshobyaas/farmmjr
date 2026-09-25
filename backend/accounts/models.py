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
    is_verified = models.BooleanField(
        default=False,
        help_text="Set to True once the user confirms their email address."
    )

    def __str__(self):
        return f"{self.username} ({self.role})"
