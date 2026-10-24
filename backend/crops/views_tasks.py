"""
"Tasks for today" (Task 17).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/views.py into focused per-feature modules. No
behavior changed -- same class, just regrouped.
"""
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import CropTask, FarmerCropTracker
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
        serialized = CropTaskSerializer(tasks, many=True).data
        return Response({"tasks": serialized}, status=status.HTTP_200_OK)
