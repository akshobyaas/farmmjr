"""
Shared image-upload validation, used by both scans.serializers.
ScanUploadSerializer.validate_image and crops.serializers_diary.
FarmingDiaryEntrySerializer.validate_photo.

History: this logic was originally duplicated verbatim in both places —
see the Task 3 comment that used to sit above crops/serializers.py's own
copy of these constants, which deliberately kept the duplication to avoid
scope creep on that feature's own plan ("scans and crops aren't otherwise
coupled, and a shared-module extraction for one validator is out of scope
for this plan"). That reasoning was sound for that plan's narrow scope, but
it doesn't hold here: crops/serializers.py already imports from scans
(`from scans import ml_model`), so crops already depends on scans, and this
cleanup pass's whole purpose is removing exactly this kind of duplication
now that there's a plan whose scope actually covers it.
"""
import uuid

from PIL import Image
from rest_framework import serializers

MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
ALLOWED_PIL_FORMATS = {"JPEG", "PNG"}


def validate_and_sanitize_image(value, *, allow_none=False):
    """
    Validate an uploaded image file and return it with its filename replaced
    by a random UUID plus the verified extension (never trust or reuse the
    client-supplied filename).

    Raises serializers.ValidationError on: a file over MAX_UPLOAD_SIZE_BYTES,
    a disallowed content-type, a file that doesn't actually parse as a JPEG/
    PNG image (the real check -- catches a malicious file renamed to end in
    .jpg, which a content-type/filename check alone would miss), or `None`
    when allow_none is False (the default). When allow_none is True, `None`
    passes straight through unchanged -- used by FarmingDiaryEntrySerializer,
    where a diary entry's photo is optional.
    """
    if value is None:
        if allow_none:
            return value
        raise serializers.ValidationError("No image file was submitted.")

    # --- Size check ---
    if value.size > MAX_UPLOAD_SIZE_BYTES:
        raise serializers.ValidationError(
            f"Image too large. Maximum size is {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."
        )

    # --- Content-type check (first line of defense only) ---
    content_type = getattr(value, "content_type", None)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        raise serializers.ValidationError("Only JPEG and PNG images are allowed.")

    # --- Real validation: actually parse the file as an image ---
    # This is what catches a malicious file renamed to end in .jpg --
    # Pillow will fail to parse it regardless of filename/claimed type.
    try:
        value.seek(0)
        img = Image.open(value)
        img.verify()
        detected_format = img.format
    except Exception:
        raise serializers.ValidationError("This file is not a valid image.")
    finally:
        value.seek(0)  # reset pointer so Django can still read+save the raw bytes after this

    if detected_format not in ALLOWED_PIL_FORMATS:
        raise serializers.ValidationError("Only JPEG and PNG images are allowed.")

    # --- Filename sanitization ---
    # Never trust or reuse the client-supplied filename. Replace it
    # entirely with a random UUID plus the VERIFIED extension.
    ext = ".jpg" if detected_format == "JPEG" else ".png"
    value.name = f"{uuid.uuid4().hex}{ext}"

    return value
