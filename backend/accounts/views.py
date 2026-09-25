from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import (
    RegisterSerializer, UserPublicSerializer, ProfileSerializer, CustomTokenObtainPairSerializer,
    ResendVerificationSerializer, EmailVerificationConfirmSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
)
from .permissions import IsProfileOwner
from .throttles import LoginRateThrottle, RegisterRateThrottle, PasswordResetRateThrottle
from .utils import send_verification_email, send_password_reset_email

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    Public registration endpoint.
    Throttled tightly (5/min) since registration spam/abuse is a real attack surface.
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_verification_email(user)
        return Response(
            {
                "message": "Account created. Please check your email to verify your account.",
                "user": UserPublicSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """Login endpoint — issues access + refresh token pair. Throttled against brute force."""
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]


class LogoutView(APIView):
    """
    Logout = blacklist the refresh token so it can never be used again,
    even if it hasn't expired yet.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            # Phase 19 audit fix -- previously this blacklisted ANY refresh
            # token in the request body, as long as the caller had a valid
            # access token of their own (from ANY account). That let an
            # authenticated user force-logout someone else's session just by
            # supplying that other user's refresh token. Only ever blacklist
            # a refresh token that belongs to the caller.
            if str(token.get("user_id")) == str(request.user.id):
                token.blacklist()
        except TokenError:
            pass
        return Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)


class MeView(APIView):
    """'Who am I' — confirms the access token works and returns only the caller's own data."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserPublicSerializer(request.user).data)


class ProfileDetailView(generics.RetrieveUpdateAPIView):
    """
    Retrieve or edit a user profile by ID.
    Deliberately built to look up ANY user by primary key, not just
    request.user — this is what makes the object-level authorization check
    in IsProfileOwner meaningful and testable.
    """
    queryset = User.objects.all()
    serializer_class = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated, IsProfileOwner]


class ResendVerificationView(APIView):
    """
    Resends the verification email.
    Uses the exact same 'always generic' response pattern as password reset.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            user = User.objects.get(email__iexact=email)
            if not user.is_verified:
                send_verification_email(user)
        except User.DoesNotExist:
            pass

        return Response(
            {"message": "If an account with that email exists and is unverified, a new link has been sent."},
            status=status.HTTP_200_OK,
        )


class VerifyEmailConfirmView(APIView):
    """Confirms a user's email using the uid/token pair from the verification link."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.is_verified = True
        user.save(update_fields=["is_verified"])
        return Response({"message": "Email verified successfully. You can now log in."}, status=status.HTTP_200_OK)


class PasswordResetRequestView(APIView):
    """
    'Forgot password' entry point.
    ALWAYS returns the same generic message, whether or not the email exists.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        try:
            user = User.objects.get(email__iexact=email)
            send_password_reset_email(user)
        except User.DoesNotExist:
            pass

        return Response(
            {"message": "If an account with that email exists, a password reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    """
    Sets the new password using the uid/token pair from the reset email.
    The token is single-use by construction: Django's default_token_generator
    folds the password hash into its signature, so this exact token becomes
    invalid the instant the password below is set.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response({"message": "Password reset successfully. You can now log in with your new password."}, status=status.HTTP_200_OK)
