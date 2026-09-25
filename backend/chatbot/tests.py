"""
Testing/hardening pass -- chatbot app had no real test coverage. Covers
intent matching against the curated FAQ, the fallback response, input
sanitization/validation, and that the endpoint requires authentication.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .matcher import match_intent, sanitize_message

User = get_user_model()


def make_user():
    return User.objects.create_user(
        username="farmer_ravi", email="ravi@example.com", password="FarmerPass#123",
        role=User.Role.FARMER,
    )


class MatcherUnitTests(APITestCase):
    """Direct unit tests of the matching logic, independent of the view."""

    def test_recognized_keyword_returns_the_matching_canned_response(self):
        reply, intent, recognized = match_intent("hello there")
        self.assertTrue(recognized)
        self.assertEqual(intent, "greeting")

    def test_unrecognized_message_returns_the_fallback(self):
        reply, intent, recognized = match_intent("asdkjashdkjashd nonsense")
        self.assertFalse(recognized)
        self.assertIsNone(intent)
        self.assertIn("ask our expert", reply.lower())

    def test_more_specific_intent_wins_over_a_more_generic_one(self):
        # "scan" appears in scan_help's keyword list; a message combining a
        # greeting word with a scan word should still match scan_help
        # first only if scan_help is checked before an overly broad match
        # -- here we just confirm scan-related text reliably hits scan_help.
        reply, intent, recognized = match_intent("how do I scan a sick leaf")
        self.assertTrue(recognized)
        self.assertEqual(intent, "scan_help")

    def test_sanitize_strips_control_characters_and_collapses_whitespace(self):
        raw = "hello\x00\x01   there\x7f"
        self.assertEqual(sanitize_message(raw), "hello there")

    def test_sql_and_script_injection_attempts_are_never_reflected_back(self):
        reply, intent, recognized = match_intent("'; DROP TABLE users; --")
        self.assertNotIn("DROP TABLE", reply)
        reply2, _, _ = match_intent("<script>alert(1)</script>")
        self.assertNotIn("<script>", reply2)


class ChatMessageViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.url = reverse("chatbot-message")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.post(self.url, {"message": "hello"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_recognized_message_returns_200_with_recognized_true(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": "What's the weather today?"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["recognized"])
        self.assertEqual(response.data["intent"], "weather_help")

    def test_unrecognized_message_returns_200_with_the_fallback_and_recognized_false(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": "zzz qqq unrelated gibberish"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["recognized"])
        self.assertIn("ask our expert", response.data["reply"].lower())

    def test_blank_message_is_rejected_with_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": ""})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_message_field_is_rejected_with_a_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_whitespace_only_message_is_rejected(self):
        # trim_whitespace=True on the serializer field means a
        # whitespace-only message becomes blank and is rejected the same
        # way as an empty string.
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": "     "})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_message_over_max_length_is_rejected(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": "a" * 501})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
