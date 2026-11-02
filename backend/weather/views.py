from collections import OrderedDict

import requests
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.api_responses import bad_request, service_unavailable
from .forecast import OPENWEATHER_FORECAST_URL
from .throttles import WeatherRateThrottle

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
REQUEST_TIMEOUT_SECONDS = 5

# How many of OpenWeatherMap's 3-hourly slots the "Today" strip shows (8
# slots = the next 24 hours), and how many calendar days the upcoming-days
# list groups them into. The free /forecast endpoint only ever returns 5
# days of 3-hourly data, so 5 is a hard ceiling, not a stylistic choice.
HOURLY_ENTRIES_LIMIT = 8
DAILY_GROUPS_LIMIT = 5


def _to_iso_utc(dt_txt):
    """OpenWeatherMap's "dt_txt" is "YYYY-MM-DD HH:MM:SS" in UTC -- turn it
    into a real ISO-8601 UTC timestamp the frontend's existing
    `new Date(isoString)` convention (ScanHistoryPage, VideosPage) parses
    correctly, rather than a bare string a browser might read as local time."""
    return dt_txt.replace(" ", "T") + "Z"


def _build_hourly(entries):
    hourly = []
    for entry in entries[:HOURLY_ENTRIES_LIMIT]:
        if not isinstance(entry, dict):
            continue
        dt_txt = entry.get("dt_txt")
        main = entry.get("main") or {}
        temp = main.get("temp")
        if not dt_txt or not isinstance(temp, (int, float)):
            continue
        weather_list = entry.get("weather") or [{}]
        hourly.append({
            "time": _to_iso_utc(dt_txt),
            "temperature": temp,
            "icon": weather_list[0].get("icon", ""),
        })
    return hourly


def _build_daily(entries):
    """Groups every 3-hourly entry by its UTC calendar date, then reduces
    each day's slots to one summary row: the min/max temp across all of
    that day's slots, and the icon/description from whichever slot sits
    closest to 12:00 (OpenWeatherMap has no single "daily" icon of its
    own -- midday is the most representative single sample of the day)."""
    groups = OrderedDict()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        dt_txt = entry.get("dt_txt") or ""
        if len(dt_txt) < 10:
            continue
        groups.setdefault(dt_txt[:10], []).append(entry)

    daily = []
    for date, day_entries in list(groups.items())[:DAILY_GROUPS_LIMIT]:
        temps_min, temps_max = [], []
        midday_entry, midday_diff = None, None

        for entry in day_entries:
            main = entry.get("main") or {}
            if isinstance(main.get("temp_min"), (int, float)):
                temps_min.append(main["temp_min"])
            if isinstance(main.get("temp_max"), (int, float)):
                temps_max.append(main["temp_max"])

            hour_str = (entry.get("dt_txt") or "")[11:13]
            if hour_str.isdigit():
                diff = abs(int(hour_str) - 12)
                if midday_diff is None or diff < midday_diff:
                    midday_diff, midday_entry = diff, entry

        if not temps_min or not temps_max or midday_entry is None:
            # Nothing usable in this group -- skip it rather than publish a
            # day with no real data.
            continue

        weather_list = midday_entry.get("weather") or [{}]
        daily.append({
            "date": date,
            "temp_min": min(temps_min),
            "temp_max": max(temps_max),
            "icon": weather_list[0].get("icon", ""),
            "description": weather_list[0].get("description", ""),
        })
    return daily


