import requests
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.api_responses import bad_request, service_unavailable
from .throttles import WeatherRateThrottle

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
REQUEST_TIMEOUT_SECONDS = 5


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
