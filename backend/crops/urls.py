from django.urls import path
from .views import (
    CropListView, CropDetailView, DiseaseDetailView,
    FarmerCropTrackerListCreateView, FarmerCropTrackerDetailView,
    RiskAlertsView, TodaysTasksView,
)

urlpatterns = [
    path('crops/', CropListView.as_view(), name='crop-list'),
    path('crops/trackers/', FarmerCropTrackerListCreateView.as_view(), name='farmer-crop-tracker-list-create'),
    path('crops/trackers/<int:pk>/', FarmerCropTrackerDetailView.as_view(), name='farmer-crop-tracker-detail'),
    path('crops/risk-alerts/', RiskAlertsView.as_view(), name='risk-alerts'),
    path('crops/tasks/today/', TodaysTasksView.as_view(), name='todays-tasks'),
    path('crops/<int:pk>/', CropDetailView.as_view(), name='crop-detail'),
    path('diseases/<int:pk>/', DiseaseDetailView.as_view(), name='disease-detail'),
]
