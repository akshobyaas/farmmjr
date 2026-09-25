from django.urls import path
from .views import AdvisoryQueryListCreateView, AdvisoryQueryDetailView

urlpatterns = [
    path('advisory/queries/', AdvisoryQueryListCreateView.as_view(), name='advisory-list-create'),
    path('advisory/queries/<int:pk>/', AdvisoryQueryDetailView.as_view(), name='advisory-detail'),
]
