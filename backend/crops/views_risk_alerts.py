"""
Proactive weather + crop-growth-stage based disease risk alerts (Phase B /
Task 12).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/views.py into focused per-feature modules. No
behavior changed -- same function, same class, just regrouped.
"""
import hashlib

from django.core.cache import cache
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.api_responses import service_unavailable
from weather.forecast import fetch_forecast_summary
from .models import FarmerCropTracker
from .risk_engine import evaluate_risk

# Same pattern as locator/views.py: the forecast itself doesn't change
# minute to minute, so short-TTL caching avoids hitting OpenWeatherMap once
# per farmer per page load.
RISK_ALERTS_CACHE_TIMEOUT_SECONDS = 600  # 10 minutes


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
                    return service_unavailable("Risk alerts are unavailable right now. Please try again later.")
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
