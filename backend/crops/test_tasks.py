"""
Today's Tasks tests: CropTask model/seed content and the TodaysTasksView API (section 4.25).

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Crop, CropStage, CropTask, FarmerCropTracker

User = get_user_model()


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
