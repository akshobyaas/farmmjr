import requests
from django.conf import settings

OPENWEATHER_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"
REQUEST_TIMEOUT_SECONDS = 5

# 3-hourly entries x 3 days = 24 entries. The free OpenWeatherMap forecast
# endpoint returns up to 5 days of 3-hourly data; we only want the first 3
# days' worth for the disease-risk window (Task 12 will apply its own
# per-rule window on top of these raw aggregates).
FORECAST_ENTRIES_FOR_3_DAYS = 24


def fetch_forecast_summary(location):
    """
    Phase B -- fetches a 3-day OpenWeatherMap forecast for `location` and
    aggregates it into the raw numbers a disease-risk rule needs (max
    humidity, min/max temp, total rainfall). Returns None on any failure
    (missing API key, network error, non-200 response, malformed JSON) --
    mirrors weather/views.py's error handling exactly, factored out here so
    Task 12's risk-rule evaluation can reuse it without duplicating that
    handling.

    This function deliberately returns raw aggregates, not a verdict --
    "qualifying_days" (how many of those days meet a given rule's
    thresholds) is left to the caller, since that depends on the specific
    DiseaseRiskRule being evaluated.
    """
    api_key = getattr(settings, "OPENWEATHER_API_KEY", "")
    if not api_key:
        return None

    params = {"appid": api_key, "units": "metric", "q": location}

    try:
        response = requests.get(OPENWEATHER_FORECAST_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException:
        return None

    if response.status_code != 200:
        return None

    try:
        data = response.json()
        entries = data["list"][:FORECAST_ENTRIES_FOR_3_DAYS]
    except (ValueError, KeyError, TypeError):
        return None

    if not entries:
        return None

    humidity_values = []
    temp_values = []
    total_rainfall_mm = 0.0

    for entry in entries:
        if not isinstance(entry, dict):
            continue

        main = entry.get("main") or {}
        humidity = main.get("humidity")
        if isinstance(humidity, (int, float)):
            humidity_values.append(humidity)

        temp = main.get("temp")
        if isinstance(temp, (int, float)):
            temp_values.append(temp)

        rain = entry.get("rain") or {}
        rainfall = rain.get("3h")
        if isinstance(rainfall, (int, float)):
            total_rainfall_mm += rainfall

    if not humidity_values or not temp_values:
        # Every entry was malformed -- nothing usable to aggregate.
        return None

    return {
        "max_humidity_percent": int(max(humidity_values)),
        "min_temp_celsius": float(min(temp_values)),
        "max_temp_celsius": float(max(temp_values)),
        "total_rainfall_mm": total_rainfall_mm,
    }
