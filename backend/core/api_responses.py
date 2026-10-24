"""
Shared fail-soft response helpers for views that proxy a third-party API
(weather, videos, locator, crops' risk alerts).

Cleanup pass (backend restructure + API conventions): every such view
hits the exact same two Response(...) shapes over and over -- a plain
"here's what's wrong with your request" 400, and a plain "the upstream
service is down, try again later" 503 -- using the project's standard
{"detail": ...} body (the DRF-idiomatic key, same one accounts/views.py
was just standardized onto). Extracting these two one-liners removes that
repetition without touching any view's actual parsing/business logic,
which stays exactly where it was.

Deliberately NOT used by accounts/views.py or chatbot/views.py: those
each have a single one-off 400, not the same repeated-many-times pattern
that justifies a shared helper here.
"""
from rest_framework import status
from rest_framework.response import Response


def bad_request(message):
    """400 Bad Request with the project's standard {"detail": ...} shape."""
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


def service_unavailable(message):
    """
    503 Service Unavailable with the project's standard {"detail": ...}
    shape -- used by every view that proxies a third-party API (weather,
    videos, locator, crops' risk alerts) so a missing API key, a network
    failure, or a malformed upstream response all degrade the same way:
    a plain-language message, never a raw 500.
    """
    return Response({"detail": message}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
