"""
Phase 20 — formal automated test suite for the crops app.

Covers the public, read-only crop/disease catalog (Phase 7 + Phase 11) and
the Phase 18 translated-field fallback behavior.
"""
import io
import tempfile
from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .diary_ai import generate_diary_analysis
from .serializers import diary_today
from .models import (
    Crop, CropStage, CropTask, Disease, DiseaseRiskRule, FarmerCropTracker, FarmingDiaryEntry, Recommendation,
)
from .risk_engine import evaluate_risk
from .stage_derivation import derive_stage_for_tracker

User = get_user_model()

# Task 3 -- own tempdir, same pattern as scans/tests.py's TEST_MEDIA_ROOT, so
# diary photo uploads in FarmingDiaryPhotoDiagnosisTests below don't write
# into the real backend/media/ during a test run.
TEST_MEDIA_ROOT = tempfile.mkdtemp()


def make_test_image(fmt="JPEG"):
    # Deliberately duplicated from scans/tests.py's helper of the same name
    # rather than imported across app test modules -- see the task brief.
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color="green").save(buf, format=fmt)
    buf.seek(0)
    content_type = "image/jpeg" if fmt == "JPEG" else "image/png"
    return SimpleUploadedFile(f"upload.{fmt.lower()}", buf.read(), content_type=content_type)


