import hashlib

from django.core.cache import cache
from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from weather.forecast import fetch_forecast_summary
from .models import Crop, CropTask, Disease, FarmerCropTracker
from .risk_engine import evaluate_risk
from .serializers import (
    CropListSerializer, CropDetailSerializer, DiseaseDetailSerializer,
    CropTaskSerializer, FarmerCropTrackerSerializer,
)
from .stage_derivation import derive_stage_for_tracker

MAX_SEARCH_LENGTH = 100  # a crop name will never legitimately be longer than this

# Same pattern as locator/views.py: the forecast itself doesn't change
# minute to minute, so short-TTL caching avoids hitting OpenWeatherMap once
# per farmer per page load.
RISK_ALERTS_CACHE_TIMEOUT_SECONDS = 600  # 10 minutes


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


class CropListView(generics.ListAPIView):
    """
    Public, read-only crop catalog. ListAPIView only ever exposes GET.
    Supports ?search=<name> for basic filtering, passed through Django's
    ORM (icontains) which parameterizes the query automatically.
    """
    serializer_class = CropListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Crop.objects.all()
        search = self.request.query_params.get("search", "").strip()[:MAX_SEARCH_LENGTH]
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset


class CropDetailView(generics.RetrieveAPIView):
    """Public, read-only single-crop detail. GET-only by construction."""
    queryset = Crop.objects.all()
    serializer_class = CropDetailSerializer
    permission_classes = [permissions.AllowAny]


class DiseaseDetailView(generics.RetrieveAPIView):
    """
    Phase 11 -- public, read-only: given a disease ID, return its full
    recommendation. GET-only by construction, same as the crop endpoints.
    Used directly by the scan result flow (Phase 10 already nests this
    data in the upload response) and available standalone for anything
    that only has a disease ID (e.g. a future crop disease list page).
    """
    queryset = Disease.objects.select_related("crop", "recommendation").all()
    serializer_class = DiseaseDetailSerializer
    permission_classes = [permissions.AllowAny]


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


def _risk_alerts_cache_key(location, tracker):
    """
    Cached per (location, crop_id, stage_id) -- not just per location --
    since the cached value here is the fully-evaluated risk-alert list for
    that specific tracker, not the raw forecast. This means two different
    farmers tracking the same crop at the same stage in the same place
    share a cache entry (and only one of them pays for the OpenWeatherMap
    call), while a farmer with two different active trackers (e.g. Rice
    and Arecanut) still gets a distinct, correctly-evaluated entry for
    each even though both read the same location.
    """
    location_digest = hashlib.sha256(location.strip().lower().encode()).hexdigest()
    stage_part = tracker.current_stage_id or "none"
    return f"risk_alerts:{location_digest}:{tracker.crop_id}:{stage_part}"


class RiskAlertsView(APIView):
    """
    Phase B / Task 12 -- proactive weather-driven disease-risk alerts for
    the authenticated farmer's own active crop tracker(s).

    Three early-return cases, all deliberately NOT treated as errors except
    the forecast failure (matching the Interfaces contract exactly):
      - no active trackers at all -> {"trackers": []}, 200
      - tracker(s) exist but the farmer has no home_location set -> a
        plain-language {"detail": ...}, 200 (a normal incomplete-setup
        state, not a failure)
      - the forecast fetch itself fails -> 503, same graceful-degradation
        pattern as weather.views.WeatherView (plain-language `detail`,
        never a raw 500).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trackers = list(
            FarmerCropTracker.objects.filter(
                farmer=request.user, is_active=True
            ).select_related("crop", "current_stage")
        )

        if not trackers:
            return Response({"trackers": []}, status=status.HTTP_200_OK)

        location = (request.user.home_location or "").strip()
        if not location:
            return Response(
                {"detail": "Set your location on your profile to see risk alerts."},
                status=status.HTTP_200_OK,
            )

        results = []
        for tracker in trackers:
            cache_key = _risk_alerts_cache_key(location, tracker)
            cached_alerts = cache.get(cache_key)
            if cached_alerts is not None:
                alerts = cached_alerts
            else:
                forecast = fetch_forecast_summary(location)
                if forecast is None:
                    return Response(
                        {"detail": "Risk alerts are unavailable right now. Please try again later."},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    )
                alerts = evaluate_risk(tracker, forecast)
                cache.set(cache_key, alerts, RISK_ALERTS_CACHE_TIMEOUT_SECONDS)

            results.append(
                {
                    "tracker_id": tracker.id,
                    "crop_id": tracker.crop_id,
                    "crop_name": tracker.crop.name,
                    "current_stage": tracker.current_stage.name if tracker.current_stage else None,
                    "risk_alerts": alerts,
                }
            )

        return Response({"trackers": results}, status=status.HTTP_200_OK)


class TodaysTasksView(APIView):
    """
    Task 17 -- "Tasks for today" for the authenticated farmer's own
    active tracker(s), scoped to crop + CURRENT stage only. No weather/
    forecast dependency and no caching need here (unlike RiskAlertsView
    above) -- it's a pure DB lookup. A tracker with no current_stage yet
    contributes zero tasks, not an error.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trackers = list(
            FarmerCropTracker.objects.filter(
                farmer=request.user, is_active=True, current_stage__isnull=False
            ).select_related("crop", "current_stage")
        )

        if not trackers:
            return Response({"tasks": []}, status=status.HTTP_200_OK)

        # Match each tracker's (crop, current_stage) pair exactly -- a plain
        # crop_id__in=[...] combined with stage_id__in=[...] would cross-join
        # across multiple trackers (e.g. a farmer tracking both Rice and
        # Arecanut could wrongly match a stray CropTask row whose crop/stage
        # combination belongs to neither tracker), so build the OR of exact
        # per-tracker pairs instead.
        pair_filter = Q()
        for tracker in trackers:
            pair_filter |= Q(crop_id=tracker.crop_id, stage_id=tracker.current_stage_id)
        tasks = CropTask.objects.filter(pair_filter)
        serialized = CropTaskSerializer(tasks, many=True).data
        return Response({"tasks": serialized}, status=status.HTTP_200_OK)
