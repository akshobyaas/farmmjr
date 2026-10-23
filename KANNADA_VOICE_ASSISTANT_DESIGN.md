# Kannada Voice Assistant Design — Conversational AI Chatbot with Speech I/O

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-10-22
**Context:** The existing Chatbot page (`chatbot` app) is a stateless keyword matcher: a fixed list
of intents in `faq.py`, substring-matched against the farmer's message, each returning one canned
response. It works but it's narrow — anything not in the curated keyword list falls through to
"I'm not sure — would you like to ask our expert instead?" A rival team's project pitch ("Smart
Farming with Regional Dialect Voice Assistance") raised the bar, and the user's own goal is sharper
than a voice-controlled version of the same FAQ matcher: **"it must converse in kannada with
farmers... fluently."** This doc replaces the Chatbot page's matching engine with a Gemini-backed
conversational assistant — multi-turn, grounded, and fluent in Kannada — with voice input (speech-
to-text) and voice output (text-to-speech) layered on top. The Advisory page (human-expert
escalation) is untouched; this doc only touches the `chatbot` app and the Chatbot page.

---

## 1. What a farmer actually does

A farmer opens the Chatbot page, in whichever of the app's three UI languages (English, Kannada,
Hindi) they've already chosen. They can type as before, or tap a microphone button to speak their
question instead — the browser transcribes it (in the active UI language) into the same text input,
and sending it works exactly the same way either way. The bot's replies appear as chat bubbles as
before, and — when voice output is on — are also spoken aloud. The whole exchange is a real back-
and-forth: the assistant remembers what was said earlier in the same visit and can hold a multi-turn
conversation, not just answer one message at a time in isolation.

The assistant converses fluently in whichever language the farmer is writing or speaking in,
Kannada included — that's the whole point of this feature. It stays a general farming assistant:
for anything that genuinely needs a human (an ambiguous or urgent case, something it isn't
confident about) it tells the farmer to use "Ask an Expert" (the existing Advisory page), the same
bridge the old FAQ fallback already offered.

## 2. Architecture and data flow

```
farmer speaks/types
        │
        ▼
 Web Speech API (SpeechRecognition) — transcribes speech to text,
 in the browser, in the active UI language — only used for voice input;
 typing bypasses it entirely
        │
        ▼
 ChatbotPage.jsx — text lands in the same input box either way
        │
        ▼
 POST /api/chatbot/message/  { message, history, ui_language }
        │
        ▼
 ChatMessageView (chatbot/views.py)
        │
        ▼
 chatbot/gemini_chat.py — builds a prompt from the message + history,
 calls the Gemini REST API (same GEMINI_API_KEY / GEMINI_MODEL settings
 crops/diary_ai.py already uses)
        │
        ├─ success → reply text, source="ai"
        └─ failure (blank key / network error / timeout / bad status /
           malformed response) → falls back to the existing keyword
           matcher (chatbot/matcher.py), source="faq" — unchanged
           behavior from today, including its own "ask our expert"
           fallback when even that doesn't match
        │
        ▼
 Response: { reply, recognized, intent, source }
        │
        ▼
 ChatbotPage.jsx — reply appended as a bot chat bubble, and (if voice
 output is on and the browser supports it) spoken aloud via
 window.speechSynthesis, in the active UI language
```

**Why route a Gemini failure through the existing matcher, instead of a generic error message:**
`chatbot/matcher.py` and `chatbot/faq.py` are already correct and fully tested (`chatbot/tests.py`),
and the FAQ fallback already bridges to Advisory for anything it can't answer. Reusing it as the
fail-soft path means a Gemini outage degrades the chatbot back to today's working behavior instead
of to an error message — the same fail-soft discipline as `weather/forecast.py` and
`crops/diary_ai.py` (never crash, always return *something* useful), just with a more useful "something"
available here than those two have.

## 3. Conversation memory, grounding, and the Kannada fluency requirement

**Memory is ephemeral browser state, not a new database table.** `ChatbotPage.jsx` keeps the full
message list in React state exactly as it does today; the only change is that this list is also
sent as `history` on every request, so Gemini has the conversation so far as context. Nothing is
persisted server-side — no new model, no new migration. Reloading the page or navigating away starts
a fresh conversation, same as today. This is a deliberate scope boundary (see §7): a farmer asking
something complex in one sitting gets a coherent multi-turn exchange; there's no cross-session chat
history to retrieve, store, or moderate.

