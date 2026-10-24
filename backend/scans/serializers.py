from rest_framework import serializers
from crops.models import Disease
from .models import ScanHistory
from .validators import validate_and_sanitize_image


class ScanUploadSerializer(serializers.ModelSerializer):
    """
    Handles a farmer's crop image upload.

    predicted_disease and confidence stay read-only here (and empty) —
    actually running the AI model against the image is Phase 10's job.
    This phase is purely about getting a validated, safely-stored image
    into the database, with a real ScanHistory record to show for it.
    """

    class Meta:
        model = ScanHistory
        fields = ["id", "image", "predicted_disease", "confidence", "created_at"]
        read_only_fields = ["id", "predicted_disease", "confidence", "created_at"]

    def validate_image(self, value):
        return validate_and_sanitize_image(value)

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class PredictedDiseaseSerializer(serializers.ModelSerializer):
    """
    Lightweight, read-only view of a predicted Disease -- just enough for
    the scan result screen to show what was found and what to do about it,
    without a second API call.
    """
    crop_name = serializers.CharField(source="crop.name", read_only=True)
    treatment_info = serializers.SerializerMethodField()

    class Meta:
        model = Disease
        fields = ["id", "name", "crop_name", "symptoms", "prevention", "treatment_info"]
        read_only_fields = fields

    def get_treatment_info(self, obj):
        recommendation = getattr(obj, "recommendation", None)
        return recommendation.treatment_info if recommendation else ""


class ScanResultSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a ScanHistory record used for the upload
    response (Phase 10), and re-used as-is for the history detail view
    (Phase 12) -- "tap a history item to see full result again" is exactly
    this same shape.
    """
    predicted_disease = PredictedDiseaseSerializer(read_only=True)

    class Meta:
        model = ScanHistory
        fields = ["id", "image", "predicted_disease", "confidence", "created_at"]
        read_only_fields = fields


class ScanHistoryListSerializer(serializers.ModelSerializer):
    """
    Lightweight -- Phase 12's history list only needs a thumbnail, disease
    name, crop name, confidence, and date, not the full symptoms/prevention/
    treatment text (that's what the detail view is for).
    """
    disease_name = serializers.SerializerMethodField()
    crop_name = serializers.SerializerMethodField()

    class Meta:
        model = ScanHistory
        fields = ["id", "image", "disease_name", "crop_name", "confidence", "created_at"]
        read_only_fields = fields

    def get_disease_name(self, obj):
        return obj.predicted_disease.name if obj.predicted_disease else None

    def get_crop_name(self, obj):
        return obj.predicted_disease.crop.name if obj.predicted_disease else None
