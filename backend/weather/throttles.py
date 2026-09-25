from rest_framework.throttling import UserRateThrottle


class WeatherRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on weather lookups. OpenWeatherMap's free
    tier has a tight overall call quota shared across every one of our
    users -- this stops one farmer refreshing the weather card in a loop
    from burning through it for everyone else.
    """
    scope = "weather"
