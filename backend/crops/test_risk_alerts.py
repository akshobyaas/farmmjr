"""
Proactive disease-risk alert tests: DiseaseRiskRule model/seed content, the weather-forecast-backed risk engine, and the risk-alerts API (section 4.25).

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
from unittest.mock import patch
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Crop, CropStage, Disease, DiseaseRiskRule, FarmerCropTracker
from .risk_engine import evaluate_risk

User = get_user_model()


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
