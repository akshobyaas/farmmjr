from django.contrib import admin
from .models import ScanHistory


@admin.register(ScanHistory)
class ScanHistoryAdmin(admin.ModelAdmin):
    list_display = ("user", "predicted_disease", "confidence", "created_at")
    list_filter = ("predicted_disease__crop",)
    readonly_fields = ("created_at",)
