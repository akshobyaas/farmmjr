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
    """

    class Meta:
        model = CropTask
        fields = ["id", "category", "instruction"]
