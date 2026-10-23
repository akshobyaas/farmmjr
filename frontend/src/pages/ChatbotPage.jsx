import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sendChatMessage } from "../api/chatbot";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

let nextId = 1;

// BCP-47 codes Web Speech API expects, keyed by this app's own i18n codes.
// Shared by both voice input (this file's mic button) and voice output
// (the speaker toggle) -- defined once here, reused, never redefined.
const languageToSpeechCode = { en: "en-IN", kn: "kn-IN", hi: "hi-IN" };

export default function ChatbotPage() {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState(() => [
    { id: 0, sender: "bot", text: t("chatbot.greeting") },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceOutputOn, setVoiceOutputOn] = useState(true);
  const bottomRef = useRef(null);
  // Seeds with the initial greeting's count (1) so that greeting is never
  // spoken on mount -- only messages appended after mount count as "new".
  const spokenCountRef = useRef(messages.length);
  // Holds the active SpeechRecognition instance (if any), so it can be
  // stopped on unmount -- otherwise it keeps listening after the farmer
  // navigates away from this page.
  const recognitionRef = useRef(null);

  // Feature-detected on every render (not module scope) so a mocked
  // window.SpeechRecognition set up before render -- as every test for
  // this does -- is actually picked up; undefined in any browser without
  // Web Speech API support, in which case the mic button below simply
  // isn't rendered -- typed chat still works everywhere.
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechSynthesisSupported = "speechSynthesis" in window;

  const handleMicClick = () => {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = languageToSpeechCode[i18n.language] || "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      // Fills the text input only -- never auto-sends, so the farmer can
      // review or edit the transcript before sending, same control they
      // have when typing.
      setInput(event.results[0][0].transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

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

  // Stops any speech still playing and any still-active recognition when
  // the farmer navigates away -- speechSynthesis is browser-wide, so
  // without this a reply would keep being read aloud after leaving the
  // page, and an open mic would keep listening.
  useEffect(() => {
    return () => {
      if (speechSynthesisSupported) window.speechSynthesis.cancel();
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // Built from `messages` as it stands before this submission's own
    // setMessages call below appends the new user bubble -- that keeps
    // the just-typed message out of `history`, so it's never duplicated
    // between this array and the separate `text` argument.
    const history = messages.slice(-10).map(({ sender, text: msgText }) => ({ sender, text: msgText }));

    setMessages((prev) => [...prev, { id: nextId++, sender: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const data = await sendChatMessage(text, history, i18n.language);
      setMessages((prev) => [...prev, { id: nextId++, sender: "bot", text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          sender: "bot",
          text: t("chatbot.connectionError"),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dashboard-page">
      <AppHeader title={t("chatbot.title")} />

      {speechSynthesisSupported && (
        <button
          type="button"
          className="btn-icon chatbot-voice-toggle"
          onClick={() => {
            setVoiceOutputOn((prev) => {
              const next = !prev;
              // Turning voice off should stop whatever is already being
              // read aloud right now, not just suppress future replies.
              if (!next) window.speechSynthesis.cancel();
              return next;
            });
          }}
          aria-label={voiceOutputOn ? t("chatbot.voiceOnLabel") : t("chatbot.voiceOffLabel")}
        >
          {voiceOutputOn ? "🔊" : "🔇"}
        </button>
      )}

      <main className="app-main chatbot-main">
        <div className="chatbot-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble ${msg.sender === "user" ? "chat-bubble-user" : "chat-bubble-bot"}`}
            >
              {msg.text}
            </div>
          ))}
          {sending && (
            <div className="chat-bubble chat-bubble-bot chat-bubble-typing" aria-live="polite">
              {t("chatbot.thinking")}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chatbot-input-form" onSubmit={handleSubmit}>
          <label htmlFor="chatbot-input" className="sr-only">
            {t("chatbot.inputLabel")}
          </label>
          <input
            id="chatbot-input"
            type="text"
            placeholder={t("chatbot.inputPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="chatbot-text-input"
            disabled={sending}
          />
          {SpeechRecognitionCtor && (
            <button
              type="button"
              className={`btn-icon chatbot-mic-button ${isListening ? "chatbot-mic-listening" : ""}`}
              onClick={handleMicClick}
              disabled={sending || isListening}
              aria-label={isListening ? t("chatbot.micListening") : t("chatbot.micLabel")}
            >
              🎤
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={sending || !input.trim()}>
            {t("chatbot.sendButton")}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
