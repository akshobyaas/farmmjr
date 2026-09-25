"""
Phase 20 — formal automated test suite for the scans app.

Covers Phase 8's secure upload validation and Phase 12's ownership-based
authorization for scan history. `ml_model.predict`/`disease_lookup` are
mocked throughout -- this suite is about the upload/authorization boundary,
not re-testing the CNN itself (that's Phase 9/10's own concern, and loading
the real TensorFlow model is too slow for a unit-test suite anyway).
"""
import io
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ScanHistory

User = get_user_model()
TEST_MEDIA_ROOT = tempfile.mkdtemp()


def make_user(username="farmer_ravi", email="ravi@example.com"):
    user = User.objects.create_user(username=username, email=email, password="FarmerPass#123")
    user.is_verified = True
    user.save(update_fields=["is_verified"])
    return user


def make_test_image(fmt="JPEG"):
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color="green").save(buf, format=fmt)
    buf.seek(0)
    content_type = "image/jpeg" if fmt == "JPEG" else "image/png"
    return SimpleUploadedFile(f"upload.{fmt.lower()}", buf.read(), content_type=content_type)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
@patch("scans.views.ml_model.disease_lookup", return_value=None)
@patch("scans.views.ml_model.predict", return_value=(None, None))
class ScanUploadTests(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.url = reverse("scan-upload")

    def test_valid_jpeg_upload_succeeds(self, mock_predict, mock_lookup):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {"image": make_test_image("JPEG")}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ScanHistory.objects.count(), 1)
        self.assertEqual(ScanHistory.objects.first().user, self.user)

    def test_upload_is_renamed_server_side_never_trusts_client_filename(self, mock_predict, mock_lookup):
        self.client.force_authenticate(self.user)
        img_buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(img_buf, format="JPEG")
        malicious = SimpleUploadedFile("../../../../etc/passwd.jpg", img_buf.getvalue(), content_type="image/jpeg")
        response = self.client.post(self.url, {"image": malicious}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        stored_name = ScanHistory.objects.first().image.name
        self.assertNotIn("etc/passwd", stored_name)
        self.assertNotIn("..", stored_name)

    def test_non_image_file_disguised_with_jpg_extension_is_rejected(self, mock_predict, mock_lookup):
        self.client.force_authenticate(self.user)
        fake = SimpleUploadedFile("not_really_an_image.jpg", b"this is just text, not image bytes", content_type="image/jpeg")
        response = self.client.post(self.url, {"image": fake}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ScanHistory.objects.count(), 0)

    def test_oversized_image_is_rejected(self, mock_predict, mock_lookup):
        self.client.force_authenticate(self.user)
        # JPEG compression makes it hard to reliably force a file over 5MB
        # by pixel content alone, so start from a small valid JPEG and pad
        # it past the limit with COM (comment) segments -- still a
        # perfectly valid, parseable JPEG, just a large one.
        img_buf = io.BytesIO()
        Image.new("RGB", (32, 32), color="green").save(img_buf, format="JPEG")
        jpeg_bytes = img_buf.getvalue()
        padding = b""
        while len(jpeg_bytes) + len(padding) < 6 * 1024 * 1024:
            chunk_len = 65533  # max COM segment payload+length-field size
            padding += b"\xff\xfe" + chunk_len.to_bytes(2, "big") + (b"\x00" * (chunk_len - 2))
        # Insert the padding right after the SOI marker (first 2 bytes).
        padded = jpeg_bytes[:2] + padding + jpeg_bytes[2:]
        self.assertGreater(len(padded), 5 * 1024 * 1024, "padded JPEG wasn't actually over 5MB")
        oversized = SimpleUploadedFile("big.jpg", padded, content_type="image/jpeg")
        response = self.client.post(self.url, {"image": oversized}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_upload_is_rejected(self, mock_predict, mock_lookup):
        response = self.client.post(self.url, {"image": make_test_image("JPEG")}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ScanHistoryAuthorizationTests(APITestCase):
    """Phase 12's ownership boundary, kept as a permanent regression test."""

    def setUp(self):
        self.user = make_user()
        self.other = make_user(username="farmer_asha", email="asha@example.com")
        self.own_scan = ScanHistory.objects.create(user=self.user)
        self.other_scan = ScanHistory.objects.create(user=self.other)

    def test_history_list_only_shows_own_scans(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("scan-history-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data["results"]]
        self.assertIn(self.own_scan.id, ids)
        self.assertNotIn(self.other_scan.id, ids)

    def test_cannot_view_another_users_scan_detail(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("scan-history-detail", args=[self.other_scan.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_can_view_own_scan_detail(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("scan-history-detail", args=[self.own_scan.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unauthenticated_history_access_is_rejected(self):
        response = self.client.get(reverse("scan-history-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
