import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ChatbotPage from "./ChatbotPage";
import * as chatbotApi from "../api/chatbot";

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
    expect(chatbotApi.sendChatMessage).toHaveBeenCalledWith("how do I scan my crop");
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
