import hashlib
import re
import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .throttles import VideoSearchRateThrottle

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
REQUEST_TIMEOUT_SECONDS = 6
MAX_QUERY_LENGTH = 100
MAX_RESULTS = 10
CACHE_TIMEOUT_SECONDS = 600  # 10 minutes -- short enough that results stay
# fresh, long enough that the same crop/topic searched repeatedly by
# different farmers only costs our YouTube quota once.

# Basic sanitization only -- this is a query-string parameter (requests
# URL-encodes it for us, so it's not an injection vector into the HTTP
# request itself). The goal here is just to strip control characters and
# collapse whitespace before it's used as a cache key and sent onward.
_WHITESPACE_RE = re.compile(r"\s+")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _sanitize_query(raw):
    cleaned = _CONTROL_CHARS_RE.sub("", raw or "")
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned[:MAX_QUERY_LENGTH]


class VideoSearchView(APIView):
    """
    Phase 14 -- proxies the YouTube Data API v3 so the API key never
    reaches the browser. Searches by crop name or free-text topic keyword
    (?q=), e.g. from the Learning Videos page directly, or pre-filled from
    a "Watch related videos" link on a crop's detail page.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [VideoSearchRateThrottle]

    def get(self, request):
        query = _sanitize_query(request.query_params.get("q", ""))

        if not query:
            return Response(
                {"detail": "Please enter a crop name or topic to search for."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Hash the normalized query for the cache key -- spaces/punctuation
        # in a raw query aren't safe memcached key characters (Django warns
        # about this), and a fixed-length key avoids any length limit too.
        query_hash = hashlib.sha256(query.lower().encode()).hexdigest()
        cache_key = f"video_search:{query_hash}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        api_key = getattr(settings, "YOUTUBE_API_KEY", "")
        if not api_key:
            # Not configured yet -- fail soft rather than a 500, same
            # pattern as weather.views.WeatherView.
            return Response(
                {"detail": "Learning videos are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        params = {
            "key": api_key,
            "q": f"{query} farming",
            "part": "snippet",
            "type": "video",
            "maxResults": MAX_RESULTS,
            "safeSearch": "strict",
            "relevanceLanguage": "en",
        }

        try:
            response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException:
            return Response(
                {"detail": "Learning videos are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if response.status_code != 200:
            # Covers an invalid/expired key (400/403), quota exhausted
            # (403), and any other upstream failure -- none of these are
            # something the farmer searching can do anything about, so
            # they all collapse to the same graceful message.
            return Response(
                {"detail": "Learning videos are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            data = response.json()
            results = []
            for item in data.get("items", []):
                video_id = item.get("id", {}).get("videoId")
                snippet = item.get("snippet", {})
                if not video_id:
                    continue
                thumbnails = snippet.get("thumbnails", {})
                thumbnail = (
                    thumbnails.get("medium", {}).get("url")
                    or thumbnails.get("default", {}).get("url")
                    or ""
                )
                results.append(
                    {
                        "video_id": video_id,
                        "title": snippet.get("title", ""),
                        "channel_title": snippet.get("channelTitle", ""),
                        "thumbnail": thumbnail,
                        "published_at": snippet.get("publishedAt"),
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    }
                )
        except (ValueError, KeyError):
            return Response(
                {"detail": "Learning videos are unavailable right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        payload = {"query": query, "results": results}
        cache.set(cache_key, payload, CACHE_TIMEOUT_SECONDS)
        return Response(payload, status=status.HTTP_200_OK)
