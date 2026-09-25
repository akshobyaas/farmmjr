"""
Testing/hardening pass -- weather app had no real test coverage. Covers
every failure mode WeatherView.get handles explicitly (missing config,
network errors, upstream error codes, malformed responses) plus the
success path, all by mocking requests.get so no real network call is made.
"""
from unittest.mock import patch, Mock

import requests
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
