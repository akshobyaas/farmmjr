from django.urls import path
from .views import WeatherView, WeatherForecastView

urlpatterns = [
    path('weather/', WeatherView.as_view(), name='weather'),
    path('weather/forecast/', WeatherForecastView.as_view(), name='weather-forecast'),
]
