"""
Today's Tasks tests: CropTask model/seed content and the TodaysTasksView API (section 4.25).

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from .models import Crop, CropStage, CropTask, CropTaskCompletion, FarmerCropTracker

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


class CropTaskCompletionModelTests(TestCase):
    """
    Task 13 -- CropTaskCompletion records that a given tracker has completed
    a given task. unique_together("tracker", "task") is what Task 14's
    idempotent-POST toggle endpoint (get_or_create) will rely on to never
    create duplicate completion rows for the same tracker/task pair.
    """

    def setUp(self):
        self.crop = Crop.objects.create(name="Arecanut")
        self.stage = CropStage.objects.create(crop=self.crop, name="Nursery", order=1)
        self.task = CropTask.objects.create(
            crop=self.crop, stage=self.stage, category="irrigation",
            instruction="Irrigate the nursery beds every second day.",
            source_citation="ICAR-CPCRI Kasaragod crop advisory.",
        )
        self.farmer = User.objects.create_user(username="completion_farmer", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)

    def test_completion_is_unique_per_tracker_and_task(self):
        CropTaskCompletion.objects.create(tracker=self.tracker, task=self.task)
        with self.assertRaises(IntegrityError):
            CropTaskCompletion.objects.create(tracker=self.tracker, task=self.task)




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
        # Task 13 -- "completed" added to CropTaskSerializer (defaults to
        # False here since TodaysTasksView doesn't pass completion context
        # yet; Task 14 wires the real per-tracker value).
        # Final-review fix (F2) -- "crop" added so the frontend can resolve
        # which of a multi-tracker farmer's trackers a given task actually
        # belongs to, instead of guessing "the first active tracker" (see
        # useTasks.js and task-15-report.md).
        self.assertEqual(set(task.keys()), {"id", "category", "instruction", "completed", "crop"})
        self.assertEqual(task["completed"], False)
        self.assertEqual(task["crop"], self.rice.id)

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

    def test_a_completed_task_is_reported_completed_directly_from_this_endpoint(self):
        # Final-review fix (F4) -- TodaysTasksView never passed a
        # `completed_task_ids` context into CropTaskSerializer, so
        # `completed` was always False here, even for a task the farmer
        # had genuinely already marked done (the frontend used to paper
        # over this with an extra request to /completed/ and a client-side
        # merge -- see useTasks.js's old mergeCompletedOverride). It must
        # now come back correctly from THIS endpoint directly.
        self.tracker = FarmerCropTracker.objects.create(
            farmer=self.farmer, crop=self.rice, current_stage=self.flowering
        )
        task = CropTask.objects.create(
            crop=self.rice, stage=self.flowering, category="irrigation",
            instruction="Irrigate every 3 days.", source_citation="x" * 20
        )
        CropTaskCompletion.objects.create(tracker=self.tracker, task=task)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"][0]["completed"], True)

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


class UpcomingTasksViewTests(APITestCase):
    """
    Task 14 -- GET /crops/tasks/upcoming/. Same reverse()-via-name and
    force_authenticate pattern as TodaysTasksViewTests above.
    """

    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.stage1 = CropStage.objects.create(crop=self.rice, name="Germination", order=1)
        self.stage2 = CropStage.objects.create(crop=self.rice, name="Vegetative", order=2)
        self.stage3 = CropStage.objects.create(crop=self.rice, name="Flowering", order=3)
        self.stage4 = CropStage.objects.create(crop=self.rice, name="Harvest", order=4)
        self.farmer = User.objects.create_user(username="upcoming_tasks_farmer", password="x")
        self.url = reverse("upcoming-tasks")

    def test_upcoming_tasks_excludes_current_and_past_stages(self):
        # Tracker at stage 2 of 4 -- only stage 3+ tasks should come back.
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.stage2)
        CropTask.objects.create(
            crop=self.rice, stage=self.stage1, category="irrigation",
            instruction="Past stage task.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.stage2, category="irrigation",
            instruction="Current stage task.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.stage3, category="irrigation",
            instruction="Upcoming stage 3 task.", source_citation="x" * 20
        )
        CropTask.objects.create(
            crop=self.rice, stage=self.stage4, category="spraying",
            instruction="Upcoming stage 4 task.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        instructions = {t["instruction"] for t in response.data["tasks"]}
        self.assertEqual(instructions, {"Upcoming stage 3 task.", "Upcoming stage 4 task."})

    def test_no_current_stage_contributes_no_upcoming_tasks(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=None)
        CropTask.objects.create(
            crop=self.rice, stage=self.stage4, category="irrigation",
            instruction="Should not appear.", source_citation="x" * 20
        )
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"], [])

    def test_a_completed_task_is_reported_completed_directly_from_this_endpoint(self):
        # Final-review fix (F4) -- same gap as TodaysTasksView: UpcomingTasksView
        # never passed completion context either, so an upcoming task the
        # farmer had already completed ahead of time still came back False
        # directly from this endpoint.
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.stage2)
        task = CropTask.objects.create(
            crop=self.rice, stage=self.stage3, category="irrigation",
            instruction="Upcoming stage 3 task.", source_citation="x" * 20
        )
        CropTaskCompletion.objects.create(tracker=tracker, task=task)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["tasks"][0]["completed"], True)


class CompletedTasksViewTests(APITestCase):
    """
    Task 14 -- GET /crops/tasks/completed/.
    """

    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.stage = CropStage.objects.create(crop=self.rice, name="Flowering", order=1)
        self.task_a = CropTask.objects.create(
            crop=self.rice, stage=self.stage, category="irrigation",
            instruction="Task A.", source_citation="x" * 20
        )
        self.task_b = CropTask.objects.create(
            crop=self.rice, stage=self.stage, category="spraying",
            instruction="Task B.", source_citation="x" * 20
        )
        self.farmer = User.objects.create_user(username="completed_tasks_farmer", password="x")
        self.other_farmer = User.objects.create_user(username="completed_tasks_other_farmer", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.stage)
        self.other_tracker = FarmerCropTracker.objects.create(
            farmer=self.other_farmer, crop=self.rice, current_stage=self.stage
        )
        self.url = reverse("completed-tasks")

    def test_completed_tasks_only_shows_this_trackers_completions(self):
        # Two trackers (different farmers), two different completions --
        # the authenticated farmer's /completed/ response must show only
        # their own tracker's completion, never the other farmer's.
        CropTaskCompletion.objects.create(tracker=self.tracker, task=self.task_a)
        CropTaskCompletion.objects.create(tracker=self.other_tracker, task=self.task_b)
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        instructions = {t["instruction"] for t in response.data["tasks"]}
        self.assertEqual(instructions, {"Task A."})
        for task in response.data["tasks"]:
            self.assertTrue(task["completed"])

    def test_no_completions_returns_empty_list_not_error(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tasks"], [])


class TaskCompletionToggleViewTests(APITestCase):
    """
    Task 14 -- POST/DELETE /crops/tasks/<task_id>/complete/?tracker=<id>.
    """

    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.stage = CropStage.objects.create(crop=self.rice, name="Flowering", order=1)
        self.task = CropTask.objects.create(
            crop=self.rice, stage=self.stage, category="irrigation",
            instruction="Irrigate every 3 days.", source_citation="x" * 20
        )
        self.farmer = User.objects.create_user(username="toggle_tasks_farmer", password="x")
        self.other_farmer = User.objects.create_user(username="toggle_tasks_other_farmer", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.stage)
        self.other_tracker = FarmerCropTracker.objects.create(
            farmer=self.other_farmer, crop=self.rice, current_stage=self.stage
        )
        self.url = reverse("task-completion-toggle", kwargs={"task_id": self.task.id})

    def test_marking_another_users_tracker_task_complete_is_rejected(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(f"{self.url}?tracker={self.other_tracker.id}")
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.assertFalse(
            CropTaskCompletion.objects.filter(tracker=self.other_tracker, task=self.task).exists()
        )

    def test_marking_complete_twice_does_not_error_or_duplicate(self):
        self.client.force_authenticate(self.farmer)
        url = f"{self.url}?tracker={self.tracker.id}"
        response1 = self.client.post(url)
        self.assertIn(response1.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        response2 = self.client.post(url)
        self.assertIn(response2.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        self.assertEqual(
            CropTaskCompletion.objects.filter(tracker=self.tracker, task=self.task).count(), 1
        )

    def test_delete_removes_the_completion(self):
        self.client.force_authenticate(self.farmer)
        CropTaskCompletion.objects.create(tracker=self.tracker, task=self.task)
        response = self.client.delete(f"{self.url}?tracker={self.tracker.id}")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            CropTaskCompletion.objects.filter(tracker=self.tracker, task=self.task).exists()
        )

    # Final-review fix (F2) -- a farmer's own, legitimately-owned tracker
    # for a DIFFERENT crop than the task being toggled must still be
    # rejected. Before this fix, `_get_owned_tracker` only checked that the
    # tracker belonged to the authenticated farmer -- it never checked that
    # the tracker's crop actually matched the task's crop, so a malformed
    # or mismatched `?tracker=` could silently record a completion against
    # the wrong tracker.
    def test_toggling_a_task_against_a_tracker_for_a_different_crop_is_rejected(self):
        arecanut = Crop.objects.create(name="Arecanut")
        arecanut_stage = CropStage.objects.create(crop=arecanut, name="Flowering", order=1)
        arecanut_tracker = FarmerCropTracker.objects.create(
            farmer=self.farmer, crop=arecanut, current_stage=arecanut_stage
        )
        self.client.force_authenticate(self.farmer)
        # self.task belongs to self.rice -- arecanut_tracker is this SAME
        # farmer's own tracker, just for the wrong crop.
        response = self.client.post(f"{self.url}?tracker={arecanut_tracker.id}")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            CropTaskCompletion.objects.filter(tracker=arecanut_tracker, task=self.task).exists()
        )

    def test_toggling_a_task_against_the_matching_tracker_still_works(self):
        # Same farmer, same two trackers as above -- but this time posting
        # with the tracker that actually matches the task's own crop (Rice)
        # must still succeed exactly as before.
        arecanut = Crop.objects.create(name="Arecanut")
        arecanut_stage = CropStage.objects.create(crop=arecanut, name="Flowering", order=1)
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=arecanut, current_stage=arecanut_stage)
        self.client.force_authenticate(self.farmer)
        response = self.client.post(f"{self.url}?tracker={self.tracker.id}")
        self.assertIn(response.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED))
        self.assertTrue(
            CropTaskCompletion.objects.filter(tracker=self.tracker, task=self.task).exists()
        )
