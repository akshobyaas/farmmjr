"""
Phase 20 — formal automated test suite for the accounts app.

This converts the manual curl checks done live in Phases 1-6 and 19 into a
permanent, repeatable regression suite: registration, login, logout,
profile ownership/authorization, email verification, and password reset.

Uses DRF's APITestCase (Django's TestCase + an API-friendly client) rather
than pytest-django, matching the phase plan's "Django TestCase" option and
avoiding a new test-runner dependency.
"""
from smtplib import SMTPException
from unittest import mock

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

    def test_can_log_in_with_email_instead_of_username(self):
        response = self.client.post(self.url, {"username": "ravi@example.com", "password": "FarmerPass#123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_with_email_is_case_insensitive(self):
        response = self.client.post(self.url, {"username": "RAVI@Example.com", "password": "FarmerPass#123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unknown_email_gives_the_identical_generic_message_as_wrong_password(self):
        wrong_pw = self.client.post(self.url, {"username": "farmer_ravi", "password": "wrong"}, format="json")
        unknown_email = self.client.post(self.url, {"username": "nobody@example.com", "password": "wrong"}, format="json")
        self.assertEqual(unknown_email.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(wrong_pw.data["detail"], unknown_email.data["detail"])

    def test_correct_email_but_wrong_password_is_rejected(self):
        response = self.client.post(self.url, {"username": "ravi@example.com", "password": "wrong"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


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

    def test_response_includes_first_and_last_name(self):
        # Bug: the dashboard greets the user by first_name, falling back to
        # username only when first_name is unset. That fallback was firing
        # on every fresh login/page-load, even for users who *had* a saved
        # first/last name -- because /auth/me/ (hit on login and on every
        # session restore) never returned those fields at all, only the
        # profile PATCH endpoint did. So the dashboard showed the username
        # until the user visited Profile and pressed Save, which refreshed
        # AuthContext's user object from the profile endpoint instead.
        self.user.first_name = "Ravi"
        self.user.last_name = "Kumar"
        self.user.save(update_fields=["first_name", "last_name"])
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["first_name"], "Ravi")
        self.assertEqual(response.data["last_name"], "Kumar")


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
        # `role` is read_only on ProfileSerializer, so DRF silently drops it
        # from a PATCH rather than rejecting the request — the call should
        # still succeed normally, just without changing role. Without this
        # assertion the test would pass even if the endpoint started
        # returning an unrelated error for every request.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.FARMER)

    def test_farmer_can_set_their_own_home_location(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(self.own_url, {"home_location": "Puttur"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.home_location, "Puttur")

    def test_home_location_defaults_to_blank(self):
        self.assertEqual(self.user.home_location, "")


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


class ChangeUnverifiedEmailTests(APITestCase):
    def setUp(self):
        cache.clear()  # this endpoint reuses the password-reset throttle scope
        self.user = make_user(email="typo@example.com", is_verified=False)
        self.other_verified = make_user(
            username="farmer_asha", email="asha@example.com", is_verified=True,
        )
        self.url = reverse("verify-email-change-email")

    def _post(self, **overrides):
        payload = {
            "username": "farmer_ravi", "password": "FarmerPass#123",
            "new_email": "corrected@example.com",
        }
        payload.update(overrides)
        return self.client.post(self.url, payload, format="json")

    def test_correct_credentials_update_email_and_send_a_new_verification_link(self):
        from django.core import mail

        mail.outbox = []
        response = self._post()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "corrected@example.com")
        self.assertFalse(self.user.is_verified)  # still needs to click the new link

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["corrected@example.com"])

    def test_wrong_password_gives_a_generic_error_and_changes_nothing(self):
        response = self._post(password="WrongPass#123")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "typo@example.com")

    def test_unknown_username_gives_the_identical_generic_error(self):
        wrong_password = self._post(password="WrongPass#123")
        unknown_user = self._post(username="nobody_here")
        self.assertEqual(wrong_password.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unknown_user.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wrong_password.data["non_field_errors"], unknown_user.data["non_field_errors"])

    def test_already_verified_account_is_rejected_and_changes_nothing(self):
        response = self._post(username="farmer_asha", password="FarmerPass#123", new_email="new@example.com")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.other_verified.refresh_from_db()
        self.assertEqual(self.other_verified.email, "asha@example.com")

    def test_email_already_used_by_another_account_is_rejected(self):
        response = self._post(new_email="asha@example.com")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "typo@example.com")

    def test_mass_assignment_cannot_change_role_or_verification_status_through_this_endpoint(self):
        response = self._post(role="admin", is_verified=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.FARMER)
        self.assertFalse(self.user.is_verified)


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
        self.assertEqual(real.data["detail"], fake.data["detail"])

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


class FindAccountTests(APITestCase):
    def setUp(self):
        cache.clear()  # find-account/ is throttled, same as password-reset/request/
        self.user = make_user()
        self.url = reverse("find-account")

    def test_find_account_gives_identical_generic_message_for_real_and_fake_emails(self):
        real = self.client.post(self.url, {"email": "ravi@example.com"}, format="json")
        fake = self.client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(real.status_code, status.HTTP_200_OK)
        self.assertEqual(fake.status_code, status.HTTP_200_OK)
        self.assertEqual(real.data["detail"], fake.data["detail"])

    def test_find_account_emails_the_username_when_the_account_exists(self):
        from django.core import mail

        self.client.post(self.url, {"email": "ravi@example.com"}, format="json")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("farmer_ravi", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to, ["ravi@example.com"])

    def test_find_account_sends_no_email_when_the_address_is_unknown(self):
        from django.core import mail

        self.client.post(self.url, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(len(mail.outbox), 0)

    def test_find_account_rejects_a_malformed_email(self):
        response = self.client.post(self.url, {"email": "not-an-email"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class EmailFailSoftTests(APITestCase):
    """
    A broken mail server (timeout, auth failure, DNS blip -- anything
    send_mail can raise) must never surface as a 500, and must never leave
    account state changed with no success response reaching the user.
    Mirrors the fail-soft pattern advisory/utils.py's
    notify_admins_of_pending_query already uses for the same reason:
    "a broken mail server should never block" the user-facing action.
    """

    def setUp(self):
        cache.clear()

    def test_registration_succeeds_even_when_sending_the_verification_email_fails(self):
        payload = {
            "username": "flaky_mail_farmer",
            "email": "flaky@example.com",
            "password": "StrongPass#123",
            "password_confirm": "StrongPass#123",
            "role": "farmer",
        }
        with mock.patch("accounts.utils.send_mail", side_effect=SMTPException("boom")):
            response = self.client.post(reverse("register"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="flaky_mail_farmer").exists())

    def test_resend_verification_still_returns_generic_response_when_send_fails(self):
        make_user(username="unverified_farmer", email="unverified@example.com", is_verified=False)
        with mock.patch("accounts.utils.send_mail", side_effect=SMTPException("boom")):
            response = self.client.post(
                reverse("verify-email-resend"), {"email": "unverified@example.com"}, format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_change_unverified_email_keeps_the_new_address_even_if_sending_fails(self):
        user = make_user(email="typo@example.com", is_verified=False)
        with mock.patch("accounts.utils.send_mail", side_effect=SMTPException("boom")):
            response = self.client.post(
                reverse("verify-email-change-email"),
                {"username": "farmer_ravi", "password": "FarmerPass#123", "new_email": "fixed@example.com"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertEqual(user.email, "fixed@example.com")

    def test_password_reset_request_still_returns_generic_response_when_send_fails(self):
        make_user(email="ravi@example.com")
        with mock.patch("accounts.utils.send_mail", side_effect=SMTPException("boom")):
            response = self.client.post(
                reverse("password-reset-request"), {"email": "ravi@example.com"}, format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_find_account_still_returns_generic_response_when_send_fails(self):
        make_user(email="ravi@example.com")
        with mock.patch("accounts.utils.send_mail", side_effect=SMTPException("boom")):
            response = self.client.post(
                reverse("find-account"), {"email": "ravi@example.com"}, format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
