import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { sendChatMessage } from "../api/chatbot";

let nextId = 1;

const INITIAL_MESSAGES = [
  {
    id: 0,
    sender: "bot",
    text: "Hi! Ask me about scanning crops, weather, crop guidance, learning videos, or nearby agri services.",
  },
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
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
          text: "Could not reach the server. Please check your connection and try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dashboard-page">
      <header className="app-header">
        <span className="app-header-icon">💬</span>
        <h1>Chatbot</h1>
      </header>

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
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className="chatbot-input-form" onSubmit={handleSubmit}>
          <label htmlFor="chatbot-input" className="sr-only">
            Type a message
          </label>
          <input
            id="chatbot-input"
            type="text"
            placeholder="Type your question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="chatbot-text-input"
            disabled={sending}
          />
          <button type="submit" className="btn-primary" disabled={sending || !input.trim()}>
            Send
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/dashboard">Back to Dashboard</Link>
        </p>
      </main>
    </div>
  );
}
