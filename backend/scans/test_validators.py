"""
Cleanup pass (dead-code/naming/error-handling audit): tests for the shared
image-validation helper extracted from ScanUploadSerializer.validate_image
and crops.serializers_diary.FarmingDiaryEntrySerializer.validate_photo, which
were previously deliberately duplicated (see the Task 3 comment history in
crops/serializers.py, since split into crops/serializers_diary.py) but are
now worth sharing since this cleanup pass's
whole point is removing exactly this kind of duplication.
"""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from PIL import Image
from rest_framework import serializers

from .validators import validate_and_sanitize_image


def make_image_file(fmt="JPEG", name="photo.jpg", size=(10, 10)):
    buf = io.BytesIO()
    Image.new("RGB", size).save(buf, format=fmt)
    buf.seek(0)
    content_type = "image/jpeg" if fmt == "JPEG" else "image/png"
    return SimpleUploadedFile(name, buf.read(), content_type=content_type)


class ValidateAndSanitizeImageTests(SimpleTestCase):
    def test_accepts_a_real_jpeg_and_sanitizes_its_filename(self):
        f = make_image_file("JPEG", name="not-a-uuid.jpg")
        result = validate_and_sanitize_image(f)
        self.assertTrue(result.name.endswith(".jpg"))
        self.assertNotEqual(result.name, "not-a-uuid.jpg")

    def test_accepts_a_real_png(self):
        f = make_image_file("PNG", name="photo.png")
        result = validate_and_sanitize_image(f)
        self.assertTrue(result.name.endswith(".png"))

    def test_rejects_a_file_too_large(self):
        f = make_image_file("JPEG")
        f.size = 6 * 1024 * 1024  # over the 5MB limit
        with self.assertRaises(serializers.ValidationError):
            validate_and_sanitize_image(f)

    def test_rejects_a_disallowed_content_type(self):
        f = make_image_file("JPEG")
        f.content_type = "application/pdf"
        with self.assertRaises(serializers.ValidationError):
            validate_and_sanitize_image(f)

    def test_rejects_a_file_that_is_not_really_an_image(self):
        f = SimpleUploadedFile("fake.jpg", b"not actually image bytes", content_type="image/jpeg")
        with self.assertRaises(serializers.ValidationError):
            validate_and_sanitize_image(f)

    def test_none_raises_by_default(self):
        with self.assertRaises(serializers.ValidationError):
            validate_and_sanitize_image(None)

    def test_none_passes_through_when_allow_none(self):
        self.assertIsNone(validate_and_sanitize_image(None, allow_none=True))