**Kannada fluency comes from the model, not from translation.** The system instruction sent to
Gemini tells it to converse naturally and fluently in the language the farmer is writing or speaking
in, and to reply in that same language — Gemini's own multilingual fluency, not a translation layer
bolted onto English responses. The frontend also sends `ui_language` (the active i18n code: `en` /
`kn` / `hi`) as a hint, because a short or ambiguous message ("ok", "yes") doesn't always reveal its
own language — the hint resolves that ambiguity without overriding a message that's clearly written
in a different language than the current UI.

**Grounding and the fallback-to-human rule.** The assistant is a general farming conversationalist,
not a diagnostic tool — it has no access to a farmer's scan history, crop tracker, or any photo, and
the system instruction says so explicitly: never invent a disease diagnosis, point to the existing
Scan feature for anything requiring a photo, and recommend "Ask an Expert" (Advisory) for anything
case-specific or urgent the model isn't confident about. This mirrors the same rule already proven
out in `crops/diary_ai.py`'s system instruction ("never invent a diagnosis the CNN model didn't
actually report").

**Known caveat (stated plainly, not engineered around): voice I/O depends on the farmer's browser.**
The Web Speech API's `SpeechRecognition` is a Chromium-only feature (Chrome, Edge, Opera, and
Chrome-based Android browsers) with no standard/Firefox/Safari support as of this app's target
browsers. Kannada (`kn-IN`) recognition and synthesis quality also depends entirely on what
Google's speech services ship for that locale on the farmer's device — this is accepted as a
platform limitation, not something this feature can fix. The feature therefore **degrades
gracefully, never blocks**: typed chat works everywhere regardless of browser; voice is an enhancement
that simply doesn't appear when the browser doesn't support it (see §5).

## 4. Backend design

**New module, `chatbot/gemini_chat.py`** — a pure fail-soft function, same shape and contract as
`crops/diary_ai.generate_diary_analysis`:

```python
def generate_chat_reply(message: str, history: list[dict], ui_language: str) -> str | None:
    """Returns Gemini's reply text on success, None on ANY failure (blank
    key, network error, timeout, non-200 status, malformed response) --
    never raises. `history` is a list of {"sender": "user"|"bot", "text": str}
    dicts, oldest first, already trimmed to MAX_HISTORY_TURNS by the caller."""
```

- Reuses `settings.GEMINI_API_KEY` / `settings.GEMINI_MODEL` — no new Django settings.
- `MAX_HISTORY_TURNS = 10` (module constant) — the view trims `history` to the last 10 entries
  before calling this function, bounding both the Gemini request size and cost regardless of what
  the frontend sends.
- Builds the Gemini `contents` array by mapping `history` entries to alternating `user`/`model` roles
  (Gemini's `generateContent` API expects a `role` per content turn, not a flat system-style blob —
  unlike `diary_ai.py`, which only ever sends one user turn), appending the new `message` as the
  final `user` turn.
- `systemInstruction` (fixed module constant, not built per-request) states: converse fluently and
  naturally in the farmer's language (Kannada included) and reply in that same language; stay
  focused on farming topics; never invent a diagnosis; for anything requiring a photo, point to the
  Scan feature; for anything case-specific, ambiguous, or urgent, recommend "Ask an Expert"
  (Advisory); keep replies short (2-4 sentences) since they may be read aloud.
- Same request mechanics as `diary_ai.py`: `x-goog-api-key` header (never the URL), 5-second
  timeout, `thinkingBudget: 0` when `_supports_disabling_thinking(model)` (reuse that helper's logic
  — copy it into this module rather than importing across apps, consistent with this codebase's
  existing per-app independence), `logger.warning(...)` (exception type only, never `str(exc)`) at
  each of the three failure points, mirroring `diary_ai.py` line for line.

**`chatbot/views.py` (`ChatMessageView.post`) changes:**
1. Validate the request via an updated `ChatMessageSerializer` (see below).
2. Sanitize `message` via the existing `sanitize_message` (unchanged — still strips control
   characters and collapses whitespace; still applies `MAX_MESSAGE_LENGTH`).
3. Trim `history` to the last `MAX_HISTORY_TURNS` entries.
4. Call `generate_chat_reply(message, trimmed_history, ui_language)`.
5. On a non-`None` result: `{"reply": <text>, "recognized": True, "intent": None, "source": "ai"}`.
6. On `None`: fall through to the existing `match_intent(message)` call exactly as today, with
   `"source": "faq"` added to that same response shape.

**`chatbot/serializers.py` (`ChatMessageSerializer`) changes:** add two new fields, both optional —
a blank/absent `history` or `ui_language` from an older cached frontend bundle must not break the
endpoint:
- `history = serializers.ListField(child=serializers.DictField(), required=False, default=list)`
- `ui_language = serializers.ChoiceField(choices=["en", "kn", "hi"], required=False, default="en")`

