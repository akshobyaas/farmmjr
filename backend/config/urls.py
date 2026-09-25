from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('crops.urls')),
    path('api/', include('scans.urls')),
    path('api/', include('weather.urls')),
    path('api/', include('videos.urls')),
    path('api/', include('locator.urls')),
    path('api/', include('chatbot.urls')),
    path('api/', include('advisory.urls')),
]

if settings.DEBUG:
    # Serve uploaded media files directly in dev. In production this is
    # handled by the web server (nginx, or the hosting platform) instead —
    # Django never serves media files itself outside of DEBUG mode.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
