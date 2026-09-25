from django.urls import path
from .views import CropListView, CropDetailView, DiseaseDetailView

urlpatterns = [
    path('crops/', CropListView.as_view(), name='crop-list'),
    path('crops/<int:pk>/', CropDetailView.as_view(), name='crop-detail'),
    path('diseases/<int:pk>/', DiseaseDetailView.as_view(), name='disease-detail'),
]