A malformed `history` entry (missing `sender`/`text`, or a `sender` that isn't `"user"`/`"bot"`) is
dropped rather than rejecting the whole request — a stray bad entry in the farmer's own chat history
shouldn't block them from sending their next message. `chatbot/gemini_chat.py`'s history-to-`contents`
mapping is defensive for exactly this reason: skip anything that doesn't have both keys, don't raise.

**No change** to `chatbot/throttles.py` (`ChatRateThrottle`, scope `"chatbot"`) — it already rate-
limits per authenticated user, which matters more now that a request can hit a paid external API,
not less. No change to `chatbot/urls.py` — same endpoint, same path.

## 5. Frontend design

**`ChatbotPage.jsx` changes:**
- `messages` state keeps its existing `{id, sender, text}` shape; on submit, the full `messages`
  array (mapped to `{sender, text}` only — dropping the local `id`) is sent as `history` in the
  `sendChatMessage` call, trimmed client-side to the last 10 entries before sending (mirrors the
  server-side cap — belt and suspenders, and keeps the request small on a slow rural connection).
- `sendChatMessage(message, history, uiLanguage)` in `api/chatbot.js` gains the two new parameters
  (both optional, so any other caller — there are none today, but defensively — keeps working):
  ```js
  export async function sendChatMessage(message, history = [], uiLanguage = "en") {
    const { data } = await api.post("chatbot/message/", { message, history, ui_language: uiLanguage });
    return data;
  }
  ```
  `uiLanguage` is read from `i18n.language` (already available via `useTranslation()`'s `i18n`
  object, same source the rest of the app uses for the active language code).
- The page's initial greeting bubble (`{id: 0, sender: "bot", text: t("chatbot.greeting")}`) is a
  real bot utterance from Gemini's point of view even though it's generated locally rather than
  fetched — it stays in `messages` and is included in `history` like any other turn, giving Gemini
  the same opening context a farmer sees on screen.
- A new `languageToSpeechCode` map (small local constant, not a new file) converts the app's `en`/
  `kn`/`hi` codes to the BCP-47 codes Web Speech API expects: `{en: "en-IN", kn: "kn-IN", hi: "hi-IN"}`.

**Voice input (microphone button):**
- Feature-detected once on mount: `const SpeechRecognitionCtor = window.SpeechRecognition ||
  window.webkitSpeechRecognition;`. If `undefined`, the mic button is not rendered at all — typed
  input is the only path, exactly as today, no broken/disabled-looking button.
- When supported, a mic button (🎤 emoji, matching the codebase's existing plain-text/emoji icon
  convention — e.g. AdvisoryPage's ✅ — no new npm dependency) sits beside the text input. Tapping
  it starts a `SpeechRecognition` instance configured with `lang` set from `languageToSpeechCode`,
  `interimResults: false`, `continuous: false`. Its `onresult` sets the text input's value to the
  transcript (does **not** auto-send — the farmer can review/edit before sending, same control they
  have when typing). Its `onerror`/`onend` reset the button's "listening" visual state. No new state
  machine beyond a simple `isListening` boolean driving the button's appearance and an
  `aria-label` change (e.g. "Start voice input" / "Listening…").

**Voice output (speaker toggle):**
- Feature-detected once on mount: `const speechSupported = "speechSynthesis" in window;`. If
  `false`, the speaker toggle is not rendered — chat stays text-only, exactly as today.
- When supported, a speaker toggle (🔊/🔇) in the page header area controls a boolean `voiceOutputOn`
  (persisted only in component state — not localStorage, not a user setting; resets to on each visit,
  consistent with everything else in this feature being ephemeral session state).
- Whenever a new bot message is appended **and** `voiceOutputOn` is true, speak it:
  `const utterance = new SpeechSynthesisUtterance(text); utterance.lang =
  languageToSpeechCode[i18n.language]; window.speechSynthesis.speak(utterance);`. If no matching
  voice is installed for that language on the farmer's device, the browser's own default behavior
  applies (falls back to whatever voice it has, or stays silent) — this is the same accepted
  platform limitation from §3, not something the app tries to detect or warn about, since there is
  no reliable cross-browser way to know in advance which voices are actually installed.
- Before speaking a new utterance, call `window.speechSynthesis.cancel()` to stop any utterance still
  speaking from a previous reply — prevents overlapping speech if replies arrive close together.

**No new npm dependencies.** Both Web Speech APIs are browser built-ins; `package.json` is unchanged.

**New i18n keys** (added to `locales/en.json`, `kn.json`, `hi.json`, following the existing flat-
namespace convention under `"chatbot"`): `micLabel`, `micListening`, `voiceOnLabel`, `voiceOffLabel`,
and `voiceNotSupported` is **not** added as a visible string — per the graceful-degradation rule
above, an unsupported browser simply doesn't show the controls, rather than showing an explanatory
message that invites a question with no exciting answer.

## 6. Testing

**Backend (`chatbot/tests.py`, extended):**
- `gemini_chat.generate_chat_reply` unit tests (new, mocking `chatbot.gemini_chat.requests.post`,
  mirroring `crops/tests.py`'s diary-AI mocking pattern): success returns the parsed text; blank
  `GEMINI_API_KEY` returns `None` without a network call; a `RequestException` returns `None`;  a
  non-200 status returns `None`; a malformed JSON shape returns `None`; history entries map to
  alternating `user`/`model` roles in the request payload; a history entry missing `sender` or
  `text` is skipped rather than raising.
- `ChatMessageView` tests (extended): a successful Gemini mock returns `source: "ai"` and the
  model's text; a mocked Gemini failure (any of the four failure modes above) falls through to the
  existing `match_intent` behavior with `source: "faq"` added. The **existing** recognized/
  unrecognized/blank/missing/whitespace/over-length tests all keep passing, with one required
  change: each must add `@override_settings(GEMINI_API_KEY="")` (same fix already applied to
  `videos/tests.py` this session, for the same reason) so they deterministically exercise the FAQ
  fallback path regardless of whether a real key happens to be set in the environment the tests run
  in — on the cloud worktree it's blank by accident of environment; on the real device, a real key
  is now configured (for the Farming Diary feature), so without this override these tests would
  silently start making real network calls.
- A request with no `history`/`ui_language` fields at all (simulating an old cached frontend) is
  still accepted (defaults apply) and does not 400.
- A request with a malformed entry inside `history` (e.g. `[{"sender": "user"}]`, missing `text`)
  still succeeds — the bad entry is dropped, not rejected.

**Frontend (`ChatbotPage.test.jsx`, extended plus new assertions):**
- All five existing tests (greeting, recognized reply, fallback reply, injection-safe rendering,
  network error) continue to pass, since the component's rendering of `reply`/`recognized`/`intent`
  is unchanged — `sendChatMessage` is called with additional arguments, but mocked the same way.
- New: when `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both `undefined`
  (jsdom's actual default — nothing to stub), no element with the mic's `aria-label` is rendered.
  Same for `window.speechSynthesis` and the speaker toggle.
- New: when a mock `SpeechRecognition` constructor is installed on `window` before render, tapping
  the mic button constructs an instance with `lang` matching the active UI language, and firing its
  `onresult` handler with a mock transcript populates the text input (without auto-sending).
- New: when a mock `speechSynthesis.speak` is installed and the speaker toggle is on, receiving a
  bot reply calls `speak` with an utterance whose `.text` matches the reply and whose `.lang`
  matches the active UI language's speech code; toggling voice output off first means `speak` is not
  called for the next reply.
- New: sending a message includes the prior `messages` (mapped to `{sender, text}`) as the `history`
  argument to `sendChatMessage`, and the active `i18n.language` as the `ui_language` argument.

## 7. Deliberately out of scope this round

- **Dialect-specific recognition/synthesis** (e.g. a specific regional Kannada dialect's
  pronunciation). Web Speech API exposes only the standard `kn-IN` locale; there's no dialect
  parameter to set, and training/selecting a dialect-specific voice model is a different project
  scale entirely.
- **Offline mode.** Both Web Speech API and the Gemini call require network access; there is no
  offline fallback, same as every other external-API-backed feature in this app (weather, locator,
  videos, diary AI).
- **Fusing photo diagnosis into the chat conversation.** The chatbot can tell a farmer to go use
  Scan, but it does not accept a photo itself, call the CNN model, or read a farmer's scan history —
  that stays Scan's and Farming Diary's job respectively. (A farmer can separately use Scan and then
  come describe the result to the chatbot in words, exactly like they could already describe
  anything else in words.)
- **Voice I/O on the Advisory page.** This doc is scoped to the Chatbot page only. Advisory's
  human-expert question/answer flow is untouched.
- **Persisted chat history across visits.** Conversation memory is ephemeral browser state for the
  current page visit only (§3) — no new database table, no "view past conversations" feature.
