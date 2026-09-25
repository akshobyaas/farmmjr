from rest_framework.throttling import UserRateThrottle


class VideoSearchRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on YouTube searches. Same reasoning as
    weather.throttles.WeatherRateThrottle -- YouTube Data API v3's free
    quota (10,000 units/day, and a search call costs 100 units -- only
    ~100 searches/day total) is shared across every user of the app, so a
    tight per-user cap plus server-side caching (see views.py) both matter
    here more than they would for a cheap endpoint.
    """
    scope = "video_search"
