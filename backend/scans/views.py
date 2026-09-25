from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from . import ml_model
from .pagination import ScanHistoryPagination
from .permissions import IsScanOwner
from .serializers import ScanUploadSerializer, ScanResultSerializer, ScanHistoryListSerializer
from .models import ScanHistory
from .throttles import ScanUploadRateThrottle


class ScanUploadView(generics.CreateAPIView):
    """
    Accepts a crop image upload from an authenticated farmer (Phase 8),
    then (Phase 10) runs it through the Phase 9 CNN and attaches a real
    prediction before responding.
    """
    serializer_class = ScanUploadSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScanUploadRateThrottle]
    queryset = ScanHistory.objects.all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        scan = serializer.save()

        label, confidence = ml_model.predict(scan.image.path)
        disease = ml_model.disease_lookup(label)

        if disease:
            scan.predicted_disease = disease
            scan.confidence = confidence
            scan.save(update_fields=["predicted_disease", "confidence"])
            message = (
                f"Prediction: {disease.name} ({disease.crop.name}) — "
                f"{confidence * 100:.1f}% confidence."
            )
        elif label:
            # The model predicted a real class, but we don't have DB disease
            # data for it yet (shouldn't normally happen -- LABEL_TO_DISEASE
            # in ml_model.py should cover every class the model was trained
            # on -- but fail soft rather than losing the prediction entirely).
            scan.confidence = confidence
            scan.save(update_fields=["confidence"])
            message = (
                f"Prediction: {label} ({confidence * 100:.1f}% confidence) — "
                "detailed guidance for this class isn't in the database yet."
            )
        else:
            message = (
                "Image uploaded successfully, but prediction is unavailable right now "
                "(model not loaded, or the image could not be processed)."
            )

        return Response(
            {
                "message": message,
                "scan": ScanResultSerializer(scan, context=self.get_serializer_context()).data,
            },
            status=status.HTTP_201_CREATED,
        )


class ScanHistoryListView(generics.ListAPIView):
    """
    Phase 12 -- paginated list of the authenticated farmer's own past
    scans, most recent first (ScanHistory.Meta.ordering already handles
    that). List views never call has_object_permission, so filtering the
    queryset to request.user IS the security boundary here -- the detail
    view below uses an object-level permission instead, since it looks up
    by ID and needs to be explicitly testable the way Phase 6 was.
    """
    serializer_class = ScanHistoryListSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ScanHistoryPagination

    def get_queryset(self):
        return (
            ScanHistory.objects.filter(user=self.request.user)
            .select_related("predicted_disease", "predicted_disease__crop")
        )


class ScanHistoryDetailView(generics.RetrieveAPIView):
    """
    Phase 12 -- full result for one past scan, by ID ("tap a history item
    to see full result again"). Deliberately built like
    accounts.views.ProfileDetailView: the queryset looks up ANY scan by
    PK, not just request.user's -- IsScanOwner is what actually blocks
    cross-user access. This is what makes "another user's scan ID" a real,
    demoable authorization test rather than something the queryset filter
    quietly prevents from ever being exercised.
    """
    queryset = ScanHistory.objects.select_related(
        "predicted_disease", "predicted_disease__crop", "predicted_disease__recommendation"
    ).all()
    serializer_class = ScanResultSerializer
    permission_classes = [permissions.IsAuthenticated, IsScanOwner]
