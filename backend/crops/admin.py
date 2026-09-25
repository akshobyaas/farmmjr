from django.contrib import admin
from .models import Crop, Disease, Recommendation, FertilizerSchedule, Lifecycle, OrganicManureMethod


class DiseaseInline(admin.TabularInline):
    model = Disease
    extra = 0


class FertilizerScheduleInline(admin.TabularInline):
    model = FertilizerSchedule
    extra = 0


class LifecycleInline(admin.TabularInline):
    model = Lifecycle
    extra = 0


@admin.register(Crop)
class CropAdmin(admin.ModelAdmin):
    list_display = ("name", "soil_type", "climate")
    search_fields = ("name",)
    filter_horizontal = ("intercropped_with",)
    inlines = [DiseaseInline, FertilizerScheduleInline, LifecycleInline]


@admin.register(Disease)
class DiseaseAdmin(admin.ModelAdmin):
    list_display = ("name", "crop")
    list_filter = ("crop",)
    search_fields = ("name",)


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ("disease",)


@admin.register(FertilizerSchedule)
class FertilizerScheduleAdmin(admin.ModelAdmin):
    list_display = ("crop", "growth_stage", "order")
    list_filter = ("crop",)


@admin.register(Lifecycle)
class LifecycleAdmin(admin.ModelAdmin):
    list_display = ("crop", "stage", "order")
    list_filter = ("crop",)


@admin.register(OrganicManureMethod)
class OrganicManureMethodAdmin(admin.ModelAdmin):
    list_display = ("name",)
    filter_horizontal = ("crops",)
