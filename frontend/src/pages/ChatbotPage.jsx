import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sendChatMessage } from "../api/chatbot";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

let nextId = 1;

export default function ChatbotPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState(() => [
    { id: 0, sender: "bot", text: t("chatbot.greeting") },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { id: nextId++, sender: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const data = await sendChatMessage(text);
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
      <AppHeader icon="💬" title={t("chatbot.title")} />

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
