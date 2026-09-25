"""
Testing/hardening pass -- core app had no real test coverage. This covers
the /api/ping/ health-check endpoint used by Phase 1 connectivity checks.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class PingViewTests(APITestCase):
    def test_ping_is_publicly_accessible_and_confirms_the_backend_is_up(self):
        response = self.client.get(reverse("ping"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")

    def test_ping_does_not_require_authentication(self):
        # No force_authenticate call at all -- an anonymous client must
        # still get a 200, since this is the very first connectivity check
        # a fresh install relies on, before any user exists.
        response = self.client.get(reverse("ping"))
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)