class WeatherView(APIView):
    """
    Phase 13 -- proxies OpenWeatherMap so the API key never reaches the
    browser. Accepts EITHER ?lat=&lon= (from the browser's geolocation) OR
    ?city= (manual entry), matching the phase plan's "manual entry or
    browser geolocation" requirement.

    Every failure mode below is handled explicitly and returns a plain-
    language message rather than ever letting a raw 500/traceback or a
    third-party outage turn into a broken page for the farmer.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WeatherRateThrottle]

    def get(self, request):
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        city = request.query_params.get("city", "").strip()

        if not city and not (lat and lon):
            return bad_request("Please provide a location (use your device location, or type a place name).")

        api_key = getattr(settings, "OPENWEATHER_API_KEY", "")
        if not api_key:
            # Not configured yet -- fail soft exactly like a live outage
            # would, rather than a 500. This is the state the app is in
            # until a real OpenWeatherMap key is added to .env.
            return service_unavailable("Weather unavailable right now. Please try again later.")

        params = {"appid": api_key, "units": "metric"}
        if city:
            params["q"] = city
        else:
            params["lat"] = lat
            params["lon"] = lon

        try:
            response = requests.get(OPENWEATHER_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException:
            # Network error, DNS failure, timeout, etc. -- the external
            # service is unreachable, not our farmer's fault.
            return service_unavailable("Weather unavailable right now. Please try again later.")

        if response.status_code == 404:
            return bad_request("Location not found. Please check the spelling or try a different place name.")

        if response.status_code == 401:
            # Invalid/expired API key -- an ops problem, not something the
            # farmer using the app can fix, so it gets the same graceful
            # message rather than leaking "unauthorized" API details.
            return service_unavailable("Weather unavailable right now. Please try again later.")

        if response.status_code != 200:
            # Rate-limited (429) or any other upstream failure.
            return service_unavailable("Weather unavailable right now. Please try again later.")

        try:
            data = response.json()
            weather_list = data.get("weather") or [{}]
            result = {
                "location": f"{data.get('name', 'Unknown')}, {data.get('sys', {}).get('country', '')}".strip(", "),
                "temperature": data.get("main", {}).get("temp"),
                "feels_like": data.get("main", {}).get("feels_like"),
                "humidity": data.get("main", {}).get("humidity"),
                "wind_speed": data.get("wind", {}).get("speed"),
                "description": weather_list[0].get("description", ""),
                "icon": weather_list[0].get("icon", ""),
            }
        except (ValueError, KeyError, IndexError):
            # Malformed response from the upstream API -- still don't crash.
            return service_unavailable("Weather unavailable right now. Please try again later.")

        return Response(result, status=status.HTTP_200_OK)


class WeatherForecastView(APIView):
    """
    Exposes OpenWeatherMap's 3-hourly/5-day forecast data for the Weather
    page's "Today" hourly strip and upcoming-days list. The same raw data
    already reached this backend via forecast.fetch_forecast_summary (for
    the crop disease-risk rules), just aggregated into a different, non-UI
    shape -- this view hits the same upstream endpoint independently and
    shapes it for display instead, rather than overloading that helper
    with a second return format. Same params/error-handling contract as
    WeatherView: fail-soft 503s, never a raw 500/traceback.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WeatherRateThrottle]

    def get(self, request):
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        city = request.query_params.get("city", "").strip()

        if not city and not (lat and lon):
            return bad_request("Please provide a location (use your device location, or type a place name).")

        api_key = getattr(settings, "OPENWEATHER_API_KEY", "")
        if not api_key:
            return service_unavailable("Weather unavailable right now. Please try again later.")

        params = {"appid": api_key, "units": "metric"}
        if city:
            params["q"] = city
        else:
            params["lat"] = lat
            params["lon"] = lon

        try:
            response = requests.get(OPENWEATHER_FORECAST_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException:
            return service_unavailable("Weather unavailable right now. Please try again later.")

        if response.status_code == 404:
            return bad_request("Location not found. Please check the spelling or try a different place name.")

        if response.status_code != 200:
            return service_unavailable("Weather unavailable right now. Please try again later.")

        try:
            data = response.json()
            entries = data.get("list") or []
        except (ValueError, KeyError, TypeError):
            return service_unavailable("Weather unavailable right now. Please try again later.")

        return Response({
            "hourly": _build_hourly(entries),
            "daily": _build_daily(entries),
        }, status=status.HTTP_200_OK)
