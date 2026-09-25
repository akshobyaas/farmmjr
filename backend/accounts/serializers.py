import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .tokens import email_verification_token, password_reset_token

User = get_user_model()

# Phase 19 audit -- structured auth-event logging. Only the username (an
# identifier, not a secret) is ever logged -- never the password, and never
# the issued token.
auth_logger = logging.getLogger("smartfarming.auth")


class RegisterSerializer(serializers.ModelSerializer):
    """
    Handles new account creation.
    Password is write_only so it can NEVER accidentally appear in a response —
    verified explicitly in tests, not just assumed from this flag.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],  # runs Django's full AUTH_PASSWORD_VALIDATORS chain
        style={"input_type": "password"},
    )
    password_confirm = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        # Phase 20 audit fix -- "role" is deliberately NOT in this list.
        # It used to be, which meant the public, unauthenticated
        # registration endpoint let anyone self-register as role="admin"
        # and instantly gain Admin/Expert privileges (e.g. answering other
        # farmers' advisory queries) -- caught by an automated test, not by
        # the Phase 19 manual audit, which only checked mass-assignment on
        # PATCH/profile and POST/advisory, not POST/register itself. Every
        # self-registered account is always a farmer; admin/expert accounts
        # are created only via the Django admin or seed data, never here.
        fields = [
            "username", "email", "password", "password_confirm",
            "preferred_language", "phone_number",
        ]
        extra_kwargs = {
            "email": {"required": True},
        }

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        # role is always farmer for public self-registration -- see the
        # Meta.fields comment above.
        validated_data["role"] = User.Role.FARMER
        # create_user() handles hashing correctly — never hash manually
        user = User.objects.create_user(password=password, **validated_data)
        return user


class UserPublicSerializer(serializers.ModelSerializer):
    """Safe-to-expose user fields — used for 'who am I' responses. No password, ever."""

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "preferred_language", "phone_number", "is_verified"]
        read_only_fields = fields


class ProfileSerializer(serializers.ModelSerializer):
    """
    Used for the profile view/edit endpoint.
    Only first_name, last_name, phone_number, and preferred_language are
    editable — username, email, role, and verification status are all
    read-only here.
    """

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "phone_number", "preferred_language", "role", "is_verified",
        ]
        read_only_fields = ["id", "username", "email", "role", "is_verified"]


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends SimpleJWT's default login serializer.
    We deliberately do NOT customize the error message for wrong username/password —
    SimpleJWT's default ("No active account found with the given credentials") is
    already appropriately generic and does not reveal whether the email exists or
    the password was wrong.

    We DO add a verification gate after the fact: at this point the user has
    already proven they know the correct password, so telling them specifically
    "please verify your email" does not leak anything an attacker couldn't
    already infer.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        username = attrs.get(self.username_field, "")
        try:
            data = super().validate(attrs)  # raises the generic error if credentials are wrong
        except Exception:
            # SimpleJWT's base validate() raises AuthenticationFailed (not
            # DRF's ValidationError) for bad credentials -- catch broadly so
            # every failed-login path is actually logged.
            auth_logger.warning("Login failed for username=%r", username)
            raise
        if not self.user.is_verified:
            auth_logger.info("Login blocked (unverified email) for username=%r", username)
            raise serializers.ValidationError(
                {"detail": "Please verify your email address before logging in.",
                 "code": "email_not_verified"}
            )
        auth_logger.info("Login succeeded for username=%r", username)
        return data


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()


class EmailVerificationConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError("This verification link is invalid.")

        if not email_verification_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError("This verification link is invalid or has expired.")

        attrs["user"] = user
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Passwords do not match."})

        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError("This reset link is invalid.")

        if not password_reset_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError("This reset link is invalid or has expired.")

        attrs["user"] = user
        return attrs
