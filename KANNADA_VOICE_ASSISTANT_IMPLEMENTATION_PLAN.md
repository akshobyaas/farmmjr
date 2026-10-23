# Kannada Voice Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chatbot page's stateless keyword matcher with a Gemini-backed conversational
assistant that converses fluently in Kannada, English, or Hindi across multiple turns, with
voice input (speech-to-text) and voice output (text-to-speech) layered on top via the browser's
Web Speech API.

**Architecture:** A new pure fail-soft module (`chatbot/gemini_chat.py`) mirroring
`crops/diary_ai.py`'s shape, wired into the existing `ChatMessageView` so a Gemini failure falls
through to the already-tested keyword matcher (`chatbot/matcher.py`) instead of an error. On the
frontend, `ChatbotPage.jsx` gains client-side conversation history (ephemeral React state, sent
with each request) plus a feature-detected microphone button and speaker toggle, both of which
render nothing in browsers without Web Speech API support.

**Tech Stack:** Django 6.1 / DRF (backend), React + Vite + react-i18next (frontend), Google Gemini
REST API via `requests` (reusing the existing `GEMINI_API_KEY`/`GEMINI_MODEL` settings), Web Speech
API (`SpeechRecognition`, `speechSynthesis` — browser built-ins, no new npm dependency).

**Spec:** `KANNADA_VOICE_ASSISTANT_DESIGN.md` (this repo's root) — the approved design this plan
implements.

## Global Constraints

- Reuses `settings.GEMINI_API_KEY` / `settings.GEMINI_MODEL` (`config/settings.py:214-215`) — no
  new Django settings.
- `MAX_HISTORY_TURNS = 10`. The view trims `history` to the last 10 entries **before** calling
  `generate_chat_reply` — the function itself assumes its `history` argument is already trimmed and
  never re-trims it.
- Response shape: `{"reply": str, "recognized": bool, "intent": str | None, "source": "ai" | "faq"}`.
  `source` is the only new field; `reply`/`recognized`/`intent` keep their existing meaning exactly.
- Fail-soft contract: `generate_chat_reply` **never raises**. It returns `None` for a blank API key,
  a `requests.RequestException`, a non-200 status, or a malformed/unexpected response shape
  (including a well-formed-but-empty `candidates` list, e.g. from safety filtering) — any `None`
  result makes the view fall through to the existing `match_intent()` FAQ path, completely
  unchanged from today's behavior.
- No new Django model, no new migration, no persisted chat history anywhere server-side —
  conversation memory is ephemeral React state only, capped to the last 10 turns on both the
  client (before sending) and the server (before calling Gemini).
- No new npm dependencies. Web Speech API (`SpeechRecognition`, `speechSynthesis`) are browser
  built-ins, feature-detected at mount; the mic button and speaker toggle each render **nothing**
  (not a disabled/broken control) when their API is unsupported.
- UI icons are plain emoji (🎤 / 🔊 / 🔇), matching the app's existing no-icon-library convention
  (e.g. AdvisoryPage's ✅) — no icon library dependency either.
- New i18n keys live under the existing `"chatbot"` namespace in `en.json` / `kn.json` / `hi.json`,
  matching that namespace's existing flat-key style. Kannada/Hindi values must be real translations.
- Out of scope — do not build: dialect-specific voices, offline mode, fusing photo diagnosis into
  the chat, voice on the Advisory page, persisted/cross-session chat history.

## Review Focus

- **The `ui_language` hint must actually reach Gemini**, or a short/ambiguous message ("ok", "ಸರಿ")
  with no clear language signal of its own will get an unpredictable reply language instead of
  honoring the farmer's active UI language. (Task 1)
- **A 200 response with an empty `candidates` list** (Gemini's safety filtering can return this) is
  a realistic failure shape, not just a theoretical "malformed JSON" — it must fail soft to `None`
  exactly like any other bad response, never raise an uncaught `IndexError`. (Task 1)
- **A denied microphone permission, or any `SpeechRecognition` error mid-listen**, must reset the
  mic button back to its normal state — a farmer who declines the permission prompt must not be
  left staring at a button stuck on "Listening…" forever. (Task 4)
- **Switching the UI language mid-conversation** (via the app's existing language switcher) while
  voice output is on must make the *next* spoken reply use the *new* language, not a value captured
  once when the component first mounted. (Task 5)
- **Two bot replies arriving close together** (a farmer sends a second question before the first
  reply finishes being read aloud) must not speak over each other — each new utterance cancels
  whatever is still speaking before it starts. (Task 5)

---

### Task 1: `chatbot/gemini_chat.py` — the Gemini call module

**Files:**
- Create: `backend/chatbot/gemini_chat.py`
- Test: `backend/chatbot/tests.py` (new `GeminiChatTests` class)

**Interfaces:**
- Consumes: `settings.GEMINI_API_KEY`, `settings.GEMINI_MODEL` (existing, `config/settings.py`).
- Produces: `generate_chat_reply(message: str, history: list[dict], ui_language: str) -> str | None`
  — `history` entries are `{"sender": "user" | "bot", "text": str}` dicts, oldest first, already
  trimmed to `MAX_HISTORY_TURNS` by the caller. `ui_language` is one of `"en"` / `"kn"` / `"hi"`.
  Also produces module constant `MAX_HISTORY_TURNS = 10` (Task 2 imports this to trim before
  calling). Later tasks (Task 2) import only `generate_chat_reply` and `MAX_HISTORY_TURNS`.

- [ ] **Step 1: Write the failing tests**

```python
from unittest.mock import patch
from django.test import TestCase, override_settings
from chatbot.gemini_chat import generate_chat_reply


@override_settings(GEMINI_API_KEY="test-key", GEMINI_MODEL="gemini-3.5-flash-lite")
class GeminiChatTests(TestCase):

    @patch("chatbot.gemini_chat.requests.post")
    def test_successful_reply_returns_parsed_text(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "Water early morning for rice."}]}}]
        }
        result = generate_chat_reply("when should I water my rice?", [], "en")
        self.assertEqual(result, "Water early morning for rice.")

    @override_settings(GEMINI_API_KEY="")
    @patch("chatbot.gemini_chat.requests.post")
    def test_blank_api_key_returns_none_without_a_network_call(self, mock_post):
        result = generate_chat_reply("hello", [], "en")
        self.assertIsNone(result)
        mock_post.assert_not_called()

    @patch("chatbot.gemini_chat.requests.post")
    def test_request_exception_returns_none(self, mock_post):
        import requests
        mock_post.side_effect = requests.ConnectionError("boom")
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_non_200_status_returns_none(self, mock_post):
        mock_post.return_value.status_code = 503
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_malformed_json_shape_returns_none(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"unexpected": "shape"}
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_empty_candidates_list_returns_none_not_a_crash(self, mock_post):
        # A real shape Gemini can return under safety filtering -- a 200
        # with no candidates at all, not a missing/renamed key.
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"candidates": []}
        self.assertIsNone(generate_chat_reply("hello", [], "en"))

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_maps_to_alternating_user_and_model_roles(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [
            {"sender": "user", "text": "hi"},
            {"sender": "bot", "text": "hello, how can I help?"},
        ]
        generate_chat_reply("how are you", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            sent_payload["contents"],
            [
                {"role": "user", "parts": [{"text": "hi"}]},
                {"role": "model", "parts": [{"text": "hello, how can I help?"}]},
                {"role": "user", "parts": [{"text": "how are you"}]},
            ],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_history_entry_missing_sender_or_text_is_skipped_not_raised(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        history = [
            {"sender": "user"},            # missing text
            {"text": "no sender here"},    # missing sender
            {"sender": "user", "text": "valid turn"},
        ]
        generate_chat_reply("final message", history, "en")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            sent_payload["contents"],
            [
                {"role": "user", "parts": [{"text": "valid turn"}]},
                {"role": "user", "parts": [{"text": "final message"}]},
            ],
        )

    @patch("chatbot.gemini_chat.requests.post")
    def test_ui_language_hint_is_appended_to_the_system_instruction(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "ok"}]}}]
        }
        generate_chat_reply("ok", [], "kn")
        sent_payload = mock_post.call_args.kwargs["json"]
        self.assertIn("Kannada", sent_payload["systemInstruction"]["parts"][0]["text"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python manage.py test chatbot.tests.GeminiChatTests -v 2`
Expected: FAIL with "No module named 'chatbot.gemini_chat'" (or similar import error).

- [ ] **Step 3: Implement `backend/chatbot/gemini_chat.py`**

Copy the request mechanics directly from `backend/crops/diary_ai.py`: `GEMINI_URL_TEMPLATE`,
`REQUEST_TIMEOUT_SECONDS = 5`, the `x-goog-api-key` header (never the URL), and a copy of
`_supports_disabling_thinking(model)` (returns `model.startswith("gemini-2.5-flash")`) feeding a
`thinkingConfig: {"thinkingBudget": 0}` entry in `generationConfig` when it returns `True`. Add
`logger.warning(...)` at each of the three failure points (exception type only, never `str(exc)`),
exactly as `diary_ai.py` does.

New pieces this module needs that `diary_ai.py` doesn't have:

```python
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
    hint_name = _LANGUAGE_HINT_NAMES.get(ui_language, "English")
    return (
        SYSTEM_INSTRUCTION
        + f" If the farmer's message doesn't clearly indicate its own language, reply in {hint_name}."
    )


def _history_to_contents(history):
    """Maps {"sender": "user"|"bot", "text": str} dicts to Gemini's
    {"role": "user"|"model", "parts": [...]} shape, skipping any entry
    missing "sender" or "text" (or with an unrecognized sender)."""
    role_by_sender = {"user": "user", "bot": "model"}
    contents = []
    for entry in history:
        role = role_by_sender.get(entry.get("sender"))
        text = entry.get("text")
        if role is None or not text:
            continue
        contents.append({"role": role, "parts": [{"text": text}]})
    return contents
```

`generate_chat_reply(message, history, ui_language)` builds `contents = _history_to_contents(history)
+ [{"role": "user", "parts": [{"text": message}]}]`, builds `systemInstruction` from
`_system_instruction_for(ui_language)`, and otherwise follows `diary_ai.generate_diary_analysis`'s
exact request/response handling (try/except around `requests.post`, status check, then
`data["candidates"][0]["content"]["parts"][0]["text"]` inside a second try/except catching
`(ValueError, KeyError, IndexError, TypeError)` — this is what already turns an empty `candidates`
list into a caught `IndexError`, so no extra special-casing is needed for that failure mode beyond
reusing this exact exception tuple).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python manage.py test chatbot.tests.GeminiChatTests -v 2`
Expected: PASS (9/9)

- [ ] **Step 5: Commit**

```bash
git add backend/chatbot/gemini_chat.py backend/chatbot/tests.py
git commit -m "feat: add Gemini-backed conversational chat module for the chatbot"
```

---

### Task 2: Wire `generate_chat_reply` into `ChatMessageView`

**Files:**
- Modify: `backend/chatbot/serializers.py`
- Modify: `backend/chatbot/views.py`
- Modify: `backend/chatbot/tests.py` (update 2 existing tests, add new `ChatMessageViewAiTests` class)

**Interfaces:**
- Consumes: `generate_chat_reply`, `MAX_HISTORY_TURNS` (Task 1, `chatbot/gemini_chat.py`).
- Produces: the view's final response shape `{"reply", "recognized", "intent", "source"}` — no
  other task consumes this directly (it's the API contract Task 3 calls into).

- [ ] **Step 1: Write the failing tests**

First, two **existing** tests in `ChatMessageViewTests` need `@override_settings(GEMINI_API_KEY="")`
added, because they're about to start reaching `generate_chat_reply` for the first time and must
deterministically hit the FAQ fallback regardless of whatever `GEMINI_API_KEY` happens to be set in
the run environment (the same non-determinism bug already fixed once this session in
`videos/tests.py`, for the same reason — on the real device a real key is now configured for the
Farming Diary feature, so without this override these tests would silently start making real
network calls):

```python
@override_settings(GEMINI_API_KEY="")
def test_recognized_message_returns_200_with_recognized_true(self):
    ...  # body unchanged

@override_settings(GEMINI_API_KEY="")
def test_unrecognized_message_returns_200_with_the_fallback_and_recognized_false(self):
    ...  # body unchanged
```

(The other existing tests — unauthenticated, blank, missing, whitespace-only, over-length — all
return before the view ever calls `generate_chat_reply`, so they're unaffected and need no change.)

New tests, in a new `ChatMessageViewAiTests` class:

```python
from unittest.mock import patch


class ChatMessageViewAiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()
        self.url = reverse("chatbot-message")
        self.client.force_authenticate(self.user)

    @patch("chatbot.views.generate_chat_reply")
    def test_successful_ai_reply_returns_source_ai(self, mock_generate):
        mock_generate.return_value = "Try planting after the first rains."
        response = self.client.post(self.url, {"message": "when should I plant rice?"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "reply": "Try planting after the first rains.",
                "recognized": True,
                "intent": None,
                "source": "ai",
            },
        )

    @patch("chatbot.views.generate_chat_reply")
    def test_ai_failure_falls_back_to_the_faq_matcher_with_source_faq(self, mock_generate):
        mock_generate.return_value = None
        response = self.client.post(self.url, {"message": "hello there"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "faq")
        self.assertTrue(response.data["recognized"])
        self.assertEqual(response.data["intent"], "greeting")

    @patch("chatbot.views.generate_chat_reply")
    def test_missing_history_and_ui_language_fields_still_succeeds(self, mock_generate):
        mock_generate.return_value = "a reply"
        response = self.client.post(self.url, {"message": "hello"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_generate.assert_called_once_with("hello", [], "en")

    @patch("chatbot.views.generate_chat_reply")
    def test_a_malformed_history_entry_does_not_400(self, mock_generate):
        mock_generate.return_value = "a reply"
        response = self.client.post(
            self.url,
            {"message": "hello", "history": [{"sender": "user"}], "ui_language": "kn"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("chatbot.views.generate_chat_reply")
    def test_history_is_trimmed_to_the_last_max_history_turns_before_calling_gemini(self, mock_generate):
        mock_generate.return_value = "a reply"
        long_history = [{"sender": "user", "text": f"message {i}"} for i in range(15)]
        self.client.post(
            self.url,
            {"message": "final one", "history": long_history, "ui_language": "en"},
            format="json",
        )
        passed_history = mock_generate.call_args[0][1]
        self.assertEqual(len(passed_history), 10)
        self.assertEqual(passed_history[0]["text"], "message 5")   # oldest 5 dropped
        self.assertEqual(passed_history[-1]["text"], "message 14")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python manage.py test chatbot -v 2`
Expected: FAIL — the two updated tests still pass (their behavior hasn't changed yet), but every
new `ChatMessageViewAiTests` test fails (`generate_chat_reply` isn't imported/called yet, so
`source` is missing from the response and `mock_generate` is never invoked).

- [ ] **Step 3: Implement the serializer and view changes**

In `backend/chatbot/serializers.py`, add to `ChatMessageSerializer`:

```python
history = serializers.ListField(child=serializers.DictField(), required=False, default=list)
ui_language = serializers.ChoiceField(choices=["en", "kn", "hi"], required=False, default="en")
```

In `backend/chatbot/views.py`, import `generate_chat_reply, MAX_HISTORY_TURNS` from
`.gemini_chat`. In `ChatMessageView.post`, after the existing `message = sanitize_message(...)` /
blank-message-400 check, trim and call:

```python
history = serializer.validated_data["history"][-MAX_HISTORY_TURNS:]
ui_language = serializer.validated_data["ui_language"]

ai_reply = generate_chat_reply(message, history, ui_language)
if ai_reply is not None:
    return Response(
        {"reply": ai_reply, "recognized": True, "intent": None, "source": "ai"},
        status=status.HTTP_200_OK,
    )

reply, intent, recognized = match_intent(message)
return Response(
    {"reply": reply, "recognized": recognized, "intent": intent, "source": "faq"},
    status=status.HTTP_200_OK,
)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python manage.py test chatbot -v 2`
Expected: PASS (full `chatbot` app test suite, every test)

- [ ] **Step 5: Commit**

```bash
git add backend/chatbot/serializers.py backend/chatbot/views.py backend/chatbot/tests.py
git commit -m "feat: wire Gemini chat replies into the chatbot endpoint, with FAQ fallback"
```

---

### Task 3: Frontend — conversation history and UI language, no voice yet

**Files:**
- Modify: `frontend/src/api/chatbot.js`
- Modify: `frontend/src/pages/ChatbotPage.jsx`
- Modify: `frontend/src/pages/ChatbotPage.test.jsx`

**Interfaces:**
- Consumes: the `ChatMessageView` response shape from Task 2 (adds `source`, which this task does
  not need to read or display).
- Produces: `sendChatMessage(message, history, uiLanguage)` (new 3-arg signature) — Task 4 and
  Task 5 both call this same function unchanged; neither touches `api/chatbot.js` again.

- [ ] **Step 1: Write the failing tests**

Update the existing call-assertion (the behavior being asserted — that typing "how do I scan my
crop" triggers a call — hasn't changed, but the call now carries two more arguments) in the
existing test `"sends a recognized message and shows the bot's matched reply"`:

```js
import i18n from "../i18n";
// ...
expect(chatbotApi.sendChatMessage).toHaveBeenCalledWith(
  "how do I scan my crop",
  [{ sender: "bot", text: i18n.t("chatbot.greeting") }],
  i18n.language
);
```

Add one new test:

```js
it("sends prior conversation history and the active UI language with each message", async () => {
  chatbotApi.sendChatMessage.mockResolvedValue({
    reply: "Here's some advice.",
    recognized: true,
    intent: null,
    source: "ai",
  });

  render(
    <MemoryRouter>
      <ChatbotPage />
    </MemoryRouter>
  );

  await sendMessage("hello");
  await waitFor(() => expect(chatbotApi.sendChatMessage).toHaveBeenCalledTimes(1));
  expect(chatbotApi.sendChatMessage).toHaveBeenCalledWith(
    "hello",
    [{ sender: "bot", text: i18n.t("chatbot.greeting") }],
    i18n.language
  );

  await sendMessage("thanks");
  await waitFor(() => expect(chatbotApi.sendChatMessage).toHaveBeenCalledTimes(2));
  expect(chatbotApi.sendChatMessage).toHaveBeenLastCalledWith(
    "thanks",
    [
      { sender: "bot", text: i18n.t("chatbot.greeting") },
      { sender: "user", text: "hello" },
      { sender: "bot", text: "Here's some advice." },
    ],
    i18n.language
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx`
Expected: FAIL — the updated assertion and the new test both fail (`sendChatMessage` is still
called with just one argument).

- [ ] **Step 3: Implement the history/language wiring**

In `frontend/src/api/chatbot.js`:

```js
export async function sendChatMessage(message, history = [], uiLanguage = "en") {
  const { data } = await api.post("chatbot/message/", { message, history, ui_language: uiLanguage });
  return data;
}
```

In `frontend/src/pages/ChatbotPage.jsx`, add `const { t, i18n } = useTranslation();` (destructuring
`i18n` alongside the existing `t`). In `handleSubmit`, build `history` from the `messages` state
value **as it stands at the moment `handleSubmit` runs — before** this submission's own
`setMessages` call appends the new user bubble (reading the `messages` closure variable directly,
before calling `setMessages`, naturally excludes the just-typed message, so it is never duplicated
between the `history` array and the separate `message` argument):

```js
const history = messages.slice(-10).map(({ sender, text }) => ({ sender, text }));
```

Pass `history` and `i18n.language` as the second and third arguments to `sendChatMessage(text,
history, i18n.language)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx`
Expected: PASS (all existing tests plus the new one)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/chatbot.js frontend/src/pages/ChatbotPage.jsx frontend/src/pages/ChatbotPage.test.jsx
git commit -m "feat: send conversation history and UI language with each chat message"
```

---

### Task 4: Frontend — voice input (microphone button)

**Files:**
- Modify: `frontend/src/pages/ChatbotPage.jsx`
- Modify: `frontend/src/i18n/locales/en.json`, `kn.json`, `hi.json`
- Modify: `frontend/src/pages/ChatbotPage.test.jsx`

**Interfaces:**
- Produces: the `languageToSpeechCode` constant (`{en: "en-IN", kn: "kn-IN", hi: "hi-IN"}`), defined
  in `ChatbotPage.jsx` — Task 5 imports/reuses this exact constant for speech output, does not
  redefine it.
- Produces: new i18n keys `chatbot.micLabel`, `chatbot.micListening`.

- [ ] **Step 1: Write the failing tests**

```js
describe("ChatbotPage voice input", () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });

  it("does not render a microphone button when SpeechRecognition is unsupported", () => {
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/start voice input/i)).not.toBeInTheDocument();
  });

  it("starts recognition in the active language and fills the input without auto-sending", async () => {
    let instance;
    window.SpeechRecognition = vi.fn().mockImplementation(() => {
      instance = { start: vi.fn(), lang: "", onresult: null, onerror: null, onend: null };
      return instance;
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByLabelText(/start voice input/i));
    expect(instance.lang).toBe("en-IN");
    expect(instance.start).toHaveBeenCalled();

    instance.onresult({ results: [[{ transcript: "how is my rice crop" }]] });
    expect(screen.getByPlaceholderText(/type your question/i)).toHaveValue("how is my rice crop");
    expect(chatbotApi.sendChatMessage).not.toHaveBeenCalled();
  });

  it("resets the listening state when recognition errors (e.g. permission denied)", async () => {
    let instance;
    window.SpeechRecognition = vi.fn().mockImplementation(() => {
      instance = { start: vi.fn(), lang: "", onresult: null, onerror: null, onend: null };
      return instance;
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByLabelText(/start voice input/i));
    expect(screen.getByLabelText(/listening/i)).toBeInTheDocument();

    instance.onerror({ error: "not-allowed" });
    expect(screen.getByLabelText(/start voice input/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx -t "voice input"`
Expected: FAIL (no mic button exists yet)

- [ ] **Step 3: Implement the microphone button**

Add near the top of the component body (outside any render-time condition, so it runs once per
mount):

```js
const languageToSpeechCode = { en: "en-IN", kn: "kn-IN", hi: "hi-IN" };
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
```

Add `const [isListening, setIsListening] = useState(false);`. The mic button renders only when
`SpeechRecognitionCtor` is truthy. On click, construct `new SpeechRecognitionCtor()`, set
`.lang = languageToSpeechCode[i18n.language] || "en-IN"`, `interimResults = false`, `continuous =
false`; set `onresult` to read `event.results[0][0].transcript` into the existing `input` state
(via `setInput`, **not** a call to `handleSubmit` — review focus and the spec both require no auto-
send); set both `onerror` and `onend` to `setIsListening(false)`; call `.start()` then
`setIsListening(true)`. The button's `aria-label` is `t("chatbot.micLabel")` when `!isListening` and
`t("chatbot.micListening")` when listening.

- [ ] **Step 4: Add the new i18n keys** under `"chatbot"` in all three locale files:

```json
"micLabel": "Start voice input",
"micListening": "Listening…"
```
```json
"micLabel": "ಧ್ವನಿ ಇನ್‌ಪುಟ್ ಪ್ರಾರಂಭಿಸಿ",
"micListening": "ಆಲಿಸಲಾಗುತ್ತಿದೆ…"
```
```json
"micLabel": "आवाज़ इनपुट शुरू करें",
"micListening": "सुन रहा है…"
```

(en / kn / hi respectively, each inserted alongside the other `"chatbot.*"` keys.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ChatbotPage.jsx frontend/src/i18n/locales/ frontend/src/pages/ChatbotPage.test.jsx
git commit -m "feat: add voice input (speech-to-text) to the chatbot"
```

---

### Task 5: Frontend — voice output (speaker toggle), full-suite verification

**Files:**
- Modify: `frontend/src/pages/ChatbotPage.jsx`
- Modify: `frontend/src/i18n/locales/en.json`, `kn.json`, `hi.json`
- Modify: `frontend/src/pages/ChatbotPage.test.jsx`

**Interfaces:**
- Consumes: `languageToSpeechCode` (Task 4, `ChatbotPage.jsx`).
- Produces: new i18n keys `chatbot.voiceOnLabel`, `chatbot.voiceOffLabel`. This is the plan's final
  task — no later task consumes anything from it.

- [ ] **Step 1: Write the failing tests**

```js
describe("ChatbotPage voice output", () => {
  afterEach(() => {
    delete window.speechSynthesis;
    delete global.SpeechSynthesisUtterance;
  });

  function stubSpeechSynthesis() {
    const speak = vi.fn();
    const cancel = vi.fn();
    window.speechSynthesis = { speak, cancel, getVoices: () => [] };
    global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => ({ text, lang: "" }));
    return { speak, cancel };
  }

  it("does not render a speaker toggle when speechSynthesis is unsupported", () => {
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText(/mute voice replies/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/unmute voice replies/i)).not.toBeInTheDocument();
  });

  it("does not speak the initial greeting on mount", () => {
    const { speak } = stubSpeechSynthesis();
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks a new bot reply, in the active language, when voice output is on", async () => {
    const { speak } = stubSpeechSynthesis();
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "Water early in the morning.",
      recognized: true,
      intent: null,
      source: "ai",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("when should I water?");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    const spoken = speak.mock.calls[0][0];
    expect(spoken.text).toBe("Water early in the morning.");
    expect(spoken.lang).toBe("en-IN");
  });

  it("cancels any in-progress speech before speaking the next reply", async () => {
    const { speak, cancel } = stubSpeechSynthesis();
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "ok", recognized: true, intent: null, source: "ai",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("first");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not speak the next reply after voice output is turned off", async () => {
    const { speak } = stubSpeechSynthesis();
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "ok", recognized: true, intent: null, source: "ai",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByLabelText(/mute voice replies/i));
    expect(screen.getByLabelText(/unmute voice replies/i)).toBeInTheDocument();

    await sendMessage("hello");
    await waitFor(() => expect(chatbotApi.sendChatMessage).toHaveBeenCalled());
    expect(speak).not.toHaveBeenCalled();
  });

  it("speaks the next reply in a newly-switched UI language, not the one active at mount", async () => {
    const { speak } = stubSpeechSynthesis();
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "ಬೆಳಿಗ್ಗೆ ನೀರು ಹಾಕಿ.", recognized: true, intent: null, source: "ai",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await act(async () => {
      await i18n.changeLanguage("kn");
    });

    await sendMessage("ಯಾವಾಗ ನೀರು ಹಾಕಬೇಕು?");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0].lang).toBe("kn-IN");

    await i18n.changeLanguage("en"); // restore default for later test files
  });
});
```

(This file's existing `import` block needs `act` added from `@testing-library/react` and `i18n`
from `../i18n`, if Task 3 didn't already add the `i18n` import.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx -t "voice output"`
Expected: FAIL (no speaker toggle exists yet)

- [ ] **Step 3: Implement the speaker toggle and auto-speak behavior**

Add `const speechSynthesisSupported = "speechSynthesis" in window;` and
`const [voiceOutputOn, setVoiceOutputOn] = useState(true);`. The speaker toggle button renders only
when `speechSynthesisSupported`; clicking it flips `voiceOutputOn`. Its `aria-label` is
`t("chatbot.voiceOnLabel")` (meaning "tap to mute" — shown while voice output is currently on) when
`voiceOutputOn`, and `t("chatbot.voiceOffLabel")` (meaning "tap to unmute") when not.

Speaking only newly-arrived bot replies (never the initial greeting present at mount) needs a
small piece of state the mount value seeds correctly:

```js
const spokenCountRef = useRef(messages.length); // seeds with the initial greeting's count (1)

useEffect(() => {
  const last = messages[messages.length - 1];
  const isNewBotMessage = messages.length > spokenCountRef.current && last.sender === "bot";
  spokenCountRef.current = messages.length;
  if (!isNewBotMessage || !voiceOutputOn || !speechSynthesisSupported) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(last.text);
  utterance.lang = languageToSpeechCode[i18n.language] || "en-IN";
  window.speechSynthesis.speak(utterance);
}, [messages, voiceOutputOn]);
```

- [ ] **Step 4: Add the new i18n keys** under `"chatbot"` in all three locale files:

```json
"voiceOnLabel": "Mute voice replies",
"voiceOffLabel": "Unmute voice replies"
```
```json
"voiceOnLabel": "ಧ್ವನಿ ಪ್ರತ್ಯುತ್ತರಗಳನ್ನು ಮ್ಯೂಟ್ ಮಾಡಿ",
"voiceOffLabel": "ಧ್ವನಿ ಪ್ರತ್ಯುತ್ತರಗಳನ್ನು ಅನ್‌ಮ್ಯೂಟ್ ಮಾಡಿ"
```
```json
"voiceOnLabel": "आवाज़ जवाब म्यूट करें",
"voiceOffLabel": "आवाज़ जवाब अनम्यूट करें"
```

- [ ] **Step 5: Run the full test suites and build**

Run: `npx vitest run src/pages/ChatbotPage.test.jsx`
Expected: PASS (every test in the file)

Run: `python manage.py test`
Expected: PASS (full backend suite — no regressions in any other app)

Run: `npx vitest run`
Expected: PASS (full frontend suite — no regressions in any other page)

Run: `npm run build`
Expected: clean build, no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ChatbotPage.jsx frontend/src/i18n/locales/ frontend/src/pages/ChatbotPage.test.jsx
git commit -m "feat: add voice output (text-to-speech) to the chatbot"
```
