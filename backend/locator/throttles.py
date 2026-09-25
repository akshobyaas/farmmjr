from rest_framework.throttling import UserRateThrottle


class LocatorRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on nearby-service searches. OpenStreetMap's
    Nominatim and Overpass are free public services with strict fair-use
    policies (Nominatim: max 1 request/second, no bulk/heavy use) -- this
    keeps us well within that regardless of how many farmers use the app at
    once, alongside the short server-side cache in views.py.
    """
    scope = "locator_search"
