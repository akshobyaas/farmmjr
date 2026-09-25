from rest_framework import serializers
from .models import Crop, Disease, Recommendation, Lifecycle, FertilizerSchedule, OrganicManureMethod


class CropListSerializer(serializers.ModelSerializer):
    """
    Lightweight — used for the crop browsing list. Deliberately excludes
    lifecycle/fertilizer/organic-manure data, not needed until the farmer
    taps into a specific crop's detail page.
    """

    class Meta:
        model = Crop
        fields = [
            "id", "name", "soil_type", "climate",
            "name_kn", "name_hi", "soil_type_kn", "soil_type_hi",
            "climate_kn", "climate_hi",
        ]
        read_only_fields = fields


class LifecycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lifecycle
        fields = ["stage", "duration_description", "details", "order"]
        read_only_fields = fields


class FertilizerScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FertilizerSchedule
        fields = ["growth_stage", "fertilizer_guidance", "irrigation_guidance", "order"]
        read_only_fields = fields


class OrganicManureMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganicManureMethod
        fields = ["id", "name", "materials", "steps"]
        read_only_fields = fields


class IntercroppedCropSerializer(serializers.ModelSerializer):
    """Lightweight — just enough to link to the companion crop's own detail page."""

    class Meta:
        model = Crop
        fields = ["id", "name", "name_kn", "name_hi"]
        read_only_fields = fields


class RecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recommendation
        fields = ["treatment_info", "preventive_measures"]
        read_only_fields = fields


class DiseaseDetailSerializer(serializers.ModelSerializer):
    """
    Phase 11 -- given a disease ID, return its full recommendation.
    Public and read-only: content itself is admin-managed only (edited via
    Django admin, which requires staff login -- there is no API write path
    for Disease or Recommendation at all).
    """
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    recommendation = serializers.SerializerMethodField()

    class Meta:
        model = Disease
        fields = ["id", "name", "crop_name", "symptoms", "description", "prevention", "recommendation"]
        read_only_fields = fields

    def get_recommendation(self, obj):
        # A Disease without a Recommendation shouldn't ever happen given how
        # seed_demo_data creates them together, but this is a real OneToOne
        # so it's not guaranteed by the schema -- fail soft with null rather
        # than a 500 if content is ever added without one.
        rec = getattr(obj, "recommendation", None)
        return RecommendationSerializer(rec).data if rec else None


class CropDetailSerializer(serializers.ModelSerializer):
    """
    Full crop detail — soil/climate/planting info, lifecycle timeline,
    fertilizer/irrigation schedule, organic manure methods, and real
    companion-crop relationships (e.g. Arecanut's page lists Black Pepper
    and Cocoa as crops it's commonly intercropped with in this region).
    Disease/recommendation data is deliberately NOT included here — that
    belongs to the AI disease-detection flow (Phases 9-11).
    """
    lifecycle_stages = LifecycleSerializer(many=True, read_only=True)
    fertilizer_schedules = FertilizerScheduleSerializer(many=True, read_only=True)
    organic_methods = OrganicManureMethodSerializer(many=True, read_only=True)
    intercropped_with = IntercroppedCropSerializer(many=True, read_only=True)

    class Meta:
        model = Crop
        fields = [
            "id", "name", "soil_type", "climate", "planting_method",
            "name_kn", "name_hi", "soil_type_kn", "soil_type_hi",
            "climate_kn", "climate_hi", "planting_method_kn", "planting_method_hi",
            "lifecycle_stages", "fertilizer_schedules", "organic_methods",
            "intercropped_with",
        ]
        read_only_fields = fields
