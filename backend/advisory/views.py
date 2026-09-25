from django.utils import timezone
from rest_framework import generics, permissions
from .models import AdvisoryQuery
from .serializers import (
    AdvisoryQuerySerializer,
    AdvisoryQueryCreateSerializer,
    AdvisoryQueryAnswerSerializer,
)
from .permissions import IsQueryOwnerOrAdmin, IsAdminExpert
from .throttles import AdvisoryRateThrottle


class AdvisoryQueryListCreateView(generics.ListCreateAPIView):
    """
    GET: a farmer sees only their own queries; an admin/expert sees every
    query (optionally narrowed with ?status=pending or ?status=answered).
    POST: a farmer submits a new question. `farmer` always comes from the
    authenticated request, never the request body.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AdvisoryRateThrottle]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AdvisoryQueryCreateSerializer
        return AdvisoryQuerySerializer

    def get_queryset(self):
        user = self.request.user
        qs = AdvisoryQuery.objects.select_related("farmer")
        if user.role == user.Role.ADMIN:
            status_filter = self.request.query_params.get("status")
            valid_statuses = {choice.value for choice in AdvisoryQuery.Status}
            if status_filter in valid_statuses:
                qs = qs.filter(status=status_filter)
            return qs
        return qs.filter(farmer=user)

    def perform_create(self, serializer):
        serializer.save(farmer=self.request.user)


class AdvisoryQueryDetailView(generics.RetrieveUpdateAPIView):
    """
    GET: the owning farmer or any admin/expert may view a query.
    PATCH: only an admin/expert may answer it -- this always stamps
    status=ANSWERED and answered_at server-side, regardless of what (if
    anything) the client sends for those fields. PUT is intentionally not
    allowed; a query is only ever partially updated (answered), never
    replaced wholesale.
    """
    queryset = AdvisoryQuery.objects.select_related("farmer")
    throttle_classes = [AdvisoryRateThrottle]
    http_method_names = ["get", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return AdvisoryQueryAnswerSerializer
        return AdvisoryQuerySerializer

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [permissions.IsAuthenticated(), IsAdminExpert()]
        return [permissions.IsAuthenticated(), IsQueryOwnerOrAdmin()]

    def perform_update(self, serializer):
        serializer.save(status=AdvisoryQuery.Status.ANSWERED, answered_at=timezone.now())
