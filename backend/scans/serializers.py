import uuid
from PIL import Image
from rest_framework import serializers
from crops.models import Disease
from .models import ScanHistory

MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
ALLOWED_PIL_FORMATS = {"JPEG", "PNG"}


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
        # --- Size check ---
        if value.size > MAX_UPLOAD_SIZE_BYTES:
            raise serializers.ValidationError(
                f"Image too large. Maximum size is {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."
            )

        # --- Content-type check (first line of defense only) ---
        content_type = getattr(value, "content_type", None)
        if content_type and content_type not in ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError("Only JPEG and PNG images are allowed.")

        # --- Real validation: actually parse the file as an image ---
        # This is what catches a malicious file renamed to end in .jpg —
        # Pillow will fail to parse it regardless of filename/claimed type.
        try:
            value.seek(0)
            img = Image.open(value)
            img.verify()
            detected_format = img.format
        except Exception:
            raise serializers.ValidationError("This file is not a valid image.")
        finally:
            value.seek(0)  # reset pointer so Django can still read+save the raw bytes after this

        if detected_format not in ALLOWED_PIL_FORMATS:
            raise serializers.ValidationError("Only JPEG and PNG images are allowed.")

        # --- Filename sanitization ---
        # Never trust or reuse the client-supplied filename. Replace it
        # entirely with a random UUID plus the VERIFIED extension.
        ext = ".jpg" if detected_format == "JPEG" else ".png"
        value.name = f"{uuid.uuid4().hex}{ext}"

        return value

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
