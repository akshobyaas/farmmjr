from rest_framework import serializers
from .models import (
    Crop, CropStage, CropTask, Disease, Recommendation, Lifecycle, FertilizerSchedule,
    OrganicManureMethod, FarmerCropTracker,
)


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


class CropStageSerializer(serializers.ModelSerializer):
    """
    A farmer-trackable crop stage, nested on `CropDetailSerializer` as
    `trackable_stages` so the frontend can build the "Track this crop" form
    (a planting-date input for day-based crops, or a stage picker for
    month-based perennials) from data already fetched with the crop detail,
    without a separate request.
    """

    class Meta:
        model = CropStage
        fields = [
            "id", "name", "day_range_start", "day_range_end",
            "typical_month_start", "typical_month_end", "order",
        ]
        read_only_fields = fields


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
    trackable_stages = CropStageSerializer(many=True, read_only=True)

    class Meta:
        model = Crop
        fields = [
            "id", "name", "soil_type", "climate", "planting_method",
            "name_kn", "name_hi", "soil_type_kn", "soil_type_hi",
            "climate_kn", "climate_hi", "planting_method_kn", "planting_method_hi",
            "lifecycle_stages", "fertilizer_schedules", "organic_methods",
            "intercropped_with", "trackable_stages",
        ]
        read_only_fields = fields


class CurrentStageField(serializers.PrimaryKeyRelatedField):
    """
    Writable as a bare CropStage pk (for the rare explicit override --
    e.g. a farmer manually correcting the derived stage), but read back
    nested as {"id", "name"} rather than a bare id, since the frontend
    needs the stage's name to display it. The usual case is the farmer
    never sending this at all: the view derives and sets it for them via
    `derive_stage_for_tracker`.
    """

    def use_pk_only_optimization(self):
        # We need the real CropStage instance (for .name) in
        # to_representation below, not DRF's PKOnlyObject shortcut.
        return False

    def to_representation(self, value):
        return {"id": value.id, "name": value.name}


class FarmerCropTrackerSerializer(serializers.ModelSerializer):
    """
    One farmer's tracked crop instance. `farmer` is deliberately absent
    from `fields` -- same mass-assignment protection pattern as
    `AdvisoryQueryCreateSerializer`: it is set server-side from
    `request.user` in the view's `perform_create`, never trusted from the
    client body, and is never writable here even if someone adds it to
    the POST body (DRF simply has no field to assign it to).

    The `unique_together` ("farmer", "crop") constraint is validated
    explicitly here, rather than left to the DB, so a duplicate tracker
    comes back as a clean 400 with a readable message instead of an
    unhandled IntegrityError surfacing as a 500.
    """

    current_stage = CurrentStageField(queryset=CropStage.objects.all(), required=False, allow_null=True)

    class Meta:
        model = FarmerCropTracker
        fields = ["id", "crop", "planting_date", "current_stage", "stage_confirmed_at", "is_active"]
        read_only_fields = ["id", "stage_confirmed_at"]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        crop = attrs.get("crop", getattr(self.instance, "crop", None))
        if user is not None and crop is not None:
            conflict = FarmerCropTracker.objects.filter(farmer=user, crop=crop)
            if self.instance is not None:
                conflict = conflict.exclude(pk=self.instance.pk)
            if conflict.exists():
                raise serializers.ValidationError(
                    {"crop": "You already have a tracker for this crop."}
                )

        # An explicit current_stage override must belong to this
        # tracker's own crop -- otherwise a farmer tracking Rice could set
        # current_stage to e.g. an Arecanut stage's id. The normal case
        # (the view deriving and setting current_stage itself) never goes
        # through this path, since it bypasses the serializer entirely.
        current_stage = attrs.get("current_stage")
        if current_stage is not None and crop is not None:
            if not crop.trackable_stages.filter(pk=current_stage.pk).exists():
                raise serializers.ValidationError(
                    {"current_stage": "This stage does not belong to this tracker's crop."}
                )
        return attrs


class CropTaskSerializer(serializers.ModelSerializer):
    """
    Task 17 -- farmer-facing "Today's Tasks" serializer. source_citation
    is deliberately excluded: it's internal/admin-only research backing,
    not something to surface in the UI.
    """

    class Meta:
        model = CropTask
        fields = ["id", "category", "instruction"]
