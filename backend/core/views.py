from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@permission_classes([AllowAny])  # public health-check endpoint only
def ping(request):
    """
    Simple connectivity check for Phase 1.
    Confirms Django is running and reachable from the React frontend.
    """
    return Response({
        "status": "ok",
        "message": "Smart Farming backend is running.",
    })
