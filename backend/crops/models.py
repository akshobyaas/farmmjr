from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Crop(models.Model):
    name = models.CharField(max_length=100, unique=True)
    soil_type = models.CharField(max_length=200, blank=True)
    climate = models.CharField(max_length=200, blank=True)
    planting_method = models.TextField(blank=True)
    # Real-world companion/intercropping relationships (e.g. Black Pepper is
    # trellised up Arecanut palms, Cocoa grows in the shade beneath both).
    # Symmetrical by default: adding Pepper to Arecanut's list also adds
    # Arecanut to Pepper's list, matching how intercropping actually works.
    intercropped_with = models.ManyToManyField("self", blank=True)

    # Phase 18 -- Kannada/Hindi translations of the core crop-guidance
    # fields. Deliberately plain parallel fields rather than a separate
    # translation table: with a fixed, small set of 3 supported languages
    # (not an open-ended locale list), a normalized per-language table adds
    # more moving parts than it saves here. Left blank when untranslated --
    # the frontend falls back to the English field rather than showing a
    # blank/broken label (per the Phase 18 plan's testing requirement).
    # Disease/recommendation/lifecycle/fertilizer detail content is
    # deliberately NOT translated in this phase (English only) -- scoped
    # down to keep translation quality reviewable; see PROJECT_STATUS.md.
    name_kn = models.CharField(max_length=100, blank=True, verbose_name="Name (Kannada)")
    name_hi = models.CharField(max_length=100, blank=True, verbose_name="Name (Hindi)")
    soil_type_kn = models.CharField(max_length=200, blank=True, verbose_name="Soil type (Kannada)")
    soil_type_hi = models.CharField(max_length=200, blank=True, verbose_name="Soil type (Hindi)")
    climate_kn = models.CharField(max_length=200, blank=True, verbose_name="Climate (Kannada)")
    climate_hi = models.CharField(max_length=200, blank=True, verbose_name="Climate (Hindi)")
    planting_method_kn = models.TextField(blank=True, verbose_name="Planting method (Kannada)")
    planting_method_hi = models.TextField(blank=True, verbose_name="Planting method (Hindi)")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Disease(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="diseases")
    name = models.CharField(max_length=150)
    symptoms = models.TextField(blank=True)
    description = models.TextField(blank=True)
    prevention = models.TextField(blank=True)

    class Meta:
        unique_together = ("crop", "name")
        ordering = ["crop__name", "name"]

    def __str__(self):
        return f"{self.crop.name} — {self.name}"


class Recommendation(models.Model):
    disease = models.OneToOneField(Disease, on_delete=models.CASCADE, related_name="recommendation")
    treatment_info = models.TextField()
    preventive_measures = models.TextField(blank=True)

    def __str__(self):
        return f"Recommendation for {self.disease}"


class FertilizerSchedule(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="fertilizer_schedules")
    growth_stage = models.CharField(max_length=100)
    fertilizer_guidance = models.TextField()
    irrigation_guidance = models.TextField()
    order = models.PositiveIntegerField(default=0, help_text="Stage order within the crop's timeline")

    class Meta:
        ordering = ["crop__name", "order"]

    def __str__(self):
        return f"{self.crop.name} — {self.growth_stage}"


class Lifecycle(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="lifecycle_stages")
    stage = models.CharField(max_length=100)
    duration_description = models.CharField(max_length=200, blank=True)
    details = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["crop__name", "order"]

    def __str__(self):
        return f"{self.crop.name} — {self.stage}"


# Farmer-trackable crop stages for the USP crop tracker. Kept separate from
# Lifecycle on purpose: Lifecycle still backs the Crop Detail "life story"
# content, while CropStage carries the day/month windows a farmer's planting
# date is matched against to show where their crop currently is.
class CropStage(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="trackable_stages")
    name = models.CharField(max_length=100)
    day_range_start = models.PositiveIntegerField(
        null=True, blank=True, help_text="Days after planting when this stage begins"
    )
    day_range_end = models.PositiveIntegerField(
        null=True, blank=True, help_text="Days after planting when this stage ends"
    )
    typical_month_start = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text="Calendar month (1-12) this stage typically begins",
    )
    typical_month_end = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text="Calendar month (1-12) this stage typically ends",
    )
    order = models.PositiveIntegerField(default=0, help_text="Stage order within the crop's timeline")

    class Meta:
        ordering = ["crop__name", "order"]

    def __str__(self):
        return f"{self.crop.name} — {self.name}"


# A farmer's tracked crop instance: one row per (farmer, crop) they're
# currently growing. `current_stage` is a cache of the last-derived
# CropStage, kept nullable/SET_NULL so deleting a stage never deletes the
# tracker -- the next derivation just recomputes it. `derive_stage_for_tracker`
# (stage_derivation.py) is what actually computes the stage; this model only
# holds the farmer-facing state.
class FarmerCropTracker(models.Model):
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="crop_trackers")
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="trackers")
    planting_date = models.DateField(null=True, blank=True)
    current_stage = models.ForeignKey(CropStage, on_delete=models.SET_NULL, null=True, blank=True)
    stage_confirmed_at = models.DateField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("farmer", "crop")

    def __str__(self):
        return f"{self.farmer} — {self.crop.name}"


# Weather conditions under which a disease is considered at risk, used by the
# weather-based disease-risk alerts. Every condition is optional: a rule only
# checks the thresholds it sets. An empty applicable_stages means the rule
# applies at any stage of the crop.
class DiseaseRiskRule(models.Model):
    class RiskLevel(models.TextChoices):
        LOW = "low", "Low"
        MODERATE = "moderate", "Moderate"
        HIGH = "high", "High"

    disease = models.ForeignKey(Disease, on_delete=models.CASCADE, related_name="risk_rules")
    applicable_stages = models.ManyToManyField(CropStage, blank=True)
    humidity_min_percent = models.PositiveSmallIntegerField(null=True, blank=True)
    temp_min_celsius = models.FloatField(null=True, blank=True)
    temp_max_celsius = models.FloatField(null=True, blank=True)
    rainfall_min_mm = models.FloatField(null=True, blank=True)
    consecutive_days_required = models.PositiveSmallIntegerField(default=1)
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)
    advisory_text = models.TextField()
    source_citation = models.TextField()

    def __str__(self):
        return f"{self.disease} — {self.get_risk_level_display()} risk"


# A stage-specific farm task (irrigation, fertilizer, spraying, etc.) a farmer
# is reminded of while their crop is in the linked CropStage. Each task cites
# its source so the advice can be traced back to an agronomy reference.
class CropTask(models.Model):
    class Category(models.TextChoices):
        IRRIGATION = "irrigation", "Irrigation"
        FERTILIZER = "fertilizer", "Fertilizer"
        SPRAYING = "spraying", "Spraying"
        PRUNING = "pruning", "Pruning"
        OTHER = "other", "Other"

    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="tasks")
    stage = models.ForeignKey(CropStage, on_delete=models.CASCADE, related_name="tasks")
    category = models.CharField(max_length=20, choices=Category.choices)
    instruction = models.TextField()
    source_citation = models.TextField()

    def __str__(self):
        return f"{self.crop.name} — {self.stage.name}: {self.get_category_display()}"


class OrganicManureMethod(models.Model):
    name = models.CharField(max_length=150)
    materials = models.TextField()
    steps = models.TextField()
    crops = models.ManyToManyField(Crop, related_name="organic_methods", blank=True)

    def __str__(self):
        return self.name