class CropListTests(APITestCase):
    def setUp(self):
        self.arecanut = Crop.objects.create(
            name="Arecanut", soil_type="Laterite", climate="Humid",
            name_kn="ಅಡಿಕೆ", name_hi="",  # deliberately blank Hindi, to test fallback
        )
        self.pepper = Crop.objects.create(name="Black Pepper", soil_type="Laterite", climate="Humid")
        self.url = reverse("crop-list")

    def test_list_is_public_no_auth_required(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_search_filters_by_name(self):
        response = self.client.get(self.url, {"search": "areca"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in response.data]
        self.assertEqual(names, ["Arecanut"])

    def test_translated_fields_present_and_blank_when_untranslated(self):
        response = self.client.get(self.url)
        arecanut_data = next(c for c in response.data if c["name"] == "Arecanut")
        self.assertEqual(arecanut_data["name_kn"], "ಅಡಿಕೆ")
        self.assertEqual(arecanut_data["name_hi"], "")  # blank, not missing -- frontend does the fallback


class CropDetailTests(APITestCase):
    def setUp(self):
        self.arecanut = Crop.objects.create(name="Arecanut", soil_type="Laterite", climate="Humid")
        self.pepper = Crop.objects.create(name="Black Pepper", soil_type="Laterite", climate="Humid")
        self.arecanut.intercropped_with.add(self.pepper)
        self.disease = Disease.objects.create(
            crop=self.arecanut, name="Yellow Leaf Disease",
            symptoms="Yellowing fronds", description="A common viral disease.", prevention="Remove infected palms.",
        )

    def test_detail_is_public_no_auth_required(self):
        response = self.client.get(reverse("crop-detail", args=[self.arecanut.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Arecanut")

    def test_intercropped_with_relationship_is_symmetrical(self):
        # Adding Pepper to Arecanut's list should make Arecanut show up in
        # Pepper's list too (ManyToMany to self, added from one side).
        response = self.client.get(reverse("crop-detail", args=[self.pepper.id]))
        companion_names = [c["name"] for c in response.data["intercropped_with"]]
        self.assertIn("Arecanut", companion_names)

    def test_unknown_crop_id_is_a_404(self):
        response = self.client.get(reverse("crop-detail", args=[999999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_includes_trackable_stages(self):
        # Task 6 — the frontend's "Track this crop" UI builds its form from
        # this field, already present on the crop detail response it fetches.
        stage = CropStage.objects.create(crop=self.arecanut, name="Flowering", order=1)
        response = self.client.get(reverse("crop-detail", args=[self.arecanut.id]))
        self.assertEqual(len(response.data["trackable_stages"]), 1)
        self.assertEqual(response.data["trackable_stages"][0]["id"], stage.id)
        self.assertEqual(response.data["trackable_stages"][0]["name"], "Flowering")


class DiseaseDetailTests(APITestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.disease = Disease.objects.create(
            crop=self.crop, name="Blast", symptoms="Lesions", description="Fungal.", prevention="Resistant varieties.",
        )
        Recommendation.objects.create(
            disease=self.disease, treatment_info="Apply fungicide.", preventive_measures="Crop rotation.",
        )

    def test_disease_detail_is_public_and_includes_recommendation(self):
        response = self.client.get(reverse("disease-detail", args=[self.disease.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Blast")
        self.assertIn("recommendation", response.data)
        self.assertEqual(response.data["recommendation"]["treatment_info"], "Apply fungicide.")


class CropStageModelTests(TestCase):
    def test_ordering_is_by_crop_then_order(self):
        rice = Crop.objects.create(name="Rice")
        CropStage.objects.create(crop=rice, name="Harvest", order=2)
        CropStage.objects.create(crop=rice, name="Germination", order=1)
        names = list(CropStage.objects.filter(crop=rice).values_list("name", flat=True))
        self.assertEqual(names, ["Germination", "Harvest"])

    def test_day_range_and_month_range_fields_are_optional(self):
        rice = Crop.objects.create(name="Rice")
        stage = CropStage.objects.create(crop=rice, name="Flowering", day_range_start=45, day_range_end=65, order=1)
        self.assertEqual((stage.day_range_start, stage.day_range_end), (45, 65))
        self.assertIsNone(stage.typical_month_start)


class CropStageSeedContentTests(TestCase):
    def setUp(self):
        call_command("seed_demo_data")

    def test_every_crop_has_ordered_stages_covering_the_year_or_a_full_cycle(self):
        for crop in Crop.objects.all():
            stages = list(CropStage.objects.filter(crop=crop).order_by("order"))
            self.assertGreater(len(stages), 0, f"{crop.name} has no CropStage rows")
            self.assertEqual([s.order for s in stages], sorted(s.order for s in stages))

    def test_rice_stages_are_day_based_and_match_existing_lifecycle_values(self):
        rice = Crop.objects.get(name="Rice")
        flowering = CropStage.objects.get(crop=rice, name__icontains="Flowering")
        self.assertEqual((flowering.day_range_start, flowering.day_range_end), (45, 65))

    def test_perennial_crop_stages_are_month_based_not_day_based(self):
        arecanut = Crop.objects.get(name="Arecanut")
        for stage in CropStage.objects.filter(crop=arecanut):
            self.assertIsNone(stage.day_range_start)
            self.assertIsNotNone(stage.typical_month_start)
            self.assertIsNotNone(stage.typical_month_end)


class FarmerCropTrackerModelTests(TestCase):
    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="tracker_farmer", password="x")

    def test_tracker_can_be_created_with_planting_date(self):
        tracker = FarmerCropTracker.objects.create(
            farmer=self.farmer, crop=self.rice, planting_date=date.today()
        )
        self.assertTrue(tracker.is_active)
        self.assertIsNone(tracker.current_stage)

    def test_tracker_can_be_created_without_planting_date(self):
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        self.assertIsNone(tracker.planting_date)

    def test_farmer_and_crop_combination_is_unique(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        with self.assertRaises(Exception):
            FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)

    def test_current_stage_set_null_on_stage_delete(self):
        stage = CropStage.objects.create(crop=self.rice, name="Germination", day_range_start=0, day_range_end=10, order=1)
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=stage)
        stage.delete()
        tracker.refresh_from_db()
        self.assertIsNone(tracker.current_stage)


class StageDerivationTests(TestCase):
    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.germ = CropStage.objects.create(crop=self.rice, name="Germination", day_range_start=0, day_range_end=10, order=1)
        self.flower = CropStage.objects.create(crop=self.rice, name="Flowering", day_range_start=45, day_range_end=65, order=2)
        self.arecanut = Crop.objects.create(name="Arecanut")
        self.flowering_season = CropStage.objects.create(crop=self.arecanut, name="Flowering", typical_month_start=3, typical_month_end=5, order=1)
        self.harvest_season = CropStage.objects.create(crop=self.arecanut, name="Harvest", typical_month_start=11, typical_month_end=2, order=2)

    def test_day_based_stage_derives_from_planting_date(self):
        farmer = User.objects.create_user(username="f1", password="x")
        tracker = FarmerCropTracker.objects.create(
            farmer=farmer, crop=self.rice, planting_date=date.today() - timedelta(days=50)
        )
        self.assertEqual(derive_stage_for_tracker(tracker), self.flower)

    def test_day_based_stage_is_none_without_planting_date(self):
        farmer = User.objects.create_user(username="f2", password="x")
        tracker = FarmerCropTracker.objects.create(farmer=farmer, crop=self.rice, planting_date=None)
        self.assertIsNone(derive_stage_for_tracker(tracker))

    def test_month_based_stage_handles_year_wraparound(self):
        farmer = User.objects.create_user(username="f3", password="x")
        tracker = FarmerCropTracker.objects.create(farmer=farmer, crop=self.arecanut)
        with patch("crops.stage_derivation.date") as mock_date:
            mock_date.today.return_value = date(2026, 12, 15)
            self.assertEqual(derive_stage_for_tracker(tracker), self.harvest_season)

    def test_future_planting_date_returns_first_stage_not_last(self):
        # A planting_date in the future means the crop hasn't started its
        # lifecycle yet -- it should report the earliest stage (Germination),
        # not fall through to the "past every range" fallback (Flowering).
        farmer = User.objects.create_user(username="f4", password="x")
        tracker = FarmerCropTracker.objects.create(
            farmer=farmer, crop=self.rice, planting_date=date.today() + timedelta(days=5)
        )
        self.assertEqual(derive_stage_for_tracker(tracker), self.germ)

    def test_day_based_fallback_only_returns_day_based_stage_when_stages_mixed(self):
        # A crop with inconsistent CropStage rows (one day-based, one
        # month-based) must never hand back the month-based row from the
        # day-based lookup/fallback just because it sorts last by `order`.
        mixed = Crop.objects.create(name="MixedCrop")
        day_stage = CropStage.objects.create(
            crop=mixed, name="DaySeedling", day_range_start=0, day_range_end=10, order=1
        )
        month_stage = CropStage.objects.create(
            crop=mixed, name="MonthHarvest", typical_month_start=1, typical_month_end=3, order=2
        )
        farmer = User.objects.create_user(username="f5", password="x")

        # Within the day-based range -> returns the day-based stage.
        tracker_in_range = FarmerCropTracker.objects.create(
            farmer=farmer, crop=mixed, planting_date=date.today() - timedelta(days=5)
        )
        self.assertEqual(derive_stage_for_tracker(tracker_in_range), day_stage)

        # Past the day-based range -> falls back to the day-based stage,
        # never the month-based one.
        farmer2 = User.objects.create_user(username="f6", password="x")
        tracker_past_range = FarmerCropTracker.objects.create(
            farmer=farmer2, crop=mixed, planting_date=date.today() - timedelta(days=500)
        )
        self.assertEqual(derive_stage_for_tracker(tracker_past_range), day_stage)
        self.assertNotEqual(derive_stage_for_tracker(tracker_past_range), month_stage)


class StageDerivationRiceGapRegressionTests(TestCase):
    """
    Regression tests for the Critical whole-branch-review finding: the
    seeded Rice day-ranges (Germination 5-10, Vegetative/Tillering 20-45,
    Flowering/Panicle 45-65, Harvest 100-140) have GAPS between them (e.g.
    days 0-4, 11-19, 66-99 fall in none of the authored ranges). The old
    "no range matched" fallback always returned day_based_stages[-1]
    (Harvest) for ANY unmatched day, including day 0 -- the day of
    planting. Deliberately uses the actual seeded Rice CropStage data (via
    seed_demo_data) rather than a synthetic gap-free fixture, since a
    gap-free fixture is exactly what let this bug through undetected
    before.
    """

    def setUp(self):
        call_command("seed_demo_data")
        self.rice = Crop.objects.get(name="Rice")
        self.germination = CropStage.objects.get(crop=self.rice, name="Germination")
        self.harvest = CropStage.objects.get(crop=self.rice, name="Harvest")
        self.farmer = User.objects.create_user(username="rice_gap_farmer", password="x")

    def _tracker_planted_days_ago(self, days):
        return FarmerCropTracker.objects.create(
            farmer=self.farmer, crop=self.rice,
            planting_date=date.today() - timedelta(days=days),
        )

    def test_day_in_gap_between_two_stages_returns_the_preceding_stage(self):
        # Day 15 falls in the gap between Germination (5-10) and
        # Vegetative growth / Tillering (20-45) -- the crop is still
        # progressing through Germination at that point, not freshly
        # harvested, so this must return Germination, not Harvest.
        tracker = self._tracker_planted_days_ago(15)
        self.assertEqual(derive_stage_for_tracker(tracker), self.germination)

    def test_day_zero_before_the_first_stages_own_start_returns_first_stage(self):
        # Day 0 (planting day) is before Germination's own day_range_start
        # of 5 -- a gap before the very first range. Must return the first
        # stage (Germination), the same as the existing "planting date in
        # the future" branch already does for consistency, not Harvest.
        tracker = self._tracker_planted_days_ago(0)
        self.assertEqual(derive_stage_for_tracker(tracker), self.germination)

    def test_day_past_the_last_stages_range_still_returns_last_stage(self):
        # Regression guard: a day past Harvest's own range (100-140) must
        # still correctly return Harvest -- this existing behaviour (the
        # crop has outgrown its last tracked stage) must keep working.
        tracker = self._tracker_planted_days_ago(200)
        self.assertEqual(derive_stage_for_tracker(tracker), self.harvest)


class FarmerCropTrackerAPITests(APITestCase):
    # NOTE: the task brief's example test code hits the raw path
    # "/crops/trackers/", but every crops/urls.py route (like every other
    # app's) is mounted under the "api/" prefix in config/urls.py, and
    # every other test in this file/app reaches its endpoint via
    # reverse() rather than a hardcoded path. Using reverse() here (same
    # as CropListTests, AdvisoryQueryAPITests, etc.) is the only way
    # these tests can actually exercise the real, routable URL.
    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        CropStage.objects.create(crop=self.rice, name="Germination", day_range_start=0, day_range_end=10, order=1)
        CropStage.objects.create(crop=self.rice, name="Flowering", day_range_start=45, day_range_end=65, order=2)
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.other_farmer = User.objects.create_user(username="farmer2", password="x")
        self.url = reverse("farmer-crop-tracker-list-create")

    def test_creating_a_tracker_sets_farmer_from_request_not_body(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {
            "crop": self.rice.id, "planting_date": str(date.today() - timedelta(days=50)),
            "farmer": self.other_farmer.id,  # attempted spoof
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tracker = FarmerCropTracker.objects.get(id=response.data["id"])
        self.assertEqual(tracker.farmer, self.farmer)

    def test_creating_a_tracker_auto_derives_stage(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {
            "crop": self.rice.id, "planting_date": str(date.today() - timedelta(days=50)),
        })
        self.assertEqual(response.data["current_stage"]["name"], "Flowering")

    def test_farmer_only_sees_their_own_trackers(self):
        FarmerCropTracker.objects.create(farmer=self.other_farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(len(response.data), 0)

    def test_second_tracker_for_same_crop_is_a_clean_400_not_a_500(self):
        self.client.force_authenticate(self.farmer)
        self.client.post(self.url, {"crop": self.rice.id})
        response = self.client.post(self.url, {"crop": self.rice.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_explicit_current_stage_override_must_belong_to_trackers_crop(self):
        # A farmer tracking Rice must not be able to set current_stage to
        # a stage that belongs to a different crop (e.g. Arecanut).
        arecanut = Crop.objects.create(name="Arecanut")
        arecanut_stage = CropStage.objects.create(crop=arecanut, name="Harvest", order=1)
        self.client.force_authenticate(self.farmer)
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        detail_url = reverse("farmer-crop-tracker-detail", args=[tracker.id])

        response = self.client.patch(detail_url, {"current_stage": arecanut_stage.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        tracker.refresh_from_db()
        self.assertNotEqual(tracker.current_stage_id, arecanut_stage.id)

    def test_farmer_cannot_view_or_patch_another_farmers_tracker(self):
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        detail_url = reverse("farmer-crop-tracker-detail", args=[tracker.id])
        self.client.force_authenticate(self.other_farmer)

        get_response = self.client.get(detail_url)
        patch_response = self.client.patch(detail_url, {"planting_date": str(date.today())})

        self.assertEqual(get_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        tracker.refresh_from_db()
        self.assertIsNone(tracker.planting_date)


class DiseaseRiskRuleModelTests(TestCase):
    def test_rule_with_no_applicable_stages_means_any_stage(self):
        crop = Crop.objects.create(name="Arecanut")
        disease = Disease.objects.create(crop=crop, name="Mahali / Koleroga (Bud Rot)")
        rule = DiseaseRiskRule.objects.create(
            disease=disease, humidity_min_percent=85, rainfall_min_mm=10,
            consecutive_days_required=3, risk_level="high",
            advisory_text="Inspect for bud rot.", source_citation="ICAR-CPCRI Kasaragod advisory.",
        )
        self.assertEqual(rule.applicable_stages.count(), 0)


class CropTaskModelTests(TestCase):
    def test_task_stores_crop_stage_category_instruction_and_citation(self):
        crop = Crop.objects.create(name="Arecanut")
        stage = CropStage.objects.create(crop=crop, name="Nursery", order=1)
        task = CropTask.objects.create(
            crop=crop, stage=stage, category="irrigation",
            instruction="Irrigate the nursery beds every second day.",
            source_citation="ICAR-CPCRI Kasaragod crop advisory.",
        )
        task.refresh_from_db()
        self.assertEqual(task.crop, crop)
        self.assertEqual(task.stage, stage)
        self.assertEqual(task.category, "irrigation")
        self.assertEqual(task.instruction, "Irrigate the nursery beds every second day.")
        self.assertEqual(task.source_citation, "ICAR-CPCRI Kasaragod crop advisory.")
        self.assertIn(task, stage.tasks.all())


class DiseaseRiskRuleSeedContentTests(TestCase):
    def setUp(self):
        call_command("seed_demo_data")

    def test_every_disease_has_at_least_one_risk_rule(self):
        for disease in Disease.objects.all():
            self.assertGreater(disease.risk_rules.count(), 0, f"{disease.name} has no DiseaseRiskRule")

    def test_every_risk_rule_has_a_real_citation_and_advisory_text(self):
        for rule in DiseaseRiskRule.objects.all():
            self.assertTrue(rule.source_citation.strip())
            self.assertGreater(len(rule.source_citation.strip()), 15)  # not a one-word placeholder
            self.assertTrue(rule.advisory_text.strip())


class CropTaskSeedContentTests(TestCase):
    def setUp(self):
        call_command("seed_demo_data")

    def test_every_crop_stage_has_at_least_one_task(self):
        for stage in CropStage.objects.all():
            self.assertGreater(stage.tasks.count(), 0, f"{stage.crop.name} — {stage.name} has no CropTask")

    def test_every_crop_task_has_a_real_citation_and_instruction(self):
        for task in CropTask.objects.all():
            self.assertTrue(task.source_citation.strip())
            self.assertGreater(len(task.source_citation.strip()), 15)  # not a one-word placeholder
            self.assertTrue(task.instruction.strip())


class SeedDemoDataBackfillTests(TestCase):
    """
    Regression test for a real bug found via a user's own existing
    database, not by any earlier test: every other seed-content test in
    this file calls seed_demo_data() against a brand-new, empty test
    database, so the `data` loop in handle() always runs and always
    creates CropStage/DiseaseRiskRule/CropTask fresh. On a REAL database
    that already had Crop rows from before this USP feature existed, the
    `if Crop.objects.exists(): ... return` early return skipped that
    whole loop -- so re-running seed_demo_data() on such a database
    silently never created any of the new USP content at all, leaving
    the tracker/risk-alert/task-reminder UI permanently empty. Simulates
    that real scenario directly: crops/diseases exist, the three new
    tables are empty, then seed_demo_data() must backfill them.
    """

    def test_rerunning_seed_on_a_pre_usp_database_backfills_the_new_content(self):
        call_command("seed_demo_data")
        self.assertTrue(CropStage.objects.exists())
        self.assertTrue(DiseaseRiskRule.objects.exists())
        self.assertTrue(CropTask.objects.exists())

        # Simulate a database seeded before this USP feature existed:
        # crops/diseases/lifecycle data is already there (left alone,
        # matching the real scenario), but none of the three new tables
        # have ever been populated.
        CropTask.objects.all().delete()
        DiseaseRiskRule.objects.all().delete()
        CropStage.objects.all().delete()
        self.assertFalse(CropStage.objects.exists())
        self.assertFalse(DiseaseRiskRule.objects.exists())
        self.assertFalse(CropTask.objects.exists())
        crop_count_before = Crop.objects.count()

        call_command("seed_demo_data")

        self.assertTrue(CropStage.objects.exists())
        self.assertTrue(DiseaseRiskRule.objects.exists())
        self.assertTrue(CropTask.objects.exists())
        # And it didn't re-seed duplicate crops/diseases while it was at it.
        self.assertEqual(Crop.objects.count(), crop_count_before)

    def test_rerunning_seed_when_the_new_content_already_exists_does_not_duplicate_it(self):
        call_command("seed_demo_data")
        stage_count = CropStage.objects.count()
        rule_count = DiseaseRiskRule.objects.count()
        task_count = CropTask.objects.count()

        call_command("seed_demo_data")

        self.assertEqual(CropStage.objects.count(), stage_count)
        self.assertEqual(DiseaseRiskRule.objects.count(), rule_count)
        self.assertEqual(CropTask.objects.count(), task_count)


class RiskEngineTests(TestCase):
    """
    Task 12 -- pure unit tests for evaluate_risk(tracker, forecast), against
    a hand-built forecast dict in the exact shape fetch_forecast_summary
    returns: a single 3-day AGGREGATE (max_humidity_percent,
    min_temp_celsius, max_temp_celsius, total_rainfall_mm), with no
    per-day breakdown. See risk_engine.py's module docstring for why
    consecutive_days_required is a feasibility gate against that 3-day
    window rather than something counted from the aggregate.
    """

    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.disease = Disease.objects.create(crop=self.rice, name="Bacterial Leaf Blight")
        self.farmer = User.objects.create_user(username="risk_engine_farmer", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)

    def test_rule_matches_when_forecast_meets_every_threshold(self):
        # rule needs humidity>=85 and rainfall>=10; forecast has both
        rule = DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=85, rainfall_min_mm=10,
            consecutive_days_required=3, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="Apply copper-based bactericide.",
            source_citation="ICAR-DRR advisory on bacterial leaf blight.",
        )
        forecast = {
            "max_humidity_percent": 90, "min_temp_celsius": 22.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 15.0,
        }
        results = evaluate_risk(self.tracker, forecast)
        self.assertEqual(results, [{
            "disease_name": rule.disease.name,
            "risk_level": rule.risk_level,
            "advisory_text": rule.advisory_text,
            "source_citation": rule.source_citation,
        }])

    def test_rule_does_not_match_when_one_threshold_is_unmet(self):
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=85, rainfall_min_mm=10,
            consecutive_days_required=3, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="Apply copper-based bactericide.",
            source_citation="ICAR-DRR advisory on bacterial leaf blight.",
        )
        # Humidity threshold is met, but rainfall falls short of 10mm --
        # a rule must satisfy EVERY non-null threshold it sets, not just one.
        forecast = {
            "max_humidity_percent": 90, "min_temp_celsius": 22.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 4.0,
        }
        self.assertEqual(evaluate_risk(self.tracker, forecast), [])

    def test_consecutive_days_required_beyond_the_3_day_forecast_window_never_matches(self):
        # Defensive case from the implementation ruling: a rule asking for
        # more consecutive days than a 3-day-ahead forecast could ever
        # confirm must never match, however extreme the forecast
        # otherwise is. Current seed content never produces this (every
        # seeded rule uses 1 or 3), but the engine must stay fail-safe here.
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=1, rainfall_min_mm=0,
            consecutive_days_required=5, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="x", source_citation="y",
        )
        forecast = {
            "max_humidity_percent": 100, "min_temp_celsius": 0.0,
            "max_temp_celsius": 50.0, "total_rainfall_mm": 500.0,
        }
        self.assertEqual(evaluate_risk(self.tracker, forecast), [])

    def test_rule_scoped_to_a_stage_the_tracker_is_not_in_does_not_match(self):
        flowering = CropStage.objects.create(crop=self.rice, name="Flowering", order=1)
        harvest = CropStage.objects.create(crop=self.rice, name="Harvest", order=2)
        rule = DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=50,
            risk_level=DiseaseRiskRule.RiskLevel.LOW,
            advisory_text="x", source_citation="y",
        )
        rule.applicable_stages.add(flowering)
        self.tracker.current_stage = harvest
        self.tracker.save()
        forecast = {
            "max_humidity_percent": 90, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        self.assertEqual(evaluate_risk(self.tracker, forecast), [])

    def test_rule_with_empty_applicable_stages_matches_at_any_stage(self):
        stage = CropStage.objects.create(crop=self.rice, name="Flowering", order=1)
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=50,
            risk_level=DiseaseRiskRule.RiskLevel.LOW,
            advisory_text="x", source_citation="y",
        )
        self.tracker.current_stage = stage
        self.tracker.save()
        forecast = {
            "max_humidity_percent": 90, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        self.assertEqual(len(evaluate_risk(self.tracker, forecast)), 1)

    def test_rule_with_temp_range_matches_only_when_forecast_range_is_within_it(self):
        DiseaseRiskRule.objects.create(
            disease=self.disease, temp_min_celsius=22, temp_max_celsius=28,
            risk_level=DiseaseRiskRule.RiskLevel.MODERATE,
            advisory_text="x", source_citation="y",
        )
        within = {
            "max_humidity_percent": 50, "min_temp_celsius": 23.0,
            "max_temp_celsius": 27.0, "total_rainfall_mm": 0.0,
        }
        self.assertEqual(len(evaluate_risk(self.tracker, within)), 1)

        too_cold = {**within, "min_temp_celsius": 18.0}
        self.assertEqual(evaluate_risk(self.tracker, too_cold), [])

        too_hot = {**within, "max_temp_celsius": 32.0}
        self.assertEqual(evaluate_risk(self.tracker, too_hot), [])

    def test_results_are_sorted_highest_risk_first(self):
        # Each rule sets a trivially-satisfied humidity threshold -- this
        # test is only exercising sort order, not threshold matching, and
        # (per the fix below) a rule with every threshold left null can
        # never match at all, so it needs at least one real threshold here.
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=1, risk_level=DiseaseRiskRule.RiskLevel.LOW,
            advisory_text="low", source_citation="y",
        )
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=1, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="high", source_citation="y",
        )
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=1, risk_level=DiseaseRiskRule.RiskLevel.MODERATE,
            advisory_text="moderate", source_citation="y",
        )
        forecast = {
            "max_humidity_percent": 50, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        results = evaluate_risk(self.tracker, forecast)
        self.assertEqual([r["advisory_text"] for r in results], ["high", "moderate", "low"])

    def test_rule_with_every_threshold_null_never_matches_any_forecast(self):
        # Critical regression: a DiseaseRiskRule authored with all four
        # weather threshold fields left null (a data-entry gap, not a
        # deliberate "any weather" rule -- there's no way to express that
        # intentionally on this model) must never match, however
        # favourable-looking the forecast is. Before the fix, every
        # per-threshold check below was skipped (None means "not set, so
        # don't check it") and the function fell through to `return True`
        # unconditionally -- matching EVERY forecast, every day.
        DiseaseRiskRule.objects.create(
            disease=self.disease, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="Vascular Streak Dieback risk.", source_citation="y",
        )
        favorable_looking = {
            "max_humidity_percent": 95, "min_temp_celsius": 24.0,
            "max_temp_celsius": 28.0, "total_rainfall_mm": 60.0,
        }
        dry = {
            "max_humidity_percent": 40, "min_temp_celsius": 15.0,
            "max_temp_celsius": 35.0, "total_rainfall_mm": 0.0,
        }
        self.assertEqual(evaluate_risk(self.tracker, favorable_looking), [])
        self.assertEqual(evaluate_risk(self.tracker, dry), [])

    def test_rule_with_at_least_one_real_threshold_still_matches_as_before(self):
        # Regression guard alongside the fix above: a rule that sets at
        # least one real threshold is not a data-entry gap, and must keep
        # matching/failing exactly as before.
        DiseaseRiskRule.objects.create(
            disease=self.disease, humidity_min_percent=80,
            risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="x", source_citation="y",
        )
        humid = {
            "max_humidity_percent": 90, "min_temp_celsius": 24.0,
            "max_temp_celsius": 28.0, "total_rainfall_mm": 0.0,
        }
        dry = {**humid, "max_humidity_percent": 40}
        self.assertEqual(len(evaluate_risk(self.tracker, humid)), 1)
        self.assertEqual(evaluate_risk(self.tracker, dry), [])


class RiskAlertsViewTests(APITestCase):
    # NOTE: same fix as FarmerCropTrackerAPITests above -- every
    # crops/urls.py route is mounted under the "api/" prefix in
    # config/urls.py, so reaching the real routable URL needs reverse(),
    # not a hardcoded "/crops/risk-alerts/" path (which would 404).
    def setUp(self):
        cache.clear()
        self.rice = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="risk_alerts_farmer", password="x")
        self.url = reverse("risk-alerts")

    def test_no_trackers_returns_empty_list_not_error(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["trackers"], [])

    def test_no_home_location_returns_explanatory_detail_not_error(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("location", response.data["detail"].lower())

    @patch("crops.views.fetch_forecast_summary", return_value=None)
    def test_forecast_failure_is_503_not_500(self, mock_fetch):
        self.farmer.home_location = "Puttur"; self.farmer.save()
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_inactive_tracker_is_excluded(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, is_active=False)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["trackers"], [])

    @patch("crops.views.fetch_forecast_summary")
    def test_matching_rule_is_returned_as_a_risk_alert_for_its_tracker(self, mock_fetch):
        self.farmer.home_location = "Puttur"; self.farmer.save()
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        disease = Disease.objects.create(crop=self.rice, name="Bacterial Leaf Blight")
        DiseaseRiskRule.objects.create(
            disease=disease, humidity_min_percent=85, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="Apply copper-based bactericide.",
            source_citation="ICAR-DRR advisory on bacterial leaf blight.",
        )
        mock_fetch.return_value = {
            "max_humidity_percent": 90, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["trackers"]), 1)
        tracker_entry = response.data["trackers"][0]
        self.assertEqual(tracker_entry["tracker_id"], tracker.id)
        self.assertEqual(len(tracker_entry["risk_alerts"]), 1)
        self.assertEqual(tracker_entry["risk_alerts"][0]["disease_name"], "Bacterial Leaf Blight")

    @patch("crops.views.fetch_forecast_summary")
    def test_multiple_active_trackers_each_get_their_own_entry(self, mock_fetch):
        # Judgment call: a farmer with trackers for more than one crop gets
        # one entry per active tracker, each with its own (possibly empty)
        # risk_alerts list, rather than one flat merged alert list.
        self.farmer.home_location = "Puttur"; self.farmer.save()
        arecanut = Crop.objects.create(name="Arecanut")
        rice_tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        arecanut_tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=arecanut)
        mock_fetch.return_value = {
            "max_humidity_percent": 50, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tracker_ids = {t["tracker_id"] for t in response.data["trackers"]}
        self.assertEqual(tracker_ids, {rice_tracker.id, arecanut_tracker.id})

    @patch("crops.views.fetch_forecast_summary")
    def test_repeated_request_for_the_same_tracker_is_served_from_cache(self, mock_fetch):
        self.farmer.home_location = "Puttur"; self.farmer.save()
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        mock_fetch.return_value = {
            "max_humidity_percent": 50, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        self.client.force_authenticate(self.farmer)
        self.client.get(self.url)
        self.client.get(self.url)
        self.assertEqual(mock_fetch.call_count, 1)


class TodaysTasksViewTests(APITestCase):
    """
    Task 17 -- GET /crops/tasks/today/ for the authenticated farmer's own
    active tracker(s), scoped to crop + CURRENT stage only. Same
    reverse()-via-name pattern as RiskAlertsViewTests/FarmerCropTrackerAPITests
    above, since every crops/urls.py route is mounted under the "api/"
    prefix in config/urls.py, so a hardcoded "/crops/tasks/today/" path
    would 404.
    """

    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.germination = CropStage.objects.create(
            crop=self.rice, name="Germination", day_range_start=5, day_range_end=10, order=1
        )
        self.flowering = CropStage.objects.create(
            crop=self.rice, name="Flowering", day_range_start=45, day_range_end=65, order=3
        )
        self.farmer = User.objects.create_user(username="todays_tasks_farmer", password="x")
        self.other_farmer = User.objects.create_user(username="todays_tasks_other_farmer", password="x")
        self.url = reverse("todays-tasks")

    def test_no_trackers_returns_empty_list_not_error(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tasks"], [])

    def test_returns_only_tasks_for_current_stage_not_other_stages(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.flowering)
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Irrigate every 3 days.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.germination, category="irrigation",
            instruction="Different stage task.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["tasks"]), 1)
        self.assertIn("every 3 days", response.data["tasks"][0]["instruction"])

    def test_response_shape_excludes_source_citation(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.flowering)
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Irrigate every 3 days.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        task = response.data["tasks"][0]
        self.assertEqual(set(task.keys()), {"id", "category", "instruction"})

    def test_tracker_with_no_current_stage_contributes_no_tasks(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=None)
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Should not appear.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"], [])

    def test_inactive_tracker_contributes_no_tasks(self):
        FarmerCropTracker.objects.create(
            farmer=self.farmer, crop=self.rice, current_stage=self.flowering, is_active=False
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Should not appear, tracker inactive.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"], [])

    def test_another_farmers_tracker_never_leaks_into_this_farmers_tasks(self):
        FarmerCropTracker.objects.create(
            farmer=self.other_farmer, crop=self.rice, current_stage=self.flowering
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Belongs to the other farmer's tracker only.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"], [])

    def test_multiple_active_trackers_concatenate_their_tasks(self):
        arecanut = Crop.objects.create(name="Arecanut")
        arecanut_stage = CropStage.objects.create(
            crop=arecanut, name="Flowering", typical_month_start=2, typical_month_end=4, order=2
        )
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.flowering)
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=arecanut, current_stage=arecanut_stage)
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Rice task.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=arecanut, stage=arecanut_stage, category="spraying",
            instruction="Arecanut task.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        instructions = {t["instruction"] for t in response.data["tasks"]}
        self.assertEqual(instructions, {"Rice task.", "Arecanut task."})

    def test_multiple_trackers_do_not_cross_match_mismatched_crop_stage_pairs(self):
        """
        Regression test for a bug caught in self-review (no independent
        reviewer was available for this task -- see the ledger). A naive
        CropTask.objects.filter(crop_id__in=[...], stage_id__in=[...])
        using two independent lists would wrongly match a CropTask row
        whose crop belongs to one tracker but whose stage belongs to a
        DIFFERENT tracker, as long as both values individually appear
        somewhere in the farmer's tracker set. This test creates exactly
        that mismatched row and asserts it does NOT appear -- the correct
        per-tracker (crop, stage) pair matching must exclude it.
        """
        arecanut = Crop.objects.create(name="Arecanut")
        arecanut_stage = CropStage.objects.create(
            crop=arecanut, name="Flowering", typical_month_start=2, typical_month_end=4, order=2
        )
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.flowering)
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=arecanut, current_stage=arecanut_stage)
        # Legitimate tasks for each tracker's real (crop, stage) pair.
        CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Rice task.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=arecanut, stage=arecanut_stage, category="spraying",
            instruction="Arecanut task.", source_citation="x" * 20
        )
        # Mismatched row: crop=rice (which the farmer tracks) but
        # stage=arecanut_stage (which the farmer's Arecanut tracker is
        # currently at, but Rice never is). A crop_id__in/stage_id__in
        # cross-join would wrongly include this.
        CropTask.objects.create(
            crop=self.rice, stage=arecanut_stage, category="other",
            instruction="MISMATCHED - must never appear.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        instructions = {t["instruction"] for t in response.data["tasks"]}
        self.assertEqual(instructions, {"Rice task.", "Arecanut task."})
        self.assertNotIn("MISMATCHED - must never appear.", instructions)


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
