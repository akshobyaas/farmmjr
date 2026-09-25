from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """
    Reuses Django's battle-tested token machinery (timestamped + HMAC-signed,
    never store the token itself in the database) but folds `is_verified`
    into the hash. This means the moment a user verifies their email, every
    previously-issued verification token for them automatically becomes
    invalid — a verification link is naturally single-use without us having
    to track used tokens in a table ourselves.
    """

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.is_verified}{timestamp}{user.email}"


email_verification_token = EmailVerificationTokenGenerator()

# Django's default PasswordResetTokenGenerator already folds the user's
# password hash + last_login into its signature, so a reset link
# automatically invalidates the moment the password is changed — exactly
# the single-use behavior we need, with no extra code required.
from django.contrib.auth.tokens import default_token_generator as password_reset_token
