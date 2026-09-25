from django.contrib import admin
from .models import AdvisoryQuery


@admin.register(AdvisoryQuery)
class AdvisoryQueryAdmin(admin.ModelAdmin):
    list_display = ("farmer", "status", "created_at", "answered_at")
    list_filter = ("status",)
    readonly_fields = ("created_at",)
