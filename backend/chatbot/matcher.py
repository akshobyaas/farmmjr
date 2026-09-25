import re
from .faq import FAQ_ENTRIES, FALLBACK_RESPONSE

MAX_MESSAGE_LENGTH = 500

# The message is only ever used for a plain substring comparison against a
# fixed keyword list below -- it's never interpolated into a database
# query, a file path, a shell command, or (on the frontend) raw HTML. So
# there's no actual injection surface here regardless of content. This
# sanitization is still applied as defense-in-depth and to keep the
# comparison well-behaved: it strips control characters and collapses
# whitespace, exactly like videos._sanitize_query in Phase 14.
_WHITESPACE_RE = re.compile(r"\s+")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_message(raw):
    cleaned = _CONTROL_CHARS_RE.sub("", raw or "")
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned[:MAX_MESSAGE_LENGTH]


def match_intent(message):
    """
    Returns (reply_text, intent_name, recognized_bool). A query containing
    SQL-like syntax or script tags (e.g. "'; DROP TABLE users; --" or
    "<script>alert(1)</script>") is compared as plain lowercased text
    against the keyword list exactly like any other message -- it will
    almost certainly match no intent and fall through to the fallback
    response, but critically it is NEVER executed, evaluated, or reflected
    back verbatim in the reply (every response is one of the fixed strings
    in faq.py, never the user's own input).
    """
    lowered = message.lower()
    for intent_name, keywords, response in FAQ_ENTRIES:
        if any(keyword in lowered for keyword in keywords):
            return response, intent_name, True
    return FALLBACK_RESPONSE, None, False
