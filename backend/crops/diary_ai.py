"""
Farming Diary Task 4 -- AI text analysis of a diary entry via Google
Gemini's REST API (free tier).

`generate_diary_analysis` is a deliberately PURE function: it takes the
already-saved entry plus an already-fetched list of recent entries and does
NOT query the database itself. This mirrors `weather.forecast.
fetch_forecast_summary`'s fail-soft contract exactly -- returns `None` on
ANY failure (blank API key, network error, timeout, non-200 status,
malformed/unexpected JSON shape) and never raises -- so the caller (the
view) can always safely fall back to `AnalysisStatus.UNAVAILABLE` without a
try/except of its own.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# The model name comes from settings.GEMINI_MODEL (not hardcoded here) because
# Google retires older model names -- a hardcoded gemini-1.5-flash started
# 404ing, which this module's fail-soft contract silently turned into "AI
# analysis unavailable". The API key is sent in the x-goog-api-key header,
# never in the URL, so it can't leak into requests' error messages or logs.
GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
REQUEST_TIMEOUT_SECONDS = 5
MAX_HISTORY_ENTRIES = 5

SYSTEM_INSTRUCTION = (
    "You are a practical agricultural advisor helping a farmer who keeps a "
    "daily farming diary. Write 2-4 sentences: flag any concerns, suggest "
    "one concrete next step, and never invent a diagnosis the CNN model "
    "didn't actually report. If nothing stands out, say so plainly."
)


def _activity_summary(entry):
    """
    Which did_* flags are True, plus other_activity_note, rendered as a
    short comma-separated phrase for the prompt -- e.g.
    "irrigation, spraying, other: cleared weeds near the bund".
    """
    labels = {
        "did_irrigation": "irrigation",
        "did_fertilizer": "fertilizer application",
        "did_spraying": "spraying",
        "did_pruning": "pruning",
    }
    activities = [label for field, label in labels.items() if getattr(entry, field, False)]
    if entry.other_activity_note:
        activities.append(f"other: {entry.other_activity_note}")
    return ", ".join(activities) if activities else "none logged"


def _build_prompt(entry, recent_entries):
    tracker = entry.tracker
    stage_name = tracker.current_stage.name if tracker.current_stage else "unknown"

    lines = [
        f"Crop: {tracker.crop.name}",
        f"Current growth stage: {stage_name}",
        f"Today's activities: {_activity_summary(entry)}",
        f"Today's note: {entry.note or '(none)'}",
    ]

    if entry.photo_diagnosis_label:
        confidence_part = (
            f" (confidence: {entry.photo_diagnosis_confidence:.2f})"
            if entry.photo_diagnosis_confidence is not None
            else ""
        )
        lines.append(f"Photo diagnosis from CNN model: {entry.photo_diagnosis_label}{confidence_part}")
    else:
        lines.append("Photo diagnosis from CNN model: none (no photo, or diagnosis unavailable)")

    history = recent_entries[:MAX_HISTORY_ENTRIES]
    if history:
        lines.append("Recent diary history (oldest to newest):")
        for past_entry in history:
            lines.append(
                f"- {past_entry.entry_date}: note={past_entry.note or '(none)'}; "
                f"previous AI analysis={past_entry.ai_analysis or '(none)'}"
            )
    else:
        lines.append("Recent diary history: none -- this is the first entry for this tracker.")

    return "\n".join(lines)


def _supports_disabling_thinking(model):
    """
    The 2.5 Flash family "thinks" before answering by default, which can
    push a reply past REQUEST_TIMEOUT_SECONDS. thinkingBudget=0 turns that
    off -- but only Flash/Flash-Lite accept 0 (2.5 Pro rejects it with a
    400, and older models don't know the field), so it's only sent for
    gemini-2.5-flash* model names.
    """
    return model.startswith("gemini-2.5-flash")


def generate_diary_analysis(entry, recent_entries):
    """
    Returns the AI's text response on success, `None` on any failure.

    `recent_entries` must already be fetched (up to `MAX_HISTORY_ENTRIES`,
    oldest to newest) by the caller -- this function never touches the ORM,
    which is what keeps it trivially mockable in tests (mock
    `crops.diary_ai.requests.post`, not any Django ORM call).
    """
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return None

    prompt = _build_prompt(entry, recent_entries)
    payload = {
        # Gemini's REST API uses protobuf-JSON camelCase field names
        # ("systemInstruction"), not the snake_case used by some client
        # libraries' Python kwargs -- using the wrong casing here wouldn't
        # raise, it would just have the system instruction silently
        # ignored (or, depending on strictness, a 400 that
        # generate_diary_analysis would fail-soft on anyway), so this is
        # worth getting right even though no test pins the payload shape.
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"parts": [{"text": prompt}]}],
    }
    model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    if _supports_disabling_thinking(model):
        payload["generationConfig"] = {"thinkingConfig": {"thinkingBudget": 0}}

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
            "Gemini diary analysis request failed (%s) for model %s -- analysis unavailable.",
            type(exc).__name__, model,
        )
        return None

    if response.status_code != 200:
        logger.warning(
            "Gemini diary analysis returned HTTP %s for model %s -- analysis unavailable.",
            response.status_code, model,
        )
        return None

    try:
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        logger.warning(
            "Gemini diary analysis response for model %s had an unexpected shape (%s) -- analysis unavailable.",
            model, type(exc).__name__,
        )
        return None
