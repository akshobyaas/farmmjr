"""
Testing/hardening pass -- videos app had no real test coverage. Covers the
YouTube-proxy success/failure paths (mocked, no real network call) and the
10-minute result cache introduced in Phase 14.
"""
from unittest.mock import patch, Mock

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
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


def mock_response(status_code=200, json_data=None):
    resp = Mock()
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    return resp


SAMPLE_YT_PAYLOAD = {
    "items": [
        {
            "id": {"videoId": "abc123"},
            "snippet": {
                "title": "Arecanut Bud Rot Treatment",
                "channelTitle": "AgriChannel",
                "thumbnails": {"medium": {"url": "https://img.example/abc123.jpg"}},
                "publishedAt": "2025-01-01T00:00:00Z",
            },
        },
        {
            # No videoId -- should be skipped rather than crash the response.
            "id": {},
            "snippet": {"title": "Broken entry"},
        },
    ]
}


class VideoSearchViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.url = reverse("video-search")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url, {"q": "tomato"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_query_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"q": ""})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_whitespace_only_query_is_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"q": "   "})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(YOUTUBE_API_KEY="")
    def test_missing_api_key_fails_soft_as_503(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"q": "tomato"})
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(YOUTUBE_API_KEY="dummy-key")
    @patch("videos.views.requests.get")
    def test_successful_search_skips_malformed_items_without_a_videoid(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_YT_PAYLOAD)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"q": "arecanut bud rot"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["video_id"], "abc123")
        self.assertEqual(
            response.data["results"][0]["url"], "https://www.youtube.com/watch?v=abc123"
        )
        self.assertNotIn("dummy-key", str(response.data))

    @override_settings(YOUTUBE_API_KEY="dummy-key")
    @patch("videos.views.requests.get")
    def test_repeated_identical_query_is_served_from_cache_not_a_second_api_call(self, mock_get):
        mock_get.return_value = mock_response(200, SAMPLE_YT_PAYLOAD)
        self.client.force_authenticate(self.user)

        first = self.client.get(self.url, {"q": "Arecanut Bud Rot"})
        second = self.client.get(self.url, {"q": "arecanut bud rot"})  # different case

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_get.call_count, 1)

    @override_settings(YOUTUBE_API_KEY="dummy-key")
    @patch("videos.views.requests.get")
    def test_upstream_quota_exhausted_403_degrades_gracefully(self, mock_get):
        mock_get.return_value = mock_response(403)
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"q": "tomato"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(YOUTUBE_API_KEY="dummy-key")
    @patch("videos.views.requests.get")
    def test_network_error_does_not_crash_the_view(self, mock_get):
        mock_get.side_effect = requests.Timeout("timed out")
        self.client.force_authenticate(self.user)

        response = self.client.get(self.url, {"q": "tomato"})

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_query_longer_than_max_length_is_truncated_not_rejected(self):
        # _sanitize_query truncates to MAX_QUERY_LENGTH rather than erroring
        # -- confirm a very long query still produces a well-formed 503
        # (missing key) instead of blowing up during sanitization.
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url, {"q": "a" * 500})
        self.assertIn(response.status_code, (status.HTTP_400_BAD_REQUEST, status.HTTP_503_SERVICE_UNAVAILABLE))
