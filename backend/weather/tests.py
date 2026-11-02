"""
Testing/hardening pass -- weather app had no real test coverage. Covers
every failure mode WeatherView.get handles explicitly (missing config,
network errors, upstream error codes, malformed responses) plus the
success path, all by mocking requests.get so no real network call is made.
"""
from unittest.mock import patch, Mock

import requests
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .forecast import fetch_forecast_summary

User = get_user_model()


def make_user():
    return User.objects.create_user(
        username="farmer_ravi", email="ravi@example.com", password="FarmerPass#123",
        role=User.Role.FARMER,
    )


def mock_response(status_code=200, json_data=None, raise_for_json=False):
    resp = Mock()
    resp.status_code = status_code
    if raise_for_json:
        resp.json.side_effect = ValueError("bad json")
    else:
        resp.json.return_value = json_data or {}
    return resp


SAMPLE_OWM_PAYLOAD = {
    "name": "Mangaluru",
    "sys": {"country": "IN"},
    "main": {"temp": 29.5, "feels_like": 33.1, "humidity": 78},
    "wind": {"speed": 3.2},
    "weather": [{"description": "light rain", "icon": "10d"}],
}


class WeatherViewTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.url = reverse("weather")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url, {"city": "Mangaluru"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_location_params_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(OPENWEATHER_API_KEY="")
    def test_missing_api_key_fails_soft_as_503_not_500(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"city": "Mangaluru"})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_successful_lookup_by_city_shapes_the_response_correctly(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_OWM_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["location"], "Mangaluru, IN")
        self.assertEqual(response.data["temperature"], 29.5)
        self.assertEqual(response.data["humidity"], 78)
        self.assertEqual(response.data["description"], "light rain")
        # The API key must never leak into the response sent to the browser.
        self.assertNotIn("dummy-key", str(response.data))

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_successful_lookup_by_lat_lon(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_OWM_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"lat": "12.9", "lon": "74.8"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        called_params = mock_get.call_args.kwargs["params"]
        self.assertEqual(called_params["lat"], "12.9")
        self.assertEqual(called_params["lon"], "74.8")

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_upstream_404_means_location_not_found(self, mock_get):
        mock_get.return_value = mock_response(404)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Nonexistentplacexyz"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not found", response.data["detail"].lower())

    @override_settings(OPENWEATHER_API_KEY="bad-key")
    @patch("weather.views.requests.get")
    def test_upstream_401_never_leaks_as_our_own_401(self, mock_get):
        # A bad/expired upstream key must not be confused with the
        # farmer's own auth state -- this should stay a 503, not a 401.
        mock_get.return_value = mock_response(401)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_upstream_rate_limited_429_degrades_gracefully(self, mock_get):
        mock_get.return_value = mock_response(429)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_network_error_does_not_crash_the_view(self, mock_get):
        mock_get.side_effect = requests.ConnectionError("DNS failure")
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_malformed_upstream_json_does_not_crash_the_view(self, mock_get):
        mock_get.return_value = mock_response(200, raise_for_json=True)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


def build_forecast_entry(dt_txt, temp, temp_min=None, temp_max=None, description="clear sky", icon="01d"):
    return {
        "dt_txt": dt_txt,
        "main": {
            "temp": temp,
            "temp_min": temp_min if temp_min is not None else temp,
            "temp_max": temp_max if temp_max is not None else temp,
        },
        "weather": [{"description": description, "icon": icon}],
    }


# Two partial days: 2026-11-02 (14:00, 17:00 -- today's remaining slots)
# plus 2026-11-03 (two slots, including a 12:00 "midday" one used to pick
# that day's representative icon/description/temp spread).
SAMPLE_OWM_FORECAST_PAYLOAD = {
    "city": {"name": "Mangaluru", "country": "IN"},
    "list": [
        build_forecast_entry("2026-11-02 14:00:00", 29.0, temp_min=28.0, temp_max=29.5, description="broken clouds", icon="04d"),
        build_forecast_entry("2026-11-02 17:00:00", 27.5, temp_min=27.0, temp_max=28.0, description="light rain", icon="10d"),
        build_forecast_entry("2026-11-03 09:00:00", 25.0, temp_min=24.0, temp_max=25.5, description="scattered clouds", icon="03d"),
        build_forecast_entry("2026-11-03 12:00:00", 30.0, temp_min=29.0, temp_max=31.0, description="clear sky", icon="01d"),
        build_forecast_entry("2026-11-03 21:00:00", 23.0, temp_min=22.0, temp_max=23.5, description="clear sky", icon="01n"),
    ],
}


class WeatherForecastViewTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.url = reverse("weather-forecast")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url, {"city": "Mangaluru"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_location_params_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(OPENWEATHER_API_KEY="")
    def test_missing_api_key_fails_soft_as_503_not_500(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"city": "Mangaluru"})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_successful_lookup_shapes_hourly_entries(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_OWM_FORECAST_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hourly = response.data["hourly"]
        self.assertEqual(len(hourly), 5)
        self.assertEqual(hourly[0]["time"], "2026-11-02T14:00:00Z")
        self.assertEqual(hourly[0]["temperature"], 29.0)
        self.assertEqual(hourly[0]["icon"], "04d")
        self.assertNotIn("dummy-key", str(response.data))

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_hourly_entries_are_capped_at_eight(self, mock_get):
        many_entries = {
            "list": [
                build_forecast_entry(f"2026-11-0{(i // 8) + 2} {(i % 8) * 3:02d}:00:00", 20 + i)
                for i in range(20)
            ]
        }
        mock_get.return_value = mock_response(200, many_entries)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(len(response.data["hourly"]), 8)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_daily_groups_entries_by_date_with_min_max_temp(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_OWM_FORECAST_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        daily = response.data["daily"]
        self.assertEqual(len(daily), 2)
        self.assertEqual(daily[0]["date"], "2026-11-02")
        self.assertEqual(daily[0]["temp_min"], 27.0)
        self.assertEqual(daily[0]["temp_max"], 29.5)
        self.assertEqual(daily[1]["date"], "2026-11-03")
        self.assertEqual(daily[1]["temp_min"], 22.0)
        self.assertEqual(daily[1]["temp_max"], 31.0)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_daily_group_picks_the_entry_closest_to_midday_for_icon_and_description(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_OWM_FORECAST_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        # 2026-11-03 has slots at 09:00, 12:00, 21:00 -- 12:00 is the exact
        # midday match, so its icon/description represent the whole day.
        second_day = response.data["daily"][1]
        self.assertEqual(second_day["icon"], "01d")
        self.assertEqual(second_day["description"], "clear sky")

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_upstream_404_means_location_not_found(self, mock_get):
        mock_get.return_value = mock_response(404)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Nonexistentplacexyz"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_network_error_does_not_crash_the_view(self, mock_get):
        mock_get.side_effect = requests.ConnectionError("DNS failure")
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENWEATHER_API_KEY="dummy-key")
    @patch("weather.views.requests.get")
    def test_malformed_upstream_json_does_not_crash_the_view(self, mock_get):
        mock_get.return_value = mock_response(200, raise_for_json=True)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"city": "Mangaluru"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)


class ForecastHelperTests(TestCase):
    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_returns_none_on_network_error(self, mock_get):
        mock_get.side_effect = requests.RequestException()
        self.assertIsNone(fetch_forecast_summary("Puttur"))

    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_aggregates_humidity_and_rainfall_from_3hourly_entries(self, mock_get):
        mock_get.return_value = Mock(status_code=200, json=lambda: {
            "list": [
                {"main": {"humidity": 90, "temp": 24}, "rain": {"3h": 2.0}},
                {"main": {"humidity": 95, "temp": 26}, "rain": {"3h": 1.5}},
            ]
        })
        result = fetch_forecast_summary("Puttur")
        self.assertEqual(result["max_humidity_percent"], 95)
        self.assertAlmostEqual(result["total_rainfall_mm"], 3.5)

    @override_settings(OPENWEATHER_API_KEY="")
    def test_returns_none_when_key_not_configured(self):
        self.assertIsNone(fetch_forecast_summary("Puttur"))

    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_entry_missing_rain_key_contributes_zero_rainfall(self, mock_get):
        mock_get.return_value = Mock(status_code=200, json=lambda: {
            "list": [
                {"main": {"humidity": 80, "temp": 22}},
                {"main": {"humidity": 85, "temp": 23}, "rain": {"3h": 4.0}},
            ]
        })
        result = fetch_forecast_summary("Puttur")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result["total_rainfall_mm"], 4.0)

    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_one_malformed_main_entry_does_not_kill_the_aggregate(self, mock_get):
        mock_get.return_value = Mock(status_code=200, json=lambda: {
            "list": [
                {"rain": {"3h": 1.0}},  # missing "main" entirely
                {"main": {"humidity": 88, "temp": 25}, "rain": {"3h": 1.0}},
                {"main": {"humidity": 92, "temp": 27}, "rain": {"3h": 1.0}},
            ]
        })
        result = fetch_forecast_summary("Puttur")
        self.assertIsNotNone(result)
        # The malformed entry's humidity/temp are skipped, not counted as 0.
        self.assertEqual(result["max_humidity_percent"], 92)
        self.assertEqual(result["min_temp_celsius"], 25.0)
        self.assertEqual(result["max_temp_celsius"], 27.0)
        # The malformed entry's own rainfall still counts (rain and main are
        # independent fields), plus the two well-formed entries' rainfall.
        self.assertAlmostEqual(result["total_rainfall_mm"], 3.0)

    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_returns_none_when_every_entry_is_malformed(self, mock_get):
        mock_get.return_value = Mock(status_code=200, json=lambda: {
            "list": [
                {"rain": {"3h": 1.0}},  # missing "main"
                "not-a-dict",
                {"main": {}},  # main present but no humidity/temp
            ]
        })
        self.assertIsNone(fetch_forecast_summary("Puttur"))
