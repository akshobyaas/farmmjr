"""
Regression tests for seed_demo_data()'s early-return-guard bug class (section 4.14/4.26): re-running the seed command on a database that already has Crop rows must still backfill CropStage/DiseaseRiskRule/CropTask content, without duplicating anything. Kept in its own file since it spans all three USP models rather than belonging to any one feature's own test file.

Cleanup pass (section 4.29 follow-up): split out of the former single
crops/tests.py (1471 lines covering five unrelated features) into focused
per-feature files, as part of the dead-code/naming/error-handling audit.
No test behavior changed -- same classes, same assertions, just regrouped.
"""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from .models import Crop, CropStage, CropTask, DiseaseRiskRule

User = get_user_model()


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
