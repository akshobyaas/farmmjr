"""
The Crop Lifecycle Tracker's own serializer (Phase A / Task 6-8): one
farmer's tracked crop instance.

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/serializers.py into focused per-feature modules. No
behavior changed -- same classes, same fields, just regrouped.
"""
from rest_framework import serializers
from .models import CropStage, FarmerCropTracker


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
