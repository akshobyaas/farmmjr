from django.urls import path
from .views import ScanUploadView, ScanHistoryListView, ScanHistoryDetailView

urlpatterns = [
    path('scans/upload/', ScanUploadView.as_view(), name='scan-upload'),
    path('scans/history/', ScanHistoryListView.as_view(), name='scan-history-list'),
    path('scans/history/<int:pk>/', ScanHistoryDetailView.as_view(), name='scan-history-detail'),
]
