import api from "./axios";

export async function sendChatMessage(message) {
  const { data } = await api.post("chatbot/message/", { message });
  return data;
}
