"""
"Tasks for today" (Task 17).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/views.py into focused per-feature modules. No
behavior changed -- same class, just regrouped.
"""
from django.db.models import Q
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import CropStage, CropTask, CropTaskCompletion, FarmerCropTracker
from .serializers_tasks import CropTaskSerializer


class TodaysTasksView(APIView):
    """
    Task 17 -- "Tasks for today" for the authenticated farmer's own
    active tracker(s), scoped to crop + CURRENT stage only. No weather/
    forecast dependency and no caching need here (unlike RiskAlertsView
    above) -- it's a pure DB lookup. A tracker with no current_stage yet
    contributes zero tasks, not an error.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trackers = list(
            FarmerCropTracker.objects.filter(
                farmer=request.user, is_active=True, current_stage__isnull=False
            ).select_related("crop", "current_stage")
        )

        if not trackers:
            return Response({"tasks": []}, status=status.HTTP_200_OK)

        # Match each tracker's (crop, current_stage) pair exactly -- a plain
        # crop_id__in=[...] combined with stage_id__in=[...] would cross-join
        # across multiple trackers (e.g. a farmer tracking both Rice and
        # Arecanut could wrongly match a stray CropTask row whose crop/stage
        # combination belongs to neither tracker), so build the OR of exact
        # per-tracker pairs instead.
        pair_filter = Q()
        for tracker in trackers:
            pair_filter |= Q(crop_id=tracker.crop_id, stage_id=tracker.current_stage_id)
        tasks = CropTask.objects.filter(pair_filter)
        # Final-review fix (F4) -- pass this farmer's own completed-task
        # ids into context so `completed` is computed correctly here
        # directly, same pattern CompletedTasksView already uses, instead
        # of silently defaulting to False (CropTaskSerializer.get_completed's
        # "no context supplied" fallback) and leaving the frontend to paper
        # over it with an extra /completed/ request and a client-side merge.
        completed_task_ids = set(
            CropTaskCompletion.objects.filter(tracker__in=trackers).values_list("task_id", flat=True)
        )
        serialized = CropTaskSerializer(
            tasks, many=True, context={"completed_task_ids": completed_task_ids}
        ).data
        return Response({"tasks": serialized}, status=status.HTTP_200_OK)


class UpcomingTasksView(APIView):
    """
    Task 14 -- "Upcoming" tasks for the authenticated farmer's own active
    tracker(s): every CropTask whose stage comes AFTER the tracker's
    current_stage (by CropStage.order), i.e. tasks the farmer hasn't
    reached yet. Same overall shape as TodaysTasksView above (active,
    current_stage-having trackers only; empty list, not an error, when
    there are none) and the same per-tracker exact-pair defense against
    cross-tracker leakage explained in that class's comment -- extended
    here from "stage == current_stage" to "stage in {this tracker's
    crop's stages with order greater than current_stage.order}". Building
    the OR per tracker (rather than pooling every farmer's "upcoming
    stage ids" into one global stage_id__in list and crop_id__in list)
    means a CropTask row can only match if its (crop, stage) pair both
    belong to the SAME tracker, so one tracker's crop can never pick up
    another tracker's upcoming-stage task the way two independent
    crop_id__in/stage_id__in lists could.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trackers = list(
            FarmerCropTracker.objects.filter(
                farmer=request.user, is_active=True, current_stage__isnull=False
            ).select_related("crop", "current_stage")
        )

        if not trackers:
            return Response({"tasks": []}, status=status.HTTP_200_OK)

        pair_filter = Q()
        has_any_pair = False
        for tracker in trackers:
            upcoming_stage_ids = list(
                CropStage.objects.filter(
                    crop_id=tracker.crop_id, order__gt=tracker.current_stage.order
                ).values_list("id", flat=True)
            )
            if upcoming_stage_ids:
                pair_filter |= Q(crop_id=tracker.crop_id, stage_id__in=upcoming_stage_ids)
                has_any_pair = True

        if not has_any_pair:
            return Response({"tasks": []}, status=status.HTTP_200_OK)

        tasks = CropTask.objects.filter(pair_filter)
        # Final-review fix (F4) -- same completion-context wiring as
        # TodaysTasksView above; see that view's comment for why.
        completed_task_ids = set(
            CropTaskCompletion.objects.filter(tracker__in=trackers).values_list("task_id", flat=True)
        )
        serialized = CropTaskSerializer(
            tasks, many=True, context={"completed_task_ids": completed_task_ids}
        ).data
        return Response({"tasks": serialized}, status=status.HTTP_200_OK)


class CompletedTasksView(APIView):
    """
    Task 14 -- "Completed" tasks for the authenticated farmer's own active
    tracker(s): every CropTask that has a CropTaskCompletion (Task 13) row
    for one of those trackers.

    Unlike TodaysTasksView/UpcomingTasksView, this doesn't need the
    crop/stage Q-pair-building technique those two use: CropTaskCompletion
    already names its owning tracker explicitly via a FK (`tracker`), so
    scoping to `tracker__in=<this farmer's own trackers>` can't cross-leak
    another farmer's completion the way a bare CropTask.objects.filter
    (crop_id__in=[...], stage_id__in=[...]) could -- that failure mode is
    specifically about CropTask rows being shared across every farmer
    growing a crop and having no farmer/tracker of their own, which
    doesn't apply to CropTaskCompletion rows at all.

    Every item returned here is, by definition, completed, so
    CropTaskSerializer's `completed_task_ids` context is passed as the
    full set of ids being returned (not left to the serializer's
    "no context supplied" default, which is False) -- that default exists
    for TodaysTasksView/UpcomingTasksView's mixed done/not-done lists, and
    would be actively wrong here.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        trackers = FarmerCropTracker.objects.filter(farmer=request.user, is_active=True)

        completions = CropTaskCompletion.objects.filter(
            tracker__in=trackers
        ).select_related("task")
        tasks = [completion.task for completion in completions]
        completed_task_ids = {task.id for task in tasks}
        serialized = CropTaskSerializer(
            tasks, many=True, context={"completed_task_ids": completed_task_ids}
        ).data
        return Response({"tasks": serialized}, status=status.HTTP_200_OK)


class TaskCompletionToggleView(APIView):
    """
    Task 14 -- POST/DELETE /crops/tasks/<task_id>/complete/?tracker=<id>
    creates/removes the CropTaskCompletion row marking one of the
    farmer's own trackers as having completed the given CropTask.

    `tracker` is a required query param rather than part of the URL path
    or (for POST) the request body: a CropTask is shared across every
    farmer growing that crop, so the task_id alone never identifies whose
    progress is being toggled, and DELETE conventionally carries no body.
    This mirrors FarmingDiaryEntryListCreateView.get_queryset's required
    `?tracker=` handling in views_diary.py exactly: a non-integer/missing
    value is a ValidationError (400, same as that view), and ownership is
    checked the same way -- a plain
    `FarmerCropTracker.objects.filter(id=..., farmer=...)` lookup, raising
    `PermissionDenied` (403) on a mismatch -- rather than inventing a new
    authorization idiom for this endpoint.

    POST uses `get_or_create` so a second POST for the same (tracker,
    task) pair is idempotent: it hits Task 13's
    `unique_together("tracker", "task")` constraint's intended use, not
    its error path -- still a 200 (not 201, since nothing new was
    created) and still exactly one row. DELETE uses `filter(...).delete()`
    rather than `get_object_or_404` + `.delete()` so deleting a
    not-currently-completed task is simply a no-op 204, not a 404 --
    "mark as not done" is idempotent the same way "mark as done" is.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_owned_tracker(self, request):
        tracker_param = request.query_params.get("tracker")
        try:
            tracker_id = int(tracker_param)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"tracker": "A valid tracker id is required."})
        tracker = FarmerCropTracker.objects.filter(id=tracker_id, farmer=request.user).first()
        if tracker is None:
            raise PermissionDenied("You can only modify completions for your own crop trackers.")
        return tracker

    def _get_task_for_tracker(self, task_id, tracker):
        """
        Final-review fix (F2) -- `_get_owned_tracker` above only confirms
        the tracker belongs to the authenticated farmer; it says nothing
        about whether that tracker's crop actually matches the task being
        toggled. A CropTask is shared across every farmer growing that
        crop, so a client-supplied `?tracker=` id for a DIFFERENT crop the
        same farmer also tracks would otherwise record the completion
        under the wrong tracker with no error at all. Resolving task +
        tracker together here, and rejecting a crop mismatch with a plain
        400, closes that gap -- a completion can never be recorded under a
        tracker whose crop doesn't match the task's own crop.
        """
        task = CropTask.objects.filter(pk=task_id).first()
        if task is None:
            raise NotFound("No such task.")
        if task.crop_id != tracker.crop_id:
            raise serializers.ValidationError(
                {"tracker": "This tracker does not belong to this task's crop."}
            )
        return task

    def post(self, request, task_id):
        tracker = self._get_owned_tracker(request)
        task = self._get_task_for_tracker(task_id, tracker)
        _completion, created = CropTaskCompletion.objects.get_or_create(tracker=tracker, task=task)
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({"completed": True}, status=response_status)

    def delete(self, request, task_id):
        tracker = self._get_owned_tracker(request)
        task = self._get_task_for_tracker(task_id, tracker)
        CropTaskCompletion.objects.filter(tracker=tracker, task=task).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
