from rest_framework.throttling import UserRateThrottle


class ChatRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on chatbot messages. There's no external
    API cost here (matching is local), but an unthrottled chat endpoint is
    still an easy target for scripted abuse/spam -- the phase plan calls
    this out explicitly under "Security built in".
    """
    scope = "chatbot"
