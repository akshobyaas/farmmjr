import api from "./axios";

export async function sendChatMessage(message, history = [], uiLanguage = "en") {
  const { data } = await api.post("chatbot/message/", { message, history, ui_language: uiLanguage });
  return data;
}
