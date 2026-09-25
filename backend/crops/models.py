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


class OrganicManureMethod(models.Model):
    name = models.CharField(max_length=150)
    materials = models.TextField()
    steps = models.TextField()
    crops = models.ManyToManyField(Crop, related_name="organic_methods", blank=True)

    def __str__(self):
        return self.name
