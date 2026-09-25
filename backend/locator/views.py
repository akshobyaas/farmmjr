import hashlib
import math
import requests
from django.core.cache import cache
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .throttles import LocatorRateThrottle

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT_SECONDS = 10
SEARCH_RADIUS_METERS = 15000  # 15km -- rural agri services can be sparse,
# so this is wider than a typical "nearby" radius for an urban POI search.
MAX_RESULTS = 20
CACHE_TIMEOUT_SECONDS = 600  # 10 minutes. Nominatim/Overpass usage policy
# both call for caching results rather than re-querying the same thing
# repeatedly -- this also means two farmers in the same area only cost one
# real call between them.

# Nominatim's usage policy requires a descriptive User-Agent identifying
# the application (unauthenticated/generic requests get blocked).
_HEADERS = {"User-Agent": "SmartFarmingAI/1.0 (VTU B.E. major project, student use)"}

# OSM tags that plausibly correspond to "agriculture services" a farmer
# would want nearby -- a mandi/market, an agri-input shop, a garden centre,
# or a government agriculture office. Real OSM coverage in rural Karnataka
# is genuinely uneven, so an empty result for a given village is a real,
# expected outcome (see the phase plan's "no results found nearby" edge
# case), not a bug.
_OVERPASS_TAG_QUERIES = [
    ('shop', 'agrarian', 'Agricultural Supply Shop'),
    ('shop', 'farm', 'Farm Shop'),
    ('shop', 'garden_centre', 'Garden Centre'),
    ('amenity', 'marketplace', 'Market / Mandi'),
]
# Government agriculture offices use a two-tag combination in OSM, handled
# separately below since it doesn't fit the single key=value shape above.
_GOV_AGRICULTURE_LABEL = "Agriculture Office"


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _geocode_place(place):
    """Turns a typed place name into (lat, lon), or None if not found /
    the geocoding service is unavailable."""
    params = {"q": place, "format": "json", "limit": 1, "countrycodes": "in"}
    try:
        response = requests.get(
            NOMINATIM_SEARCH_URL, params=params, headers=_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
        )
    except requests.RequestException:
        return None, "unavailable"
    if response.status_code != 200:
        return None, "unavailable"
    try:
        results = response.json()
    except ValueError:
        return None, "unavailable"
    if not results:
        return None, "not_found"
    try:
        return (float(results[0]["lat"]), float(results[0]["lon"])), None
    except (KeyError, ValueError, TypeError):
        return None, "unavailable"


def _build_overpass_query(lat, lon):
    clauses = "".join(
        f'node["{key}"="{value}"](around:{SEARCH_RADIUS_METERS},{lat},{lon});\n'
        for key, value, _label in _OVERPASS_TAG_QUERIES
    )
    clauses += (
        f'node["office"="government"]["government"="agriculture"]'
        f"(around:{SEARCH_RADIUS_METERS},{lat},{lon});\n"
    )
    return f"[out:json][timeout:15];\n(\n{clauses});\nout center {MAX_RESULTS * 2};"


def _label_for_tags(tags):
    for key, value, label in _OVERPASS_TAG_QUERIES:
        if tags.get(key) == value:
            return label
    if tags.get("office") == "government" and tags.get("government") == "agriculture":
        return _GOV_AGRICULTURE_LABEL
    return "Agriculture Service"


class NearbyServicesView(APIView):
    """
    Phase 15 -- proxies OpenStreetMap's Nominatim (geocoding a typed place
    name) and Overpass (finding nearby agriculture-related POIs by tag), so
    neither service is ever called directly from the browser. No API key
    needed for either -- both are free public OSM services.

    Accepts EITHER ?lat=&lon= (from the browser's geolocation) OR ?place=
    (manual entry), same pattern as weather.views.WeatherView.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [LocatorRateThrottle]

    def get(self, request):
        lat_param = request.query_params.get("lat")
        lon_param = request.query_params.get("lon")
        place = request.query_params.get("place", "").strip()

        if not place and not (lat_param and lon_param):
            return Response(
                {"detail": "Please provide a location (use your device location, or type a place name)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if place:
            coords, geocode_error = _geocode_place(place)
            if geocode_error == "not_found":
                return Response(
                    {"detail": "Location not found. Please check the spelling or try a different place name."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if geocode_error == "unavailable" or coords is None:
                return Response(
                    {"detail": "Nearby services are unavailable right now. Please try again later."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            lat, lon = coords
        else:
            try:
                lat, lon = float(lat_param), float(lon_param)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Invalid location. Please try again."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Round to ~1.1km grid for the cache key -- a farmer's exact GPS
        # coordinates jitter slightly between requests, and this still
        # gives a genuinely "nearby" cache hit without over-fragmenting it.
        cache_key = f"locator_nearby:{hashlib.sha256(f'{lat:.2f},{lon:.2f}'.encode()).hexdigest()}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        query = _build_overpass_query(lat, lon)
        try:
            response = requests.post(
                OVERPASS_URL, data={"data": query}, headers=_HEADERS, timeout=REQUEST_TIMEOUT_SECONDS
            )
        except requests.RequestException:
            return Response(
                {"detail": "Nearby services are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if response.status_code != 200:
            return Response(
                {"detail": "Nearby services are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            elements = response.json().get("elements", [])
        except ValueError:
            return Response(
                {"detail": "Nearby services are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        results = []
        for el in elements:
            el_lat = el.get("lat")
            el_lon = el.get("lon")
            if el_lat is None or el_lon is None:
                continue
            tags = el.get("tags", {})
            results.append(
                {
                    "id": el.get("id"),
                    "name": tags.get("name") or _label_for_tags(tags),
                    "category": _label_for_tags(tags),
                    "lat": el_lat,
                    "lon": el_lon,
                    "distance_km": round(_haversine_km(lat, lon, el_lat, el_lon), 1),
                    "address": tags.get("addr:full") or tags.get("addr:street") or "",
                }
            )

        results.sort(key=lambda r: r["distance_km"])
        results = results[:MAX_RESULTS]

        payload = {"origin": {"lat": lat, "lon": lon}, "results": results}
        cache.set(cache_key, payload, CACHE_TIMEOUT_SECONDS)
        return Response(payload, status=status.HTTP_200_OK)
