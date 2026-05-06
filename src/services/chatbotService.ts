import axiosClient from "./axiosClient";
import { unwrapResult } from "../utils/apiResponse";

export type ChatbotSessionResponse = {
  sessionId: number;
  status?: string;
  startedAt?: string;
  userId?: number | null;
};

type RawChatbotSessionResponse = {
  session_id?: number;   // @JsonProperty("session_id") từ ChatSessionResponse
  status?: string;
  started_at?: string;   // @JsonProperty("started_at")
  user_id?: number | null; // @JsonProperty("user_id")
};

export type ChatbotBookSuggestion = {
  book_id?: number;
  title?: string;
  authors?: string;
  selling_price?: number | string | null;
  flash_sale_price?: number | string | null;
  flash_sale_name?: string | null;
  promotion_code?: string | null;
  discount_percent?: number | string | null;
  total_stock?: number | null;
};

export type ChatbotResponse = {
  answer?: string;
  intent?: string;
  books?: ChatbotBookSuggestion[];
  promotion_info?: string;
  flash_sale_info?: string;
  has_results?: boolean;
};

export type ChatbotHistoryMessage = {
  message_id: number;
  sender_type: "USER" | "BOT" | string;
  content: string;
  created_at?: string;
};

function normalizeSessionResponse(raw: RawChatbotSessionResponse): ChatbotSessionResponse {
  const sessionId = raw?.session_id;
  if (typeof sessionId !== "number") {
    throw new Error("Không thể khởi tạo phiên chatbot.");
  }
  return {
    sessionId,
    status: raw.status,
    startedAt: raw.started_at,
    userId: raw.user_id,
  };
}

export async function createChatbotSession(): Promise<ChatbotSessionResponse> {
  const response = await axiosClient.post("/chatbot/session");
  const raw = unwrapResult<RawChatbotSessionResponse>(response);
  return normalizeSessionResponse(raw);
}

/**
 * Lấy session ACTIVE hiện tại của user đã đăng nhập.
 * Trả về null nếu chưa đăng nhập hoặc không có session nào đang active.
 */
export async function getActiveSession(): Promise<ChatbotSessionResponse | null> {
  const response = await axiosClient.get("/chatbot/session/active");
  const raw = unwrapResult<RawChatbotSessionResponse | null>(response);
  if (!raw) return null;
  const sessionId = raw?.session_id;
  if (typeof sessionId !== "number") return null;
  return normalizeSessionResponse(raw);
}

export async function sendChatbotMessage(sessionId: number, message: string) {
  const response = await axiosClient.post("/chatbot/chat", {
    sessionId,
    message,
  });
  return unwrapResult<ChatbotResponse>(response);
}

export async function getChatbotHistory(sessionId: number) {
  const response = await axiosClient.get(`/chatbot/history/${sessionId}`);
  return unwrapResult<ChatbotHistoryMessage[]>(response);
}

export async function closeChatbotSession(sessionId: number) {
  const response = await axiosClient.delete(`/chatbot/session/${sessionId}`);
  return unwrapResult<void>(response);
}
