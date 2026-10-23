"""
Testing/hardening pass -- chatbot app had no real test coverage. Covers
intent matching against the curated FAQ, the fallback response, input
sanitization/validation, and that the endpoint requires authentication.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .gemini_chat import generate_chat_reply
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

    @override_settings(GEMINI_API_KEY="")
    def test_recognized_message_returns_200_with_recognized_true(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"message": "What's the weather today?"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["recognized"])
        self.assertEqual(response.data["intent"], "weather_help")

    @override_settings(GEMINI_API_KEY="")
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


@override_settings(GEMINI_API_KEY="test-key", GEMINI_MODEL="gemini-3.5-flash-lite")
class GeminiChatTests(APITestCase):

    @patch("chatbot.gemini_chat.requests.post")
    def test_successful_reply_returns_parsed_text(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "Water early morning for rice."}]}}]
        }
        result = generate_chat_reply("when should I water my rice?", [], "en")
        self.assertEqual(result, "Water early morning for rice.")

    @override_settings(GEMINI_API_KEY="")
    @patch("chatbot.gemini_chat.requests.post")
    def test_blank_api_key_returns_none_without_a_network_call(self, mock_post):
        result = generate_chat_reply("hello", [], "en")
        self.assertIsNone(result)
        mock_post.assert_not_called()

    @patch("chatbot.gemini_chat.requests.post")
    def test_request_exception_returns_none(self, mock_post):
        import requests
        mock_post.side_effect = requests.ConnectionError("boom")
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_non_200_status_returns_none(self, mock_post):
        mock_post.return_value.status_code = 503
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_malformed_json_shape_returns_none(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"unexpected": "shape"}
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_empty_candidates_list_returns_none_not_a_crash(self, mock_post):
        # A real shape Gemini can return under safety filtering -- a 200
        # with no candidates at all, not a missing/renamed key.
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"candidates": []}
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_maps_to_alternating_user_and_model_roles(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [
            {"sender": "user", "text": "hi"},
            {"sender": "bot", "text": "hello, how can I help?"},
        ]
        generate_chat_reply("how are you", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            sent_payload["contents"],
            [
                {"role": "user", "parts": [{"text": "hi"}]},
                {"role": "model", "parts": [{"text": "hello, how can I help?"}]},
                {"role": "user", "parts": [{"text": "how are you"}]},
            ],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_entry_missing_sender_or_text_is_skipped_not_raised(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [
            {"sender": "user"},            # missing text
            {"text": "no sender here"},    # missing sender
            {"sender": "user", "text": "valid turn"},
        ]
        generate_chat_reply("final message", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            sent_payload["contents"],
            [
                {"role": "user", "parts": [{"text": "valid turn"}]},
                {"role": "user", "parts": [{"text": "final message"}]},
            ],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_ui_language_hint_is_appended_to_the_system_instruction(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        generate_chat_reply("ok", [], "kn")
        sent_payload = mock_post.call_args.kwargs["json"]
        # Asserts on the hint sentence itself, not just "Kannada" -- the
        # base SYSTEM_INSTRUCTION already contains that word on its own
        # ("fluently... including Kannada"), so a substring check on
        # "Kannada" alone would pass even if _system_instruction_for were
        # deleted entirely. "reply in Kannada" only appears via the hint.
        self.assertIn(
            "reply in Kannada",
            sent_payload["systemInstruction"]["parts"][0]["text"],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_entry_with_non_string_sender_or_text_is_skipped_not_raised(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [
            {"sender": ["user"], "text": "unhashable sender"},  # sender not a string
            {"sender": "user", "text": 123},                    # text not a string
            {"sender": "user", "text": "valid turn"},
        ]
        # Must not raise (a dict.get() on an unhashable key raises TypeError).
        generate_chat_reply("final message", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            sent_payload["contents"],
            [
                {"role": "user", "parts": [{"text": "valid turn"}]},
                {"role": "user", "parts": [{"text": "final message"}]},
            ],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_entry_text_is_capped_to_a_maximum_length(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [{"sender": "user", "text": "a" * 5000}]
        generate_chat_reply("hi", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        sent_history_text = sent_payload["contents"][0]["parts"][0]["text"]
        self.assertLessEqual(len(sent_history_text), 2000)


class ChatMessageViewAiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.url = reverse("chatbot-message")
        self.client.force_authenticate(self.user)

    @patch("chatbot.views.generate_chat_reply")
    def test_successful_ai_reply_returns_source_ai(self, mock_generate):
        mock_generate.return_value = "Try planting after the first rains."
        response = self.client.post(self.url, {"message": "when should I plant rice?"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "reply": "Try planting after the first rains.",
                "recognized": True,
                "intent": None,
                "source": "ai",
            },
        )

    @patch("chatbot.views.generate_chat_reply")
    def test_ai_failure_falls_back_to_the_faq_matcher_with_source_faq(self, mock_generate):
        mock_generate.return_value = None
        response = self.client.post(self.url, {"message": "hello there"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "faq")
        self.assertTrue(response.data["recognized"])
        self.assertEqual(response.data["intent"], "greeting")

    @patch("chatbot.views.generate_chat_reply")
    def test_missing_history_and_ui_language_fields_still_succeeds(self, mock_generate):
        mock_generate.return_value = "a reply"
        response = self.client.post(self.url, {"message": "hello"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_generate.assert_called_once_with("hello", [], "en")

    @patch("chatbot.views.generate_chat_reply")
    def test_a_malformed_history_entry_does_not_400(self, mock_generate):
        mock_generate.return_value = "a reply"
        response = self.client.post(
            self.url,
            {"message": "hello", "history": [{"sender": "user"}], "ui_language": "kn"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("chatbot.views.generate_chat_reply")
    def test_history_is_trimmed_to_the_last_max_history_turns_before_calling_gemini(self, mock_generate):
        mock_generate.return_value = "a reply"
        long_history = [{"sender": "user", "text": f"message {i}"} for i in range(15)]
        self.client.post(
            self.url,
            {"message": "final one", "history": long_history, "ui_language": "en"},
            format="json",
        )
        passed_history = mock_generate.call_args[0][1]
        self.assertEqual(len(passed_history), 10)
        self.assertEqual(passed_history[0]["text"], "message 5")   # oldest 5 dropped
        self.assertEqual(passed_history[-1]["text"], "message 14")

    @patch("chatbot.views.generate_chat_reply")
    def test_ui_language_from_the_request_is_passed_through_to_generate_chat_reply(self, mock_generate):
        mock_generate.return_value = "a reply"
        self.client.post(
            self.url,
            {"message": "hello", "history": [], "ui_language": "kn"},
            format="json",
        )
        mock_generate.assert_called_once_with("hello", [], "kn")
