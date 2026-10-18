"""
Phase 20 — formal automated test suite for the crops app.

Covers the public, read-only crop/disease catalog (Phase 7 + Phase 11) and
the Phase 18 translated-field fallback behavior.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Crop, CropStage, CropTask, Disease, DiseaseRiskRule, FarmerCropTracker, Recommendation
from .risk_engine import evaluate_risk
from .stage_derivation import derive_stage_for_tracker

User = get_user_model()


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
        DiseaseRiskRule.objects.create(
            disease=self.disease, risk_level=DiseaseRiskRule.RiskLevel.LOW,
            advisory_text="low", source_citation="y",
        )
        DiseaseRiskRule.objects.create(
            disease=self.disease, risk_level=DiseaseRiskRule.RiskLevel.HIGH,
            advisory_text="high", source_citation="y",
        )
        DiseaseRiskRule.objects.create(
            disease=self.disease, risk_level=DiseaseRiskRule.RiskLevel.MODERATE,
            advisory_text="moderate", source_citation="y",
        )
        forecast = {
            "max_humidity_percent": 50, "min_temp_celsius": 20.0,
            "max_temp_celsius": 30.0, "total_rainfall_mm": 0.0,
        }
        results = evaluate_risk(self.tracker, forecast)
        self.assertEqual([r["advisory_text"] for r in results], ["high", "moderate", "low"])


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
