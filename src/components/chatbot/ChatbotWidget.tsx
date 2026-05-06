import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  CloseOutlined,
  RobotOutlined,
  ReloadOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { toast } from "react-toastify";
import { useAppSelector } from "../../app/hooks";
import { isStaffRole } from "../../utils/roles";
import {
  closeChatbotSession,
  createChatbotSession,
  getActiveSession,
  getChatbotHistory,
  sendChatbotMessage,
  type ChatbotBookSuggestion,
} from "../../services/chatbotService";
import { normalizeAxiosError } from "../../services/axiosClient";

// ─── Storage helpers ──────────────────────────────────────────────────────────

function getScopedKey(prefix: string, userId: string) {
  return `${prefix}:${userId || "guest"}`;
}

function resolveStorageScope(sessionUserId: string) {
  return sessionUserId || "guest";
}

function parseStoredSessionId(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function persistSessionId(sessionId: number | null, key: string) {
  try {
    if (!sessionId) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(sessionId));
  } catch {
    // ignore storage errors
  }
}

function readStoredMessages(key: string): UiMessage[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UiMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistMessages(messages: UiMessage[], key: string) {
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch {
    // ignore storage errors
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UiMessage = {
  id: string;
  sender: "USER" | "BOT";
  content: string;
  createdAt?: string;
  books?: ChatbotBookSuggestion[];
  promotionInfo?: string;
  flashSaleInfo?: string;
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const priceFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

function formatPrice(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "Liên hệ";
  }
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return String(value);
  return priceFormatter.format(numeric);
}

function getChatbotErrorMessage(error: unknown, fallback: string) {
  const normalized = normalizeAxiosError(error);
  const suffix = normalized.status ? ` (HTTP ${normalized.status})` : "";
  return `${normalized.message || fallback}${suffix}`;
}

/**
 * Render nội dung tin nhắn BOT với markdown đơn giản:
 * - **text** → in đậm
 * - Dòng bắt đầu bằng `- `, `• `, số thứ tự → bullet/numbered item
 * - Dòng chứa emoji section (⚡🏷📌💡📚) → tô màu nổi bật
 * - Mã giảm giá (ALL_CAPS_CODE) → badge
 * - \n → xuống dòng
 */
function renderBotContent(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-0.5">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIdx} className="h-1" />;
        }

        // Bullet line: starts with `- `, `• `, or numbered `1. `
        const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);

        // Section header: line starts with emoji
        const isSectionHeader = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}]/u.test(trimmed);

        const renderInlineContent = (content: string): React.ReactNode => {
          // Parse **bold** and promotion codes
          const parts = content.split(/(\*\*[^*]+\*\*|[A-Z][A-Z0-9_]{2,}(?=\s|$|[,.()]))/g);
          return parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong key={i} className="font-semibold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            // Highlight promotion codes (ALL_CAPS, 3+ chars)
            if (/^[A-Z][A-Z0-9_]{2,}$/.test(part)) {
              return (
                <code
                  key={i}
                  className="mx-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-800"
                >
                  {part}
                </code>
              );
            }
            return <span key={i}>{part}</span>;
          });
        };

        if (bulletMatch) {
          return (
            <div key={lineIdx} className="flex gap-2 py-0.5">
              <span className="mt-0.5 shrink-0 text-emerald-500">•</span>
              <span>{renderInlineContent(bulletMatch[1])}</span>
            </div>
          );
        }

        if (numberedMatch) {
          return (
            <div key={lineIdx} className="flex gap-2 py-0.5">
              <span className="shrink-0 tabular-nums text-emerald-600 font-medium">{numberedMatch[1]}.</span>
              <span>{renderInlineContent(numberedMatch[2])}</span>
            </div>
          );
        }

        if (isSectionHeader) {
          return (
            <div key={lineIdx} className="pt-1 font-semibold text-gray-800">
              {renderInlineContent(trimmed)}
            </div>
          );
        }

        return (
          <div key={lineIdx} className="leading-relaxed">
            {renderInlineContent(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatbotWidget() {
  const location = useLocation();
  const primaryRole = useAppSelector((state) => state.session.primaryRole);
  const displayName = useAppSelector((state) => state.session.displayName);
  const sessionUserId = useAppSelector((state) => state.session.userId);

  const [isOpen, setIsOpen] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Đã init chưa — tránh chạy lại boot khi messages thay đổi
  const bootedRef = useRef(false);

  const storageScope = useMemo(
    () => resolveStorageScope(sessionUserId),
    [sessionUserId],
  );
  const sessionStorageKey = useMemo(
    () => getScopedKey("bookstore_chatbot_session_id", storageScope),
    [storageScope],
  );
  const historyStorageKey = useMemo(
    () => getScopedKey("bookstore_chatbot_history", storageScope),
    [storageScope],
  );

  const shouldHide = useMemo(
    () =>
      ["/login", "/register", "/staff"].some((path) =>
        location.pathname.startsWith(path),
      ),
    [location.pathname],
  );

  const isStaff = isStaffRole(primaryRole);
  const isLoggedIn = storageScope !== "guest";

  // ─── Scroll to bottom ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  // ─── Reset khi user đổi (login/logout) ─────────────────────────────────────

  useEffect(() => {
    setSessionId(null);
    setMessages([]);
    bootedRef.current = false;
  }, [sessionUserId]);

  // ─── Boot: khởi tạo session và load history khi mở chatbot ─────────────────

  const bootChatbot = useCallback(async () => {
    if (isStaff || bootedRef.current) return;
    bootedRef.current = true;
    setIsBooting(true);

    try {
      let resolvedSessionId: number | null = null;

      if (isLoggedIn) {
        // User đã đăng nhập: lấy session ACTIVE từ backend trước
        try {
          const activeSession = await getActiveSession();
          if (activeSession?.sessionId) {
            resolvedSessionId = activeSession.sessionId;
            persistSessionId(resolvedSessionId, sessionStorageKey);
          }
        } catch {
          // Fallback sang localStorage nếu backend lỗi
        }

        // Fallback: đọc từ localStorage
        if (!resolvedSessionId) {
          resolvedSessionId = parseStoredSessionId(sessionStorageKey);
        }
      } else {
        // Guest: chỉ dùng localStorage
        resolvedSessionId = parseStoredSessionId(sessionStorageKey);
      }

      if (resolvedSessionId) {
        setSessionId(resolvedSessionId);

        // Bước 1: Hiển thị cache ngay lập tức (bao gồm cả USER và BOT)
        const cached = readStoredMessages(historyStorageKey);
        if (cached.length) {
          setMessages(cached);
          // Đã có cache → không cần sync backend, tránh overwrite messages có books/promotionInfo
          return;
        }

        // Bước 2: Không có cache → lấy từ backend (ví dụ: user xóa localStorage thủ công)
        try {
          const history = await getChatbotHistory(resolvedSessionId);
          if (history.length > 0) {
            const normalized = history.map((entry) => ({
              id: `history-${entry.message_id}`,
              sender: (entry.sender_type === "USER" ? "USER" : "BOT") as UiMessage["sender"],
              content: entry.content,
              createdAt: entry.created_at,
            }));
            setMessages(normalized);
            persistMessages(normalized, historyStorageKey);
          }
        } catch {
          // Session lỗi → xóa sessionId, giữ cache nếu có
          persistSessionId(null, sessionStorageKey);
          setSessionId(null);
        }
      } else {
        // Không có session → chỉ hiển thị cache nếu có
        const cached = readStoredMessages(historyStorageKey);
        if (cached.length) setMessages(cached);
      }
    } finally {
      setIsBooting(false);
    }
  }, [isStaff, isLoggedIn, sessionStorageKey, historyStorageKey]);

  // Chạy boot khi chatbot được mở lần đầu hoặc khi user thay đổi
  useEffect(() => {
    if (!isOpen || isStaff) return;
    bootChatbot();
  }, [isOpen, isStaff, bootChatbot]);

  // ─── Persist messages khi thay đổi ─────────────────────────────────────────

  useEffect(() => {
    if (!messages.length) return;
    persistMessages(messages, historyStorageKey);
  }, [messages, historyStorageKey]);

  // ─── Session management ─────────────────────────────────────────────────────

  async function ensureSession(): Promise<number> {
    if (sessionId) return sessionId;

    const storedSessionId = parseStoredSessionId(sessionStorageKey);
    if (storedSessionId) {
      setSessionId(storedSessionId);
      return storedSessionId;
    }

    const session = await createChatbotSession();
    setSessionId(session.sessionId);
    persistSessionId(session.sessionId, sessionStorageKey);
    return session.sessionId;
  }

  // ─── Send message ──────────────────────────────────────────────────────────

  async function handleSendMessage() {
    const safeContent = draft.trim();
    if (!safeContent || isSubmitting) return;

    const userMessage: UiMessage = {
      id: `local-${Date.now()}`,
      sender: "USER",
      content: safeContent,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSubmitting(true);

    try {
      const activeSessionId = await ensureSession();
      const response = await sendChatbotMessage(activeSessionId, safeContent);
      const answerText = response?.answer?.trim();
      const botMessage: UiMessage = {
        id: `bot-${Date.now()}`,
        sender: "BOT",
        content:
          answerText ||
          "Xin lỗi, mình chưa thể phản hồi lúc này. Bạn thử lại nhé.",
        books: response.books || [],
        promotionInfo: response.promotion_info,
        flashSaleInfo: response.flash_sale_info,
      };
      setMessages((current) => {
        const updated = [...current, botMessage];
        // Persist ngay lập tức sau khi thêm BOT message,
        // không chờ useEffect — đảm bảo localStorage luôn có đủ cả USER và BOT
        persistMessages(updated, historyStorageKey);
        return updated;
      });
    } catch (error) {
      const fallback = "Xin lỗi, mình chưa thể phản hồi lúc này. Bạn thử lại nhé.";
      setMessages((current) => {
        const updated = [
          ...current,
          {
            id: `bot-${Date.now()}`,
            sender: "BOT" as UiMessage["sender"],
            content: fallback,
          },
        ];
        persistMessages(updated, historyStorageKey);
        return updated;
      });
      toast.error(
        getChatbotErrorMessage(error, "Không gửi được tin nhắn cho chatbot."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Reset session ─────────────────────────────────────────────────────────

  async function handleResetSession() {
    if (!sessionId) {
      setMessages([]);
      persistSessionId(null, sessionStorageKey);
      persistMessages([], historyStorageKey);
      bootedRef.current = false;
      return;
    }

    try {
      setIsSubmitting(true);
      await closeChatbotSession(sessionId);
    } catch {
      // Bỏ qua lỗi close — vẫn xóa local state
    } finally {
      setSessionId(null);
      setMessages([]);
      persistSessionId(null, sessionStorageKey);
      persistMessages([], historyStorageKey);
      bootedRef.current = false;
      setIsSubmitting(false);
    }
  }

  // ─── Handle close ──────────────────────────────────────────────────────────

  function handleClose() {
    // Khi đóng chatbot: KHÔNG đóng session backend
    // Chỉ ẩn UI — session vẫn ACTIVE để mở lại có history
    // bootedRef.current giữ nguyên = true → mở lại sẽ KHÔNG boot lại
    setIsOpen(false);
  }

  // ─── Re-open: nếu đã booted rồi thì không boot lại ────────────────────────

  function handleOpen() {
    if (!bootedRef.current) {
      // Sẽ trigger bootChatbot qua useEffect
    }
    setIsOpen(true);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (shouldHide || isStaff) {
    return null;
  }

  return (
    <div className="fixed bottom-24 right-5 z-60 flex flex-col items-end gap-3">
      {isOpen ? (
        <div className="flex h-128 w-[calc(100vw-2rem)] max-w-104 flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl sm:w-[24rem]">
          {/* Header */}
          <div className="flex items-center justify-between bg-emerald-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Chatbot Sách Xanh 📚</p>
              <p className="text-xs text-emerald-100">
                Tư vấn sách tự động 24/7
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleResetSession}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
                title="Bắt đầu cuộc trò chuyện mới"
                disabled={isSubmitting}
              >
                <ReloadOutlined />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
                title="Đóng (lịch sử được giữ lại)"
              >
                <CloseOutlined />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex min-h-0 flex-1 flex-col bg-gray-50">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && !isBooting ? (
                <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-gray-600">
                  <p className="font-semibold text-emerald-700">
                    Xin chào{displayName ? `, ${displayName}` : ""}! 👋
                  </p>
                  <p className="mt-1">
                    Mình là Sách Xanh AI. Hãy hỏi mình về sách, khuyến mãi hoặc gợi ý đọc nhé!
                  </p>
                </div>
              ) : null}

              {messages.map((message) => {
                const mine = message.sender === "USER";
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine
                          ? "bg-emerald-700 text-white"
                          : "bg-white text-gray-700"
                      }`}
                    >
                      {/* Nội dung tin nhắn */}
                      {mine ? (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      ) : (
                        renderBotContent(message.content)
                      )}
                      {message.sender === "BOT" &&
                      (message.flashSaleInfo || message.promotionInfo) ? (
                        <div className="mt-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm text-emerald-900 shadow-sm">
                          {message.flashSaleInfo ? (
                            <div>
                              <div className="font-bold flex items-center gap-1.5 mb-1 text-red-600">
                                <span>⚡</span> Thông tin Flash Sale
                              </div>
                              {renderBotContent(message.flashSaleInfo)}
                            </div>
                          ) : null}
                          {message.promotionInfo ? (
                            <div className={message.flashSaleInfo ? "pt-2 border-t border-emerald-100" : ""}>
                              <div className="font-bold flex items-center gap-1.5 mb-1 text-emerald-700">
                                <span>🎁</span> Mã giảm giá có thể áp dụng
                              </div>
                              {/* Xóa text prefix nếu AI lỡ copy vào */}
                              <div className="text-sm">
                                {renderBotContent(message.promotionInfo.replace(/^🎁 MÃ GIẢM GIÁ ĐANG ÁP DỤNG:?\s*/i, ''))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {message.sender === "BOT" && message.books?.length ? (
                        <div className="mt-2 space-y-2">
                          {message.books.map((book, index) => (
                            <div
                              key={`${message.id}-book-${index}`}
                              className="rounded-xl border border-gray-100 bg-gray-50 px-2 py-2 text-xs"
                            >
                              <div className="font-semibold text-emerald-800">
                                {book.title || "(Chưa có tiêu đề)"}
                              </div>
                              {book.authors ? (
                                <div className="text-gray-500">
                                  ✍️ {book.authors}
                                </div>
                              ) : null}
                              <div className="mt-1 flex flex-wrap gap-2 text-gray-600">
                                <span>💰 {formatPrice(book.selling_price)}</span>
                                {book.flash_sale_price ? (
                                  <span className="font-semibold text-red-600">
                                    ⚡ Flash sale: {formatPrice(book.flash_sale_price)}
                                  </span>
                                ) : null}
                                {book.total_stock !== null &&
                                book.total_stock !== undefined ? (
                                  <span className="text-gray-400">Còn: {book.total_stock} cuốn</span>
                                ) : null}
                              </div>
                              {book.promotion_code ? (
                                <div className="mt-1 font-medium text-emerald-700">
                                  🎁 Mã: {book.promotion_code}
                                  {book.discount_percent
                                    ? ` (-${book.discount_percent}%)`
                                    : ""}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {isSubmitting ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-sm text-gray-500 shadow-sm">
                    <span className="animate-pulse">Chatbot đang trả lời...</span>
                  </div>
                </div>
              ) : null}

              {isBooting ? (
                <p className="text-center text-xs text-gray-400 animate-pulse">
                  Đang tải lịch sử hội thoại...
                </p>
              ) : null}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 bg-white px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
                  disabled={isSubmitting || isBooting}
                  className="min-h-12 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-emerald-600 disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={isSubmitting || isBooting || !draft.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SendOutlined />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg transition hover:bg-emerald-800"
        title="Chat với AI Sách Xanh"
      >
        <RobotOutlined className="text-xl" />
      </button>
    </div>
  );
}
