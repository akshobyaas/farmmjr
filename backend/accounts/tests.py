"""
Phase 20 — formal automated test suite for the accounts app.

This converts the manual curl checks done live in Phases 1-6 and 19 into a
permanent, repeatable regression suite: registration, login, logout,
profile ownership/authorization, email verification, and password reset.

Uses DRF's APITestCase (Django's TestCase + an API-friendly client) rather
than pytest-django, matching the phase plan's "Django TestCase" option and
avoiding a new test-runner dependency.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .tokens import email_verification_token, password_reset_token

User = get_user_model()


def make_user(username="farmer_ravi", email="ravi@example.com", password="FarmerPass#123",
              role=User.Role.FARMER, is_verified=True):
    user = User.objects.create_user(username=username, email=email, password=password, role=role)
    user.is_verified = is_verified
    user.save(update_fields=["is_verified"])
    return user


class RegistrationTests(APITestCase):
    def setUp(self):
        cache.clear()  # register/ is throttled (5/min) -- don't let tests throttle each other
        self.url = reverse("register")
        self.valid_payload = {
            "username": "new_farmer",
            "email": "new_farmer@example.com",
            "password": "StrongPass#123",
            "password_confirm": "StrongPass#123",
            "role": "farmer",
        }

    def test_valid_registration_creates_unverified_user(self):
        response = self.client.post(self.url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="new_farmer")
        self.assertFalse(user.is_verified)

    def test_password_is_never_returned_in_the_response(self):
        response = self.client.post(self.url, self.valid_payload, format="json")
        self.assertNotIn("password", str(response.data))

    def test_duplicate_username_rejected(self):
        make_user(username="new_farmer")
        response = self.client.post(self.url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_rejected(self):
        make_user(email="new_farmer@example.com")
        response = self.client.post(self.url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mismatched_passwords_rejected(self):
        payload = {**self.valid_payload, "password_confirm": "SomethingElse#1"}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_rejected(self):
        # Purely numeric -- Django's NumericPasswordValidator should reject it.
        payload = {**self.valid_payload, "password": "12345678", "password_confirm": "12345678"}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mass_assignment_cannot_self_grant_admin_role_at_registration(self):
        payload = {**self.valid_payload, "role": "admin"}
        self.client.post(self.url, payload, format="json")
        user = User.objects.get(username="new_farmer")
        # Whatever the registration flow does with an explicit "role" field,
        # it must never let a brand-new signup become an admin.
        self.assertNotEqual(user.role, User.Role.ADMIN)


class LoginTests(APITestCase):
    def setUp(self):
        cache.clear()  # login/ is throttled (5/min) -- don't let tests throttle each other
        self.url = reverse("login")
        self.user = make_user()

    def test_correct_credentials_succeed(self):
        response = self.client.post(self.url, {"username": "farmer_ravi", "password": "FarmerPass#123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_wrong_password_and_unknown_username_give_the_identical_generic_message(self):
        wrong_pw = self.client.post(self.url, {"username": "farmer_ravi", "password": "wrong"}, format="json")
        unknown_user = self.client.post(self.url, {"username": "nobody_here", "password": "wrong"}, format="json")
        self.assertEqual(wrong_pw.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(unknown_user.status_code, status.HTTP_401_UNAUTHORIZED)
        # No user-enumeration: identical message either way.
        self.assertEqual(wrong_pw.data["detail"], unknown_user.data["detail"])

    def test_unverified_user_is_blocked_with_a_specific_code(self):
        make_user(username="unverified_farmer", email="uv@example.com", is_verified=False)
        response = self.client.post(self.url, {"username": "unverified_farmer", "password": "FarmerPass#123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # DRF wraps each dict value from the raised ValidationError in a list
        # of ErrorDetail -- this is the same shape LoginPage.jsx already
        # reads (`err.response.data.code?.[0]`).
        self.assertEqual(response.data["code"][0], "email_not_verified")


class LogoutTests(APITestCase):
    """Includes the Phase 19 audit fix as a permanent regression test."""

    def setUp(self):
        self.user = make_user()
        self.other = make_user(username="farmer_asha", email="asha@example.com")
        self.url = reverse("logout")
        self.refresh_url = reverse("login-refresh")

    def _tokens_for(self, user):
        refresh = RefreshToken.for_user(user)
        return str(refresh), str(refresh.access_token)

    def test_logout_blacklists_own_refresh_token(self):
        refresh, access = self._tokens_for(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post(self.url, {"refresh": refresh}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        refresh_response = self.client.post(self.refresh_url, {"refresh": refresh}, format="json")
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_refresh_token_is_a_400(self):
        _, access = self._tokens_for(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_user_cannot_blacklist_another_users_refresh_token(self):
        """
        Phase 19 audit finding, now a permanent regression test: an
        authenticated user must not be able to force-logout someone else's
        session just by supplying that other user's refresh token.
        """
        other_refresh, _ = self._tokens_for(self.other)
        _, my_access = self._tokens_for(self.user)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {my_access}")
        response = self.client.post(self.url, {"refresh": other_refresh}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)  # endpoint still "succeeds" (fails quiet)

        # The other user's token must still be usable -- it was NOT blacklisted.
        refresh_response = self.client.post(self.refresh_url, {"refresh": other_refresh}, format="json")
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)


class MeViewTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.url = reverse("me")

    def test_authenticated_user_sees_own_data(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "farmer_ravi")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ProfileAuthorizationTests(APITestCase):
    """Phase 6's object-level authorization, kept as a permanent regression test."""

    def setUp(self):
        self.user = make_user()
        self.other = make_user(username="farmer_asha", email="asha@example.com")
        self.own_url = reverse("profile-detail", args=[self.user.id])
        self.other_url = reverse("profile-detail", args=[self.other.id])

    def test_owner_can_view_and_edit_own_profile(self):
        self.client.force_authenticate(self.user)
        get_response = self.client.get(self.own_url)
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)

        patch_response = self.client.patch(self.own_url, {"first_name": "Ravi"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Ravi")

    def test_non_owner_cannot_view_or_edit_someone_elses_profile(self):
        self.client.force_authenticate(self.user)
        get_response = self.client.get(self.other_url)
        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)

        patch_response = self.client.patch(self.other_url, {"first_name": "Hacked"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.other.refresh_from_db()
        self.assertNotEqual(self.other.first_name, "Hacked")

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(self.own_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_mass_assignment_cannot_self_promote_to_admin(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(self.own_url, {"role": "admin"}, format="json")
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.FARMER)


class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.user = make_user(is_verified=False)
        self.url = reverse("verify-email-confirm")

    def test_valid_token_verifies_the_account(self):
        token = email_verification_token.make_token(self.user)
        payload = {"uid": self._uidb64(self.user), "token": token}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_verified)

    def test_invalid_token_is_rejected(self):
        payload = {"uid": self._uidb64(self.user), "token": "not-a-real-token"}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_verified)

    @staticmethod
    def _uidb64(user):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        return urlsafe_base64_encode(force_bytes(user.pk))


class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()  # password-reset/request/ is throttled (3/min)
        self.user = make_user()
        self.request_url = reverse("password-reset-request")
        self.confirm_url = reverse("password-reset-confirm")

    def test_reset_request_gives_identical_generic_message_for_real_and_fake_emails(self):
        real = self.client.post(self.request_url, {"email": "ravi@example.com"}, format="json")
        fake = self.client.post(self.request_url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(real.status_code, status.HTTP_200_OK)
        self.assertEqual(fake.status_code, status.HTTP_200_OK)
        self.assertEqual(real.data["message"], fake.data["message"])

    def test_confirm_sets_new_password_and_the_token_is_then_single_use(self):
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        uidb64 = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = password_reset_token.make_token(self.user)

        payload = {
            "uid": uidb64, "token": token,
            "new_password": "BrandNewPass#123", "new_password_confirm": "BrandNewPass#123",
        }
        response = self.client.post(self.confirm_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # New password actually works.
        login = self.client.post(reverse("login"), {"username": "farmer_ravi", "password": "BrandNewPass#123"}, format="json")
        self.assertEqual(login.status_code, status.HTTP_200_OK)

        # The same uid/token is now stale -- Django's token generator folds
        # the password hash into its signature, so reusing it must fail.
        replay = self.client.post(self.confirm_url, payload, format="json")
        self.assertEqual(replay.status_code, status.HTTP_400_BAD_REQUEST)
