"""
Testing/hardening pass -- locator app had no real test coverage. Covers
the Nominatim geocode + Overpass nearby-POI proxy (both mocked, no real
network call), its failure modes, and the 10-minute result cache.
"""
from unittest.mock import patch, Mock

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


def make_user():
    return User.objects.create_user(
        username="farmer_ravi", email="ravi@example.com", password="FarmerPass#123",
        role=User.Role.FARMER,
    )


def mock_response(status_code=200, json_data=None):
    resp = Mock()
    resp.status_code = status_code
    resp.json.return_value = json_data if json_data is not None else {}
    return resp


NOMINATIM_HIT = [{"lat": "12.90", "lon": "74.85"}]
OVERPASS_HIT = {
    "elements": [
        {
            "id": 1,
            "lat": 12.905,
            "lon": 74.855,
            "tags": {"shop": "agrarian", "name": "Ravi Agri Supplies", "addr:street": "Main Road"},
        },
        {
            # Missing lat/lon -- should be skipped rather than crash.
            "id": 2,
            "tags": {"shop": "farm"},
        },
    ]
}


class NearbyServicesViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.url = reverse("locator-nearby")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url, {"place": "Puttur"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_location_params_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_lat_lon_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"lat": "not-a-number", "lon": "74.8"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("locator.views.requests.post")
    @patch("locator.views.requests.get")
    def test_successful_search_by_place_name_geocodes_then_finds_pois(self, mock_get, mock_post):
        mock_get.return_value = mock_response(200, NOMINATIM_HIT)
        mock_post.return_value = mock_response(200, OVERPASS_HIT)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"place": "Puttur, Dakshina Kannada"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)  # the malformed element was skipped
        self.assertEqual(response.data["results"][0]["name"], "Ravi Agri Supplies")
        self.assertIn("distance_km", response.data["results"][0])

    @patch("locator.views.requests.post")
    def test_successful_search_by_lat_lon_skips_geocoding(self, mock_post):
        mock_post.return_value = mock_response(200, OVERPASS_HIT)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"lat": "12.90", "lon": "74.85"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["origin"], {"lat": 12.9, "lon": 74.85})

    @patch("locator.views.requests.get")
    def test_place_that_does_not_geocode_returns_not_found(self, mock_get):
        mock_get.return_value = mock_response(200, [])  # Nominatim: no matches
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"place": "Nonexistentplacexyz"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not found", response.data["detail"].lower())

    @patch("locator.views.requests.get")
    def test_geocoding_service_network_error_degrades_gracefully(self, mock_get):
        mock_get.side_effect = requests.ConnectionError("DNS failure")
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"place": "Puttur"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @patch("locator.views.requests.post")
    def test_overpass_failure_degrades_gracefully_after_successful_geocode(self, mock_post):
        mock_post.side_effect = requests.Timeout("timed out")
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"lat": "12.90", "lon": "74.85"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @patch("locator.views.requests.post")
    def test_no_nearby_services_found_is_a_normal_empty_result_not_an_error(self, mock_post):
        mock_post.return_value = mock_response(200, {"elements": []})
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"lat": "12.90", "lon": "74.85"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    @patch("locator.views.requests.post")
    def test_repeated_nearby_lat_lon_is_served_from_cache_not_a_second_overpass_call(self, mock_post):
        mock_post.return_value = mock_response(200, OVERPASS_HIT)
        self.client.force_authenticate(self.user)

        first = self.client.get(self.url, {"lat": "12.90", "lon": "74.85"})
        second = self.client.get(self.url, {"lat": "12.9001", "lon": "74.8499"})  # rounds to same cache key

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_post.call_count, 1)
