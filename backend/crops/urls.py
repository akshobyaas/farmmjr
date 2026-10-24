from django.urls import path
from .views_catalog import CropListView, CropDetailView, DiseaseDetailView
from .views_diary import FarmingDiaryEntryListCreateView, FarmingDiaryEntryDetailView
from .views_risk_alerts import RiskAlertsView
from .views_tasks import TodaysTasksView
from .views_tracker import FarmerCropTrackerListCreateView, FarmerCropTrackerDetailView

urlpatterns = [
    path('crops/', CropListView.as_view(), name='crop-list'),
    path('crops/trackers/', FarmerCropTrackerListCreateView.as_view(), name='farmer-crop-tracker-list-create'),
    path('crops/trackers/<int:pk>/', FarmerCropTrackerDetailView.as_view(), name='farmer-crop-tracker-detail'),
    path('crops/diary/', FarmingDiaryEntryListCreateView.as_view(), name='farming-diary-list-create'),
    path('crops/diary/<int:pk>/', FarmingDiaryEntryDetailView.as_view(), name='farming-diary-detail'),
    path('crops/risk-alerts/', RiskAlertsView.as_view(), name='risk-alerts'),
    path('crops/tasks/today/', TodaysTasksView.as_view(), name='todays-tasks'),
    path('crops/<int:pk>/', CropDetailView.as_view(), name='crop-detail'),
    path('diseases/<int:pk>/', DiseaseDetailView.as_view(), name='disease-detail'),
]
