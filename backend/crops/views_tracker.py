"""
The Crop Lifecycle Tracker's own views (Phase A / Task 6-8).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/views.py into focused per-feature modules. No
behavior changed -- same classes, just regrouped.
"""
from rest_framework import generics, permissions
from .models import FarmerCropTracker
from .serializers_tracker import FarmerCropTrackerSerializer
from .stage_derivation import derive_stage_for_tracker


def _derive_and_save_stage_if_not_explicit(tracker, request):
    """
    Shared by FarmerCropTrackerListCreateView.perform_create and
    FarmerCropTrackerDetailView.perform_update: if the farmer didn't
    explicitly send `current_stage` in the request body, derive it via
    `derive_stage_for_tracker` and persist it as a suggestion. An explicit
    override is left untouched (and was already validated against the
    tracker's own crop in FarmerCropTrackerSerializer.validate).
    """
    if "current_stage" not in request.data:
        tracker.current_stage = derive_stage_for_tracker(tracker)
        tracker.save()


class FarmerCropTrackerListCreateView(generics.ListCreateAPIView):
    """
    GET: a farmer sees only their own crop trackers.
    POST: a farmer starts tracking a crop. `farmer` always comes from the
    authenticated request, never the request body -- same pattern as
    AdvisoryQueryListCreateView.perform_create.

    If the farmer didn't explicitly send `current_stage`, it's derived via
    `derive_stage_for_tracker` and set as a suggestion -- the common case,
    since a farmer normally just records a planting date and lets the app
    work out where their crop is.
    """
    serializer_class = FarmerCropTrackerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return FarmerCropTracker.objects.filter(
            farmer=self.request.user
        ).select_related("crop", "current_stage")

    def perform_create(self, serializer):
        tracker = serializer.save(farmer=self.request.user)
        _derive_and_save_stage_if_not_explicit(tracker, self.request)


class FarmerCropTrackerDetailView(generics.RetrieveUpdateAPIView):
    """
    GET/PATCH a single tracker -- scoped to the farmer's own rows only via
    get_queryset, so one farmer can never view or update another's
    tracker (a mismatched pk simply 404s, same as any other DRF
    get_object() lookup against a filtered queryset). PUT is intentionally
    not allowed; a tracker is only ever partially updated.

    Re-derives `current_stage` on update (e.g. after a planting_date
    change) unless the farmer explicitly sent `current_stage` themselves.
    """
    serializer_class = FarmerCropTrackerSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return FarmerCropTracker.objects.filter(
            farmer=self.request.user
        ).select_related("crop", "current_stage")

    def perform_update(self, serializer):
        tracker = serializer.save()
        _derive_and_save_stage_if_not_explicit(tracker, self.request)
