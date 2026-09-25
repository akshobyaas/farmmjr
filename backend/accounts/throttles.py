from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Stricter limit specifically on login attempts — the classic brute-force target."""
    scope = "login"


class RegisterRateThrottle(AnonRateThrottle):
    scope = "register"


class PasswordResetRateThrottle(AnonRateThrottle):
    """Also prevents 'email-bombing' a victim via repeated reset requests."""
    scope = "password_reset"
