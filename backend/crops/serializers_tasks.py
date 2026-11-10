"""
The "Today's Tasks" feature's own serializer (Task 17).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/serializers.py into focused per-feature modules. No
behavior changed -- same class, same fields, just regrouped.
"""
from rest_framework import serializers
from .models import CropTask


class CropTaskSerializer(serializers.ModelSerializer):
    """
    Task 17 -- farmer-facing "Today's Tasks" serializer. source_citation
    is deliberately excluded: it's internal/admin-only research backing,
    not something to surface in the UI.

    Task 13 -- `completed` isn't a model field on CropTask (a CropTask is
    shared across every farmer growing that crop; completion is scoped per
    FarmerCropTracker via the new CropTaskCompletion model). It's declared
    as a SerializerMethodField, read-only and computed entirely server-side
    from a `completed_task_ids` set the view injects into `context` -- the
    opposite direction from `FarmingDiaryEntrySerializer.scan_id` in
    serializers_diary.py, which is write-only input parsed from the
    client's request body. The real similarity to that field is narrower:
    both are declared explicitly because neither is a literal model field
    ModelSerializer could auto-generate. Task 14's views can later pass
    each request's completed-task-id set in via context without changing
    this serializer's field list again. Until a view supplies that context
    (e.g. TodaysTasksView today), it safely defaults to False rather than
    raising.
    """

    completed = serializers.SerializerMethodField()

    class Meta:
        model = CropTask
        # Final-review fix (F2) -- "crop" (the task's own crop id) is
        # included so the frontend can resolve which of a multi-tracker
        # farmer's own trackers a given task actually belongs to (matching
        # it against FarmerCropTrackerSerializer's own "crop" field),
        # instead of guessing "the farmer's first active tracker" the way
        # useTasks.js used to -- see TaskCompletionToggleView's crop/tracker
        # cross-check in views_tasks.py for the backend half of this fix.
        fields = ["id", "category", "instruction", "completed", "crop"]

    def get_completed(self, obj):
        completed_task_ids = self.context.get("completed_task_ids")
        if not completed_task_ids:
            return False
        return obj.id in completed_task_ids
