"""
The Farming Diary feature's own views (section 4.27).

Cleanup pass (backend restructure + API conventions): split out of the
former single crops/views.py into focused per-feature modules. No
behavior changed -- same classes, just regrouped.
"""
from rest_framework import generics, permissions, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .diary_ai import generate_diary_analysis
from .models import FarmerCropTracker, FarmingDiaryEntry
from .serializers_diary import FarmingDiaryEntrySerializer


class FarmingDiaryEntryListCreateView(generics.ListCreateAPIView):
    """
    Farming Diary Task 2.

    GET: a farmer's own diary entries for one of their own trackers,
    selected via the required `?tracker=<id>` query param -- mirrors
    `CropListView.get_queryset`'s style for query-param handling, but this
    param is required (not optional like `search` there) since every
    diary entry belongs to exactly one tracker and the list view has no
    sensible "all trackers" default. A missing or non-integer `tracker`
    param is a 400, same as any other malformed-input case.

    POST: create today's entry for one of the farmer's own trackers, or --
    see `FarmingDiaryEntrySerializer.create` -- update it in place if one
    already exists for today (idempotent per day). `perform_create` does
    NOT set anything from `request.user` (there is no `farmer` field on
    this model, only `tracker`) -- the cross-farmer-tracker ownership
    check lives entirely in the serializer's `validate()`, which raises
    `PermissionDenied` for the 403 the brief requires, same "validated in
    the serializer, surfaced as the right status code" pattern as
    `FarmerCropTrackerSerializer` uses `ValidationError` for its own
    checks.
    """
    serializer_class = FarmingDiaryEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        tracker_param = self.request.query_params.get("tracker")
        try:
            tracker_id = int(tracker_param)
        except (TypeError, ValueError):
            raise serializers.ValidationError(
                {"tracker": "A valid tracker id is required."}
            )
        # Checked explicitly (rather than just filtering
        # FarmingDiaryEntry by tracker__farmer and letting a mismatched
        # tracker silently return an empty list) so that listing another
        # farmer's tracker is a 403, same ownership-violation signal as
        # the create path, not a 200 with an empty list that looks
        # indistinguishable from "this tracker just has no entries yet".
        if not FarmerCropTracker.objects.filter(id=tracker_id, farmer=self.request.user).exists():
            raise PermissionDenied("You can only view diary entries for your own crop trackers.")
        return FarmingDiaryEntry.objects.filter(
            tracker__farmer=self.request.user, tracker_id=tracker_id
        ).select_related("tracker")

    def perform_create(self, serializer):
        # Task 4 -- after the entry is fully saved (including Task 3's
        # photo diagnosis, which already ran inside
        # FarmingDiaryEntrySerializer.create() for both the fresh-create
        # and same-day-update branches -- serializer.instance is set
        # either way), generate the Gemini text analysis and persist it.
        # Wired here rather than in the serializer for the same reason
        # risk_engine.evaluate_risk is called from RiskAlertsView above,
        # not from a serializer: this is an external-API side effect, not
        # a data-shape concern.
        serializer.save()
        entry = serializer.instance
        # `diary_entries` inherits FarmingDiaryEntry.Meta.ordering
        # ("-entry_date", newest first), so `[:5]` here correctly selects
        # the 5 most recent OTHER entries -- but still newest-first. Task
        # 4's diary_ai.generate_diary_analysis expects its `recent_entries`
        # argument oldest-to-newest (that's the order its prompt is
        # labelled with), so the materialized list is reversed here before
        # being passed in -- reversing a 5-element list, not re-querying,
        # so the "most recent 5" selection above is unaffected.
        most_recent_first = list(entry.tracker.diary_entries.exclude(pk=entry.pk)[:5])
        recent_entries = list(reversed(most_recent_first))
        analysis = generate_diary_analysis(entry, recent_entries)
        if analysis is None:
            entry.ai_analysis = ""
            entry.ai_analysis_status = FarmingDiaryEntry.AnalysisStatus.UNAVAILABLE
        else:
            entry.ai_analysis = analysis
            entry.ai_analysis_status = FarmingDiaryEntry.AnalysisStatus.OK
        entry.save(update_fields=["ai_analysis", "ai_analysis_status"])

    def create(self, request, *args, **kwargs):
        # Overridden (rather than using CreateModelMixin's create() as-is)
        # solely to pick 200 vs 201 based on whether
        # FarmingDiaryEntrySerializer.create() updated an existing same-day
        # entry or made a new one -- see that method's docstring for why.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        response_status = (
            status.HTTP_200_OK if getattr(serializer, "updated_existing", False)
            else status.HTTP_201_CREATED
        )
        return Response(serializer.data, status=response_status, headers=headers)


class FarmingDiaryEntryDetailView(generics.RetrieveAPIView):
    """
    Farming Diary Task 2 -- read-only (no PATCH endpoint this round; the
    create endpoint's idempotent-per-day behavior is the only write path
    for now). Scoped to the farmer's own entries the same
    `tracker__farmer=self.request.user` way as the list view, so a
    mismatched pk 404s rather than ever exposing another farmer's entry.
    """
    serializer_class = FarmingDiaryEntrySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return FarmingDiaryEntry.objects.filter(
            tracker__farmer=self.request.user
        ).select_related("tracker")
