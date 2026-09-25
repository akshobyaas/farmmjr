from rest_framework import generics, permissions
from .models import Crop, Disease
from .serializers import CropListSerializer, CropDetailSerializer, DiseaseDetailSerializer

MAX_SEARCH_LENGTH = 100  # a crop name will never legitimately be longer than this


class CropListView(generics.ListAPIView):
    """
    Public, read-only crop catalog. ListAPIView only ever exposes GET.
    Supports ?search=<name> for basic filtering, passed through Django's
    ORM (icontains) which parameterizes the query automatically.
    """
    serializer_class = CropListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Crop.objects.all()
        search = self.request.query_params.get("search", "").strip()[:MAX_SEARCH_LENGTH]
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset


class CropDetailView(generics.RetrieveAPIView):
    """Public, read-only single-crop detail. GET-only by construction."""
    queryset = Crop.objects.all()
    serializer_class = CropDetailSerializer
    permission_classes = [permissions.AllowAny]


class DiseaseDetailView(generics.RetrieveAPIView):
    """
    Phase 11 -- public, read-only: given a disease ID, return its full
    recommendation. GET-only by construction, same as the crop endpoints.
    Used directly by the scan result flow (Phase 10 already nests this
    data in the upload response) and available standalone for anything
    that only has a disease ID (e.g. a future crop disease list page).
    """
    queryset = Disease.objects.select_related("crop", "recommendation").all()
    serializer_class = DiseaseDetailSerializer
    permission_classes = [permissions.AllowAny]
