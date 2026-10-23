"""
Kannada Voice Assistant -- Gemini-backed conversational replies for the
Chatbot page via Google Gemini's REST API (free tier).

`generate_chat_reply` is a deliberately PURE function, mirroring
`crops.diary_ai.generate_diary_analysis`'s fail-soft contract exactly:
returns `None` on ANY failure (blank API key, network error, timeout,
non-200 status, malformed/unexpected JSON shape -- including a
well-formed-but-empty `candidates` list) and never raises -- so the caller
(the view) can always safely fall back to the existing keyword-matching
FAQ response without a try/except of its own.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Same request mechanics as crops/diary_ai.py -- the API key goes in the
# x-goog-api-key header, never the URL, so it can't leak into requests'
# error messages or logs.
GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
# Was 5 -- a real farmer request on a real residential connection hit a
# genuine ReadTimeout at that budget (TLS handshake + request + Gemini's
# own generation time all have to fit inside it), which silently
# degraded that reply to the old FAQ matcher with zero visible sign to
# the farmer. 10s is still short enough that a slow reply doesn't feel
# broken, while giving a live network round trip real room to succeed.
REQUEST_TIMEOUT_SECONDS = 10
MAX_HISTORY_TURNS = 10

SYSTEM_INSTRUCTION = (
    "You are a friendly, knowledgeable farming assistant talking with a farmer. Converse "
    "naturally and fluently in whichever language the farmer is writing or speaking in -- "
    "including Kannada -- and always reply in that same language. Stay focused on farming "
    "topics. Never invent a disease diagnosis -- for anything that needs a photo, tell the "
    "farmer to use the app's Scan feature. For anything case-specific, ambiguous, or urgent "
    "that you aren't confident about, recommend they use 'Ask an Expert' to reach a human "
    "advisor. Keep replies short -- 2 to 4 sentences -- since they may be read aloud."
)

_LANGUAGE_HINT_NAMES = {"en": "English", "kn": "Kannada", "hi": "Hindi"}


def _system_instruction_for(ui_language):
    """
    A short-or-ambiguous message ("ok", "ಸರಿ") doesn't always carry its own
    language signal -- this appends a one-line hint naming the active UI
    language, so Gemini has a tie-breaker when the message's own language
    isn't clear, without overriding a message clearly written in a
    different language than the current UI.
    """
    hint_name = _LANGUAGE_HINT_NAMES.get(ui_language, "English")
    return (
        SYSTEM_INSTRUCTION
        + f" If the farmer's message doesn't clearly indicate its own language, reply in {hint_name}."
    )


MAX_HISTORY_TEXT_LENGTH = 2000


def _history_to_contents(history):
    """
    Maps {"sender": "user"|"bot", "text": str} dicts to Gemini's
    {"role": "user"|"model", "parts": [...]} shape, skipping any entry
    missing "sender" or "text", with an unrecognized sender, or whose
    sender/text aren't strings (the serializer's DictField only enforces
    the entry is a dict, not what its values look like, so a list or
    number here is a real possibility, not just a test fixture) -- a bad
    entry in the farmer's own chat history shouldn't block their next
    message, so this never raises. Each entry's text is also capped at
    MAX_HISTORY_TEXT_LENGTH characters -- `message` is already capped by
    the serializer, but history entries aren't, and the free Gemini quota
    is shared with the Farming Diary feature, so one oversized history
    entry shouldn't be able to burn through it.
    """
    role_by_sender = {"user": "user", "bot": "model"}
    contents = []
    for entry in history:
        sender = entry.get("sender")
        text = entry.get("text")
        if not isinstance(sender, str) or not isinstance(text, str) or not text:
            continue
        role = role_by_sender.get(sender)
        if role is None:
            continue
        contents.append({"role": role, "parts": [{"text": text[:MAX_HISTORY_TEXT_LENGTH]}]})
    return contents


def _thinking_config_for(model):
    """
    Returns the generationConfig.thinkingConfig payload to send for this
    model, or None when this model doesn't need one. Keeps thinking as
    minimal as the model allows, since a farmer-facing chat reply doesn't
    need deep reasoning and every second of it eats into
    REQUEST_TIMEOUT_SECONDS before a silent fallback to the FAQ matcher.

    Gemini 2.5 Flash family: thinking fully disables via the older
    thinkingBudget=0 field -- but only Flash/Flash-Lite accept 0 (2.5 Pro
    rejects it with a 400, and older models don't know the field), so
    it's only sent for gemini-2.5-flash* model names.

    Gemini 3.x Flash family: thinkingBudget was replaced by a different
    field, thinkingLevel, and this generation can't fully disable
    thinking at all -- "minimal" is its lowest level (and, per Google's
    own docs, also this family's own default already). Sending it
    explicitly doesn't speed anything up by itself, but pins the same
    "be deliberate about thinking cost" intent the 2.5 branch above has,
    and protects against Google quietly changing the default later.
    Scoped to Flash models specifically (not Pro), same caution as 2.5.

    Caught a real production bug from relying on the old
    thinkingBudget-only check alone: a farmer configured with
    gemini-3.5-flash-lite got NO generationConfig sent at all (this
    function returned False for that model name), and a real request
    against it hit a genuine ReadTimeout on REQUEST_TIMEOUT_SECONDS=5 --
    silently degrading every chat reply to the old FAQ matcher. Bumping
    the timeout (below) is the actual fix for that; this function being
    thinkingLevel-aware for the 3.x family is a related, deliberate
    improvement, not a guess that it alone would have prevented it.
    """
    if model.startswith("gemini-2.5-flash"):
        return {"thinkingBudget": 0}
    if model.startswith("gemini-3.") and "flash" in model:
        return {"thinkingLevel": "minimal"}
    return None


def generate_chat_reply(message, history, ui_language):
    """
    Returns Gemini's reply text on success, `None` on any failure.

    `history` must already be trimmed to MAX_HISTORY_TURNS entries (oldest
    first) by the caller -- this function never re-trims it. `ui_language`
    is one of "en" / "kn" / "hi".
    """
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return None

    contents = _history_to_contents(history) + [{"role": "user", "parts": [{"text": message}]}]
    payload = {
        # Gemini's REST API uses protobuf-JSON camelCase field names
        # ("systemInstruction"), not the snake_case used by some client
        # libraries' Python kwargs -- getting this right matters even
        # though no test pins every field, same note as diary_ai.py.
        "systemInstruction": {"parts": [{"text": _system_instruction_for(ui_language)}]},
        "contents": contents,
    }
    model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    thinking_config = _thinking_config_for(model)
    if thinking_config is not None:
        payload["generationConfig"] = {"thinkingConfig": thinking_config}

    try:
        response = requests.post(
            GEMINI_URL_TEMPLATE.format(model=model),
            headers={"x-goog-api-key": api_key},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        # Exception TYPE only, never str(exc): requests' messages embed the
        # full request URL, and logging less is the safer default.
        logger.warning(
            "Gemini chat request failed (%s) for model %s -- falling back to FAQ matching.",
            type(exc).__name__, model,
        )
        return None

    if response.status_code != 200:
        logger.warning(
            "Gemini chat returned HTTP %s for model %s -- falling back to FAQ matching.",
            response.status_code, model,
        )
        return None

    try:
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        # Also covers a 200 with an empty "candidates" list (e.g. Gemini's
        # safety filtering) -- that indexes into an empty list and raises
        # IndexError, caught here exactly like any other unexpected shape.
        logger.warning(
            "Gemini chat response for model %s had an unexpected shape (%s) -- falling back to FAQ matching.",
            model, type(exc).__name__,
        )
        return None
