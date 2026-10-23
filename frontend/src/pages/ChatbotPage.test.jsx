import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ChatbotPage from "./ChatbotPage";
import * as chatbotApi from "../api/chatbot";
import i18n from "../i18n";

vi.mock("../api/chatbot");

// jsdom doesn't implement scrollIntoView -- stub it like ScanUploadPage.test.jsx
// stubs URL.createObjectURL for a browser API jsdom lacks.
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

async function sendMessage(text) {
  await userEvent.type(screen.getByPlaceholderText(/type your question/i), text);
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
}

describe("ChatbotPage", () => {
  it("shows an initial greeting from the bot", () => {
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/hi! ask me about scanning crops/i)).toBeInTheDocument();
  });

  it("sends a recognized message and shows the bot's matched reply", async () => {
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "To check a crop for disease: go to 'Scan a Crop' from the dashboard...",
      recognized: true,
      intent: "scan_help",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("how do I scan my crop");

    expect(screen.getByText("how do I scan my crop")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/go to 'scan a crop'/i)).toBeInTheDocument();
    });
    expect(chatbotApi.sendChatMessage).toHaveBeenCalledWith(
      "how do I scan my crop",
      [{ sender: "bot", text: i18n.t("chatbot.greeting") }],
      i18n.language
    );
  });

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

  it("shows the graceful fallback reply for an unrecognized/gibberish message", async () => {
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "I'm not sure — would you like to ask our expert instead?",
      recognized: false,
      intent: null,
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("asdkjhaskjdhqwepoiqwe");

    await waitFor(() => {
      expect(screen.getByText(/ask our expert instead/i)).toBeInTheDocument();
    });
  });

  it("treats SQL-like or script-tag input as plain text, not something that breaks the UI", async () => {
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "I'm not sure — would you like to ask our expert instead?",
      recognized: false,
      intent: null,
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("<script>alert(1)</script>");

    // Rendered as literal text (React escapes it), not executed -- no
    // matching script element ever appears in the DOM.
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script[data-injected]")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/ask our expert instead/i)).toBeInTheDocument();
    });
  });

  it("shows a plain-language error and does not crash on a network failure", async () => {
    chatbotApi.sendChatMessage.mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("hello");

    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });
  });

  it("disables sending an empty or whitespace-only message", async () => {
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/type your question/i), "   ");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(chatbotApi.sendChatMessage).not.toHaveBeenCalled();
  });
});

describe("ChatbotPage voice input", () => {
  afterEach(() => {
    // Explicitly unmount (idempotent if RTL's own automatic cleanup
    // already ran) before deleting the mocked API below -- the
    // unmount-cleanup effect in ChatbotPage calls recognitionRef into
    // this same window global, so deleting it first would make that
    // effect fail with a stale/undefined reference instead of testing
    // real unmount behavior.
    cleanup();
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
    window.SpeechRecognition = vi.fn().mockImplementation(function () {
      instance = { start: vi.fn(), stop: vi.fn(), lang: "", onresult: null, onerror: null, onend: null };
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

    act(() => {
      instance.onresult({ results: [[{ transcript: "how is my rice crop" }]] });
    });
    expect(screen.getByPlaceholderText(/type your question/i)).toHaveValue("how is my rice crop");
    expect(chatbotApi.sendChatMessage).not.toHaveBeenCalled();
  });

  it("resets the listening state when recognition errors (e.g. permission denied)", async () => {
    let instance;
    window.SpeechRecognition = vi.fn().mockImplementation(function () {
      instance = { start: vi.fn(), stop: vi.fn(), lang: "", onresult: null, onerror: null, onend: null };
      return instance;
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByLabelText(/start voice input/i));
    expect(screen.getByLabelText(/listening/i)).toBeInTheDocument();

    act(() => {
      instance.onerror({ error: "not-allowed" });
    });
    expect(screen.getByLabelText(/start voice input/i)).toBeInTheDocument();
  });
});

describe("ChatbotPage voice output", () => {
  afterEach(() => {
    // Same reason as the voice-input describe block above: unmount while
    // window.speechSynthesis still exists, since ChatbotPage's own
    // unmount-cleanup effect calls window.speechSynthesis.cancel().
    cleanup();
    delete window.speechSynthesis;
    delete global.SpeechSynthesisUtterance;
  });

  function stubSpeechSynthesis() {
    const speak = vi.fn();
    const cancel = vi.fn();
    window.speechSynthesis = { speak, cancel, getVoices: () => [] };
    global.SpeechSynthesisUtterance = vi.fn().mockImplementation(function (text) {
      return { text, lang: "" };
    });
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

  it("stops any in-progress speech immediately when voice output is turned off", async () => {
    const { speak, cancel } = stubSpeechSynthesis();
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "a long reply being read aloud", recognized: true, intent: null, source: "ai",
    });

    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await sendMessage("hello");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    cancel.mockClear();

    await userEvent.click(screen.getByLabelText(/mute voice replies/i));
    expect(cancel).toHaveBeenCalled();
  });

  it("stops any in-progress speech and active recognition when the page unmounts", async () => {
    const { speak, cancel } = stubSpeechSynthesis();
    let recognitionInstance;
    window.SpeechRecognition = vi.fn().mockImplementation(function () {
      recognitionInstance = { start: vi.fn(), stop: vi.fn(), lang: "", onresult: null, onerror: null, onend: null };
      return recognitionInstance;
    });
    chatbotApi.sendChatMessage.mockResolvedValue({
      reply: "a reply", recognized: true, intent: null, source: "ai",
    });

    const { unmount } = render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByLabelText(/start voice input/i));
    await sendMessage("hello");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    cancel.mockClear();

    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(recognitionInstance.stop).toHaveBeenCalled();
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

    // Once the UI has switched to Kannada, the placeholder/button text the
    // shared sendMessage() helper looks for is in Kannada too -- find the
    // input and submit the form directly, language-independent.
    const textbox = screen.getByRole("textbox");
    await userEvent.type(textbox, "ಯಾವಾಗ ನೀರು ಹಾಕಬೇಕು?");
    fireEvent.submit(textbox.closest("form"));

    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak.mock.calls[0][0].lang).toBe("kn-IN");

    await i18n.changeLanguage("en"); // restore default for later test files
  });
});
