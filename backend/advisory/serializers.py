from rest_framework import serializers
from .models import AdvisoryQuery

MAX_QUESTION_LENGTH = 1000
MAX_RESPONSE_LENGTH = 2000


class AdvisoryQuerySerializer(serializers.ModelSerializer):
    farmer_username = serializers.CharField(source="farmer.username", read_only=True)

    class Meta:
        model = AdvisoryQuery
        fields = [
            "id", "farmer", "farmer_username", "question", "response",
            "status", "created_at", "answered_at",
        ]
        read_only_fields = ["id", "farmer", "status", "created_at", "answered_at"]


class AdvisoryQueryCreateSerializer(serializers.ModelSerializer):
    """
    Deliberately exposes only `question`. `farmer` is set server-side from
    the authenticated request in the view (never trusted from the client
    body), and `status`/`answered_at` always start at their model defaults
    -- the same mass-assignment protection pattern used for role/username
    on the Phase 6 profile endpoint.
    """

    class Meta:
        model = AdvisoryQuery
        fields = ["id", "question", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def validate_question(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Please enter your question.")
        return cleaned[:MAX_QUESTION_LENGTH]


class AdvisoryQueryAnswerSerializer(serializers.ModelSerializer):
    """Used only by an admin/expert to answer a query (see IsAdminExpert)."""

    class Meta:
        model = AdvisoryQuery
        fields = ["id", "response", "status", "answered_at"]
        read_only_fields = ["id", "status", "answered_at"]

    def validate_response(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Please enter a response.")
        return cleaned[:MAX_RESPONSE_LENGTH]
