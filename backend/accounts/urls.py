from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView, CustomTokenObtainPairView, LogoutView, MeView, ProfileDetailView,
    ResendVerificationView, VerifyEmailConfirmView,
    PasswordResetRequestView, PasswordResetConfirmView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('login/refresh/', TokenRefreshView.as_view(), name='login-refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('profile/<int:pk>/', ProfileDetailView.as_view(), name='profile-detail'),

    path('verify-email/resend/', ResendVerificationView.as_view(), name='verify-email-resend'),
    path('verify-email/confirm/', VerifyEmailConfirmView.as_view(), name='verify-email-confirm'),

    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
]
