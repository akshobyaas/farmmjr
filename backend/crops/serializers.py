from zoneinfo import ZoneInfo

from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from scans import ml_model
from scans.validators import validate_and_sanitize_image
from .models import (
    Crop, CropStage, CropTask, Disease, Recommendation, Lifecycle, FertilizerSchedule,
    OrganicManureMethod, FarmerCropTracker, FarmingDiaryEntry,
)

NOTE_MAX_LENGTH = 2000

# The diary's "today" is the farmer's calendar day in India, not the
# project-wide TIME_ZONE ('UTC'). With UTC, an entry logged between 00:00
# and 05:30 IST would be filed under -- and overwrite -- yesterday's entry.
# Scoped to the diary on purpose: changing TIME_ZONE globally would affect
# every other date/time in the project.
DIARY_TIMEZONE = ZoneInfo("Asia/Kolkata")


def diary_today(now=None):
    """The current calendar date in IST (`now` defaults to timezone.now())."""
    return timezone.localdate(now, timezone=DIARY_TIMEZONE)

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


class FarmingDiaryEntrySerializer(serializers.ModelSerializer):
    """
    Farming Diary Task 2 -- text/activity fields. Task 3 added `validate_photo`
    (image validation, mirroring scans.serializers.ScanUploadSerializer) and
    wired a photo upload through the existing scans.ml_model CNN -- see
    `validate_photo` and `_run_photo_diagnosis` below. AI analysis of the
    day's diary text (`ai_analysis`/`ai_analysis_status`) is still Task 4's
    job, not this one.

    `tracker` is writable on create (same open-FK pattern as
    `FarmerCropTrackerSerializer.crop`), but `validate()` below confirms it
    belongs to the requesting farmer -- the view's `get_queryset` scoping
    only protects reads, not this create path, since `tracker` is an
    open-ended FK a client could point at any id.

    `photo_diagnosis_confidence` is a `FloatField(null=True)` on the model
    without `blank=True` (flagged in Task 1's review), so it's declared
    explicitly here as `read_only=True` rather than left to DRF's default
    ModelSerializer field generation -- DRF only auto-infers
    `required=False` from a model field's `blank=True`, and this field has
    none, so left to the default it would risk a spurious 400 on a
    request that omits it if this field's read-only status ever changes.
    Declaring it `read_only=True` here sidesteps that entirely (a
    read-only field is never required for input, so a separate
    `required=False` would be redundant on top of it).
    """

    photo_diagnosis_confidence = serializers.FloatField(read_only=True)

    def validate_photo(self, value):
        # DRF turns an empty multipart `photo=""` or a JSON `"photo": null`
        # into None (the model field is null=True). That means "no photo",
        # not an invalid upload -- allow_none=True passes it straight
        # through rather than raising.
        return validate_and_sanitize_image(value, allow_none=True)

    class Meta:
        model = FarmingDiaryEntry
        fields = [
            "id", "tracker", "entry_date",
            "did_irrigation", "did_fertilizer", "did_spraying", "did_pruning",
            "other_activity_note", "note", "photo",
            "photo_diagnosis_label", "photo_diagnosis_confidence",
            "ai_analysis", "ai_analysis_status",
        ]
        read_only_fields = [
            "id", "entry_date",
            "photo_diagnosis_label", "ai_analysis", "ai_analysis_status",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        tracker = attrs.get("tracker", getattr(self.instance, "tracker", None))
        if user is not None and tracker is not None and tracker.farmer != user:
            # Ownership check, not a data-shape check -- PermissionDenied
            # (403), not ValidationError (400), same split the view relies
            # on so a cross-farmer tracker id never looks like a plain bad
            # request.
            raise PermissionDenied("You can only add diary entries to your own crop trackers.")

        has_activity = any(attrs.get(field) for field in (
            "did_irrigation", "did_fertilizer", "did_spraying", "did_pruning",
        ))
        has_note = bool(attrs.get("note", "").strip())
        has_other_note = bool(attrs.get("other_activity_note", "").strip())
        has_photo = bool(attrs.get("photo"))
        if not (has_activity or has_note or has_other_note or has_photo):
            raise serializers.ValidationError(
                "A diary entry needs at least one activity, a note, or a photo."
            )

        note = attrs.get("note", "")
        if len(note) > NOTE_MAX_LENGTH:
            raise serializers.ValidationError(
                {"note": f"Note must be {NOTE_MAX_LENGTH} characters or fewer."}
            )
        return attrs

    def create(self, validated_data):
        # Idempotent-per-day create: resubmitting the same tracker's entry
        # on the same calendar day updates the existing row in place
        # rather than hitting the model's unique_together("tracker",
        # "entry_date") constraint. This keeps POST /crops/diary/ the only
        # write path for this task (no separate PATCH round trip needed).
        #
        # Returns 200 on this update path (not 201): the view's
        # perform_create always calls serializer.save(), and 200 OK
        # correctly signals "your existing resource was updated" rather
        # than implying a new resource was just created, which 201 would.
        tracker = validated_data["tracker"]
        entry_date = diary_today()
        existing = FarmingDiaryEntry.objects.filter(tracker=tracker, entry_date=entry_date).first()
        if existing is not None:
            # Partial merge, not a full overwrite: only apply fields the
            # client actually SENT in this request, using the raw
            # `initial_data` keys rather than `validated_data`. The four
            # did_* boolean fields have `default=False` on the model, so
            # DRF's ModelSerializer fills an omitted boolean into
            # `validated_data` as False rather than leaving it absent
            # (unlike note/other_activity_note/photo, which have no model
            # default and are correctly absent from validated_data when
            # omitted). Blindly iterating validated_data would silently
            # zero out any activity flag the farmer logged earlier the
            # same day and didn't resend on a later same-day update --
            # e.g. logging irrigation in the morning, then adding just an
            # evening note, would wipe the morning's did_irrigation=True.
            # A deliberately-sent `false` still applies normally here --
            # it's present in initial_data, so this only protects omitted
            # fields, not an explicit un-tick.
            sent_fields = set(self.initial_data.keys())
            for field, value in validated_data.items():
                if field in sent_fields:
                    setattr(existing, field, value)
            existing.save()
            self.instance = existing
            # Read by the view's create() to pick 200 vs 201 -- see the
            # docstring above for why this path returns 200.
            self.updated_existing = True
            # Task 3 -- same "omitted means preserved" rule as every other
            # field above: diagnosis only re-runs when `photo` was actually
            # SENT in this request (i.e. a new photo replaced the old
            # one). When it's omitted, the farmer didn't touch the photo,
            # so the previously-stored photo and its diagnosis fields are
            # left exactly as they were -- not cleared, not special-cased.
            # An explicitly empty/null `photo` clears the photo (via the
            # setattr loop above), so its now-orphaned diagnosis is cleared
            # too rather than re-running the CNN on a photo that isn't there.
            if "photo" in sent_fields:
                if existing.photo:
                    self._run_photo_diagnosis(existing)
                else:
                    existing.photo_diagnosis_label = ""
                    existing.photo_diagnosis_confidence = None
                    existing.save(update_fields=["photo_diagnosis_label", "photo_diagnosis_confidence"])
            return existing
        self.updated_existing = False
        entry = FarmingDiaryEntry.objects.create(entry_date=entry_date, **validated_data)
        if entry.photo:
            self._run_photo_diagnosis(entry)
        return entry

    def _run_photo_diagnosis(self, entry):
        """
        Task 3 -- runs a freshly-(re)attached photo through the existing
        Phase 9/10 CNN (scans.ml_model.predict), same call
        ScanUploadView.create makes, and stores the raw label/confidence
        directly on the model. The Disease lookup
        (scans.ml_model.disease_lookup) is deliberately NOT called here --
        it's only needed later, in Task 4, to build the AI prompt, and
        Task 1's field list stores just the raw label/confidence, never the
        Disease object itself.

        predict() already fails soft -- (None, None) on no model / a
        processing error -- so on failure this simply leaves both fields at
        their model defaults ("" / None) rather than treating it as an
        error that should block the diary entry from saving.
        """
        label, confidence = ml_model.predict(entry.photo.path)
        entry.photo_diagnosis_label = label or ""
        entry.photo_diagnosis_confidence = confidence
        entry.save(update_fields=["photo_diagnosis_label", "photo_diagnosis_confidence"])
