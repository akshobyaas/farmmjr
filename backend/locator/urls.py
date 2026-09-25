from django.urls import path
from .views import NearbyServicesView

urlpatterns = [
    path('locator/nearby/', NearbyServicesView.as_view(), name='locator-nearby'),
]
