import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useChatbot } from "../hooks/useChatbot";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./ChatbotPage.module.css";

export default function ChatbotPage() {
  const { t } = useTranslation();
  const {
    messages,
    input,
    setInput,
    sending,
    isListening,
    voiceOutputOn,
    setVoiceOutputOn,
    bottomRef,
    SpeechRecognitionCtor,
    speechSynthesisSupported,
    handleMicClick,
    handleSubmit,
  } = useChatbot();

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

      <main className={`app-main ${styles["chatbot-main"]}`}>
        <div className={styles["chatbot-messages"]}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles["chat-bubble"]} ${msg.sender === "user" ? styles["chat-bubble-user"] : styles["chat-bubble-bot"]}`}
            >
              {msg.text}
            </div>
          ))}
          {sending && (
            <div
              className={`${styles["chat-bubble"]} ${styles["chat-bubble-bot"]} ${styles["chat-bubble-typing"]}`}
              aria-live="polite"
            >
              {t("chatbot.thinking")}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className={styles["chatbot-input-form"]} onSubmit={handleSubmit}>
          <label htmlFor="chatbot-input" className="sr-only">
            {t("chatbot.inputLabel")}
          </label>
          <input
            id="chatbot-input"
            type="text"
            placeholder={t("chatbot.inputPlaceholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={styles["chatbot-text-input"]}
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
