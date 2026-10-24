"""
Farming Diary tests: diary_today() IST-date helper, the FarmingDiaryEntry model/API, optional CNN photo diagnosis on diary entries, and the Gemini-backed AI analysis module + its view wiring (section 4.27).

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
import io
import tempfile
from datetime import date, datetime, timezone as dt_timezone
from unittest.mock import Mock, patch
import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase
from .diary_ai import generate_diary_analysis
from .serializers import diary_today
from .models import Crop, FarmerCropTracker, FarmingDiaryEntry

User = get_user_model()

# Task 3 -- own tempdir, same pattern as scans/tests.py's TEST_MEDIA_ROOT, so
# diary photo uploads in this file's tests don't write into the real
# backend/media/ during a test run.
TEST_MEDIA_ROOT = tempfile.mkdtemp()


def make_test_image(fmt="JPEG"):
    # Deliberately duplicated from scans/tests.py's helper of the same name
    # rather than imported across app test modules -- see the Farming Diary
    # task brief's own ruling on this.
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color="green").save(buf, format=fmt)
    buf.seek(0)
    content_type = "image/jpeg" if fmt == "JPEG" else "image/png"
    return SimpleUploadedFile(f"upload.{fmt.lower()}", buf.read(), content_type=content_type)


class DiaryTodayTests(TestCase):
    """
    The diary's day boundary is IST midnight, not UTC midnight -- tested
    with explicit UTC instants rather than by freezing global time.
    """

    def test_utc_evening_after_1830_is_already_the_next_day_in_ist(self):
        self.assertEqual(
            diary_today(datetime(2026, 10, 19, 20, 0, tzinfo=dt_timezone.utc)), date(2026, 10, 20)
        )

    def test_utc_evening_before_1830_is_still_the_same_day_in_ist(self):
        self.assertEqual(
            diary_today(datetime(2026, 10, 19, 18, 29, tzinfo=dt_timezone.utc)), date(2026, 10, 19)
        )

    def test_ist_midnight_is_the_exact_boundary(self):
        self.assertEqual(
            diary_today(datetime(2026, 10, 19, 18, 30, tzinfo=dt_timezone.utc)), date(2026, 10, 20)
        )




class FarmingDiaryEntryModelTests(TestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)

    def test_one_entry_per_tracker_per_day_is_enforced(self):
        FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19), note="a")
        with self.assertRaises(IntegrityError):
            FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19), note="b")

    def test_entries_order_most_recent_first(self):
        older = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 10))
        newer = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19))
        self.assertEqual(list(self.tracker.diary_entries.all()), [newer, older])

    def test_ai_analysis_status_defaults_to_unavailable(self):
        entry = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19))
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.UNAVAILABLE)


# GEMINI_API_KEY is blanked for the whole class (same override_settings
# convention weather/videos tests use for their API keys) so that adding a
# real key to .env can never turn these POSTs into live Gemini calls.
@override_settings(GEMINI_API_KEY="")


@override_settings(GEMINI_API_KEY="")
class FarmingDiaryEntryAPITests(APITestCase):
    """
    Task 2 -- create/list/detail API for FarmingDiaryEntry, text/activity
    fields only (no photo upload or AI analysis wiring yet -- that's Tasks
    3/4). Covers: create-for-own-tracker, the idempotent-per-day
    resubmit-updates behavior, cross-farmer ownership enforcement (403, not
    404/500), list scoping, and the "must have some content" + note-length
    validation rules.
    """

    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.other_farmer = User.objects.create_user(username="farmer2", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.other_tracker = FarmerCropTracker.objects.create(farmer=self.other_farmer, crop=self.crop)
        self.client.force_authenticate(user=self.farmer)

    def test_create_entry_for_own_tracker(self):
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "did_irrigation": True, "note": "Watered today."},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        # The diary's "today" is the IST date (diary_today), not UTC's.
        self.assertEqual(FarmingDiaryEntry.objects.get().entry_date, diary_today())

    def test_resubmitting_same_day_updates_instead_of_duplicating(self):
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "first"})
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "second"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)  # see FarmingDiaryEntrySerializer.create's comment
        self.assertEqual(FarmingDiaryEntry.objects.filter(tracker=self.tracker).count(), 1)
        self.assertEqual(FarmingDiaryEntry.objects.get().note, "second")

    def test_resubmitting_same_day_without_resending_a_flag_keeps_it_set(self):
        # Regression test: a same-day resubmit that only sends `note` (no
        # did_irrigation key at all) must NOT silently clear an activity
        # flag logged earlier the same day -- see
        # FarmingDiaryEntrySerializer.create's partial-merge comment.
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "did_irrigation": True})
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "evening note"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        entry = FarmingDiaryEntry.objects.get()
        self.assertTrue(entry.did_irrigation)
        self.assertEqual(entry.note, "evening note")

    def test_cannot_create_entry_for_another_farmers_tracker(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.other_tracker.id, "note": "x"})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(FarmingDiaryEntry.objects.count(), 0)

    def test_list_only_returns_the_requesting_farmers_entries(self):
        FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=diary_today(), note="mine")
        FarmingDiaryEntry.objects.create(tracker=self.other_tracker, entry_date=diary_today(), note="not mine")
        resp = self.client.get(f"/api/crops/diary/?tracker={self.tracker.id}")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["note"], "mine")

    def test_cannot_list_another_farmers_tracker_entries(self):
        resp = self.client.get(f"/api/crops/diary/?tracker={self.other_tracker.id}")
        self.assertIn(resp.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_empty_entry_is_rejected(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(FarmingDiaryEntry.objects.count(), 0)

    def test_note_over_2000_characters_is_rejected(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "x" * 2001})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_entry_logged_just_after_ist_midnight_does_not_overwrite_yesterday(self):
        # 2026-10-19 20:00 UTC is 2026-10-20 01:30 IST: still "yesterday" in
        # UTC, but a new day for a farmer in India. The real diary_today()
        # conversion runs here on that explicit UTC instant (rather than
        # freezing global time) and must start a fresh 2026-10-20 entry.
        utc_instant = datetime(2026, 10, 19, 20, 0, tzinfo=dt_timezone.utc)
        yesterday = FarmingDiaryEntry.objects.create(
            tracker=self.tracker, entry_date=date(2026, 10, 19), note="yesterday's real entry"
        )
        with patch("crops.serializers.diary_today", side_effect=lambda: diary_today(utc_instant)):
            resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "early morning"})

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(FarmingDiaryEntry.objects.filter(tracker=self.tracker).count(), 2)
        yesterday.refresh_from_db()
        self.assertEqual(yesterday.note, "yesterday's real entry")
        self.assertEqual(
            FarmingDiaryEntry.objects.get(entry_date=date(2026, 10, 20)).note, "early morning"
        )

    @patch("crops.views.generate_diary_analysis")
    def test_recent_entries_passed_to_ai_are_the_5_most_recent_oldest_to_newest(self, mock_generate):
        # Regression test for a bug caught in review: `diary_entries`
        # inherits FarmingDiaryEntry.Meta.ordering ("-entry_date", newest
        # first), so naively slicing `[:5]` and handing that straight to
        # generate_diary_analysis would pass the 5 most recent entries in
        # newest-to-first order -- while diary_ai._build_prompt's prompt
        # literally claims "oldest to newest". Six past entries are
        # created (so the oldest of them must be excluded from the
        # selected 5), and the mock's actual call args are inspected to
        # confirm both: the right 5 entries are selected (the most
        # recent), and they're ordered oldest-to-newest.
        mock_generate.return_value = None
        dates = [date(2026, 10, day) for day in range(10, 16)]  # 6 past entries
        for d in dates:
            FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=d, note=d.isoformat())

        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "today"})

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_generate.assert_called_once()
        _entry_arg, recent_entries_arg = mock_generate.call_args[0]
        self.assertEqual([e.entry_date for e in recent_entries_arg], sorted(dates)[-5:])


# GEMINI_API_KEY blanked for the same reason as FarmingDiaryEntryAPITests.
@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, GEMINI_API_KEY="")


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, GEMINI_API_KEY="")
class FarmingDiaryPhotoDiagnosisTests(APITestCase):
    """
    Task 3 -- photo upload -> CNN diagnosis integration on top of Task 2's
    create/update path. `scans.ml_model.predict`/`disease_lookup` are
    mocked throughout, same as scans/tests.py's own ScanUploadTests -- this
    suite is about the diary's upload-validation and wiring, not re-testing
    the CNN itself.
    """

    def setUp(self):
        # Same setUp as FarmingDiaryEntryAPITests.
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.other_farmer = User.objects.create_user(username="farmer2", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.other_tracker = FarmerCropTracker.objects.create(farmer=self.other_farmer, crop=self.crop)
        self.client.force_authenticate(user=self.farmer)

    @patch("scans.ml_model.predict", return_value=("Rice___Blast", 0.91))
    @patch("scans.ml_model.disease_lookup")
    def test_photo_upload_populates_diagnosis_fields(self, mock_lookup, mock_predict):
        mock_lookup.return_value = Mock(name="Blast")
        photo = make_test_image("JPEG")
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "spots", "photo": photo},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.photo_diagnosis_label, "Rice___Blast")
        self.assertAlmostEqual(entry.photo_diagnosis_confidence, 0.91)

    def test_no_photo_leaves_diagnosis_fields_blank(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "no photo today"})
        self.assertEqual(resp.status_code, 201)
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.photo_diagnosis_label, "")
        self.assertIsNone(entry.photo_diagnosis_confidence)

    @patch("scans.ml_model.predict", return_value=(None, None))
    def test_photo_upload_with_prediction_unavailable_still_saves_the_entry(self, mock_predict):
        photo = make_test_image("JPEG")
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "x", "photo": photo},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FarmingDiaryEntry.objects.get().photo_diagnosis_label, "")

    def test_non_image_file_is_rejected(self):
        bad_file = SimpleUploadedFile("not-a-photo.txt", b"hello", content_type="text/plain")
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "x", "photo": bad_file},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    @patch("scans.ml_model.predict", return_value=("Rice___Blast", 0.91))
    def test_same_day_update_without_a_new_photo_keeps_the_stored_diagnosis(self, mock_predict):
        # Integration check with Task 2's partial-merge create(): a
        # same-day resubmit that does NOT resend `photo` must leave the
        # previously-stored photo and its diagnosis fields untouched --
        # the same "omitted means preserved" behavior Task 2 established
        # for the did_* boolean fields, not a photo-specific special case.
        photo = make_test_image("JPEG")
        self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "morning", "photo": photo},
            format="multipart",
        )
        self.assertEqual(mock_predict.call_count, 1)
        entry = FarmingDiaryEntry.objects.get()
        stored_photo_name = entry.photo.name
        self.assertEqual(entry.photo_diagnosis_label, "Rice___Blast")

        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "evening note"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_predict.call_count, 1)  # not re-run -- no new photo was sent
        entry.refresh_from_db()
        self.assertEqual(entry.photo.name, stored_photo_name)
        self.assertEqual(entry.photo_diagnosis_label, "Rice___Blast")
        self.assertAlmostEqual(entry.photo_diagnosis_confidence, 0.91)
        self.assertEqual(entry.note, "evening note")

    @patch("scans.ml_model.predict")
    def test_same_day_update_with_a_new_photo_re_runs_diagnosis(self, mock_predict):
        # The other half of the same integration risk: when a photo IS
        # resent on a same-day update, diagnosis must re-run against the
        # NEW photo, replacing the old stored diagnosis.
        mock_predict.return_value = ("Rice___Blast", 0.91)
        first_photo = make_test_image("JPEG")
        self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "morning", "photo": first_photo},
            format="multipart",
        )

        mock_predict.return_value = ("Rice___Brown_Spot", 0.42)
        second_photo = make_test_image("PNG")
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "evening", "photo": second_photo},
            format="multipart",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_predict.call_count, 2)
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.photo_diagnosis_label, "Rice___Brown_Spot")
        self.assertAlmostEqual(entry.photo_diagnosis_confidence, 0.42)

    @patch("scans.ml_model.predict")
    def test_empty_multipart_photo_on_create_is_treated_as_no_photo(self, mock_predict):
        # DRF turns an empty multipart `photo=""` into None; validate_photo
        # must accept that rather than calling None.size (a 500).
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "no photo", "photo": ""},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_predict.assert_not_called()
        entry = FarmingDiaryEntry.objects.get()
        self.assertFalse(entry.photo)
        self.assertEqual(entry.photo_diagnosis_label, "")
        self.assertIsNone(entry.photo_diagnosis_confidence)

    @patch("scans.ml_model.predict")
    def test_null_json_photo_on_create_is_treated_as_no_photo(self, mock_predict):
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "no photo", "photo": None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_predict.assert_not_called()
        self.assertFalse(FarmingDiaryEntry.objects.get().photo)

    def test_empty_photo_alone_is_still_rejected_as_an_empty_entry(self):
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "photo": ""},
            format="multipart",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(FarmingDiaryEntry.objects.count(), 0)

    @patch("scans.ml_model.predict", return_value=("Rice___Blast", 0.91))
    def test_same_day_update_that_clears_the_photo_clears_its_diagnosis(self, mock_predict):
        # Explicitly sending an empty photo on a same-day update removes the
        # photo, so its diagnosis must be cleared too -- not re-run against
        # a photo that no longer exists (which would raise on .path).
        self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "morning", "photo": make_test_image("JPEG")},
            format="multipart",
        )
        self.assertEqual(FarmingDiaryEntry.objects.get().photo_diagnosis_label, "Rice___Blast")

        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "evening", "photo": ""},
            format="multipart",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_predict.call_count, 1)  # not re-run -- there's no photo to diagnose
        entry = FarmingDiaryEntry.objects.get()
        self.assertFalse(entry.photo)
        self.assertEqual(entry.photo_diagnosis_label, "")
        self.assertIsNone(entry.photo_diagnosis_confidence)
        self.assertEqual(entry.note, "evening")

    @patch("scans.ml_model.predict", return_value=("Rice___Blast", 0.91))
    def test_same_day_update_with_null_json_photo_clears_its_diagnosis(self, mock_predict):
        self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "morning", "photo": make_test_image("JPEG")},
            format="multipart",
        )
        resp = self.client.post(
            "/api/crops/diary/",
            {"tracker": self.tracker.id, "note": "evening", "photo": None},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        entry = FarmingDiaryEntry.objects.get()
        self.assertFalse(entry.photo)
        self.assertEqual(entry.photo_diagnosis_label, "")
        self.assertIsNone(entry.photo_diagnosis_confidence)




class DiaryAiTests(TestCase):
    """
    Task 4 -- the pure, mockable `generate_diary_analysis` function itself.
    No Django ORM mocking needed (unlike the view-wiring tests below):
    `requests.post` is the only external boundary this function has.
    """

    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="f1", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.entry = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date.today(), note="leaves look yellow")

    @override_settings(GEMINI_API_KEY="")
    def test_blank_api_key_returns_none(self):
        self.assertIsNone(generate_diary_analysis(self.entry, []))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_successful_call_returns_the_response_text(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "Consider checking for nitrogen deficiency."}]}}]
        })
        result = generate_diary_analysis(self.entry, [])
        self.assertEqual(result, "Consider checking for nitrogen deficiency.")

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post", side_effect=requests.Timeout)
    def test_timeout_returns_none(self, mock_post):
        with self.assertLogs("crops.diary_ai", level="WARNING") as logs:
            self.assertIsNone(generate_diary_analysis(self.entry, []))
        # Logged with enough to diagnose (the exception type), never the key.
        self.assertIn("Timeout", logs.output[0])
        self.assertNotIn("fake-key", "\n".join(logs.output))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_non_200_response_returns_none(self, mock_post):
        mock_post.return_value = Mock(status_code=500)
        with self.assertLogs("crops.diary_ai", level="WARNING") as logs:
            self.assertIsNone(generate_diary_analysis(self.entry, []))
        self.assertIn("500", logs.output[0])
        self.assertNotIn("fake-key", "\n".join(logs.output))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_retired_model_404_is_logged_with_the_model_name(self, mock_post):
        # The failure mode that motivated GEMINI_MODEL: a retired model name
        # 404s. It must still fail soft, but leave a diagnostic trail.
        mock_post.return_value = Mock(status_code=404)
        with override_settings(GEMINI_MODEL="gemini-1.5-flash"), \
                self.assertLogs("crops.diary_ai", level="WARNING") as logs:
            self.assertIsNone(generate_diary_analysis(self.entry, []))
        self.assertIn("404", logs.output[0])
        self.assertIn("gemini-1.5-flash", logs.output[0])

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_malformed_response_returns_none_and_logs(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {"candidates": []})
        with self.assertLogs("crops.diary_ai", level="WARNING"):
            self.assertIsNone(generate_diary_analysis(self.entry, []))

    @override_settings(GEMINI_API_KEY="fake-key", GEMINI_MODEL="gemini-2.5-flash")
    @patch("crops.diary_ai.requests.post")
    def test_request_uses_configured_model_and_sends_key_in_header_not_url(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        })
        generate_diary_analysis(self.entry, [])
        args, kwargs = mock_post.call_args
        url = args[0]
        self.assertIn("/models/gemini-2.5-flash:generateContent", url)
        self.assertNotIn("fake-key", url)
        self.assertNotIn("params", kwargs)
        self.assertEqual(kwargs["headers"], {"x-goog-api-key": "fake-key"})
        self.assertEqual(kwargs["timeout"], 5)
        # 2.5 Flash thinks by default; thinking is disabled to fit the timeout.
        self.assertEqual(
            kwargs["json"]["generationConfig"], {"thinkingConfig": {"thinkingBudget": 0}}
        )

    @override_settings(GEMINI_API_KEY="fake-key", GEMINI_MODEL="gemini-2.0-flash")
    @patch("crops.diary_ai.requests.post")
    def test_thinking_config_omitted_for_models_that_do_not_accept_it(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        })
        generate_diary_analysis(self.entry, [])
        args, kwargs = mock_post.call_args
        self.assertIn("/models/gemini-2.0-flash:generateContent", args[0])
        self.assertNotIn("generationConfig", kwargs["json"])

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_first_ever_entry_with_no_history_still_builds_a_valid_prompt(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "Looks fine so far."}]}}]
        })
        result = generate_diary_analysis(self.entry, [])  # empty history list
        self.assertEqual(result, "Looks fine so far.")
        mock_post.assert_called_once()


@override_settings(GEMINI_API_KEY="")


@override_settings(GEMINI_API_KEY="")
class FarmingDiaryAiViewWiringTests(APITestCase):
    """
    End-to-end wiring between the diary POST view and Task 4's
    generate_diary_analysis: DiaryAiTests above only covers the pure
    function, so these prove the view actually calls it and persists the
    result. `crops.views.generate_diary_analysis` is patched in every test
    (and the key is blanked as a second guard), so nothing here can reach
    the real Gemini API.
    """

    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.client.force_authenticate(user=self.farmer)

    @patch("crops.views.generate_diary_analysis", return_value="Leaves look healthy; keep watering.")
    def test_successful_analysis_is_saved_with_ok_status(self, mock_generate):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "watered"})

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_generate.assert_called_once()
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.OK)
        self.assertEqual(entry.ai_analysis, "Leaves look healthy; keep watering.")
        self.assertEqual(resp.data["ai_analysis_status"], "ok")
        self.assertEqual(resp.data["ai_analysis"], "Leaves look healthy; keep watering.")

    @patch("crops.views.generate_diary_analysis", return_value=None)
    def test_failed_analysis_still_saves_entry_with_unavailable_status(self, mock_generate):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "watered"})

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        mock_generate.assert_called_once()
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.note, "watered")
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.UNAVAILABLE)
        self.assertEqual(entry.ai_analysis, "")
        self.assertEqual(resp.data["ai_analysis_status"], "unavailable")

    @patch("crops.views.generate_diary_analysis")
    def test_same_day_update_re_runs_analysis_and_replaces_the_old_one(self, mock_generate):
        mock_generate.return_value = "Morning analysis."
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "morning"})

        mock_generate.return_value = "Evening analysis."
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "evening"})

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_generate.call_count, 2)  # re-run on the update, not skipped
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.ai_analysis, "Evening analysis.")
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.OK)
        # The second call analysed the updated entry itself.
        updated_entry_arg, _recent = mock_generate.call_args[0]
        self.assertEqual(updated_entry_arg.note, "evening")

    @patch("crops.views.generate_diary_analysis")
    def test_same_day_update_that_fails_clears_the_earlier_analysis(self, mock_generate):
        # A stale morning analysis must not be shown against the evening's
        # updated entry once the re-run fails.
        mock_generate.return_value = "Morning analysis."
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "morning"})

        mock_generate.return_value = None
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "evening"})

        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.ai_analysis, "")
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.UNAVAILABLE)
