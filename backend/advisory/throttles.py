from rest_framework.throttling import UserRateThrottle


class AdvisoryRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on advisory query create/list/answer
    traffic -- same reasoning as every other feature throttle in this
    project (chatbot, weather, videos, locator): prevents scripted abuse
    even though there's no external API cost here.
    """
    scope = "advisory"
