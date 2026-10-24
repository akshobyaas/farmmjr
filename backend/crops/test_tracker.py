"""
Crop Lifecycle Tracker tests: CropStage/FarmerCropTracker models, stage derivation from planting date, and the tracker CRUD API (section 4.25).

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
from datetime import date, timedelta
from unittest.mock import patch
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Crop, CropStage, FarmerCropTracker
from .stage_derivation import derive_stage_for_tracker

User = get_user_model()


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
