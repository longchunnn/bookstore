import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageOutlined,
  SendOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { toast } from "react-toastify";
import { useAppSelector } from "../../app/hooks";
import { isStaffRole } from "../../utils/roles";
import { ensureFirebaseChatLogin } from "../../firebase/chatAuth";
import {
  listenMessages,
  listenMyConversations,
  sendConversationMessage,
  type ChatConversation,
  type ChatMessage,
} from "../../firebase/chatService";
import { openSupportConversation } from "../../services/supportService";

function formatTime(
  value: ChatConversation["updatedAt"] | ChatMessage["createdAt"] | undefined,
) {
  if (!value) return "";
  const date =
    value instanceof Date
      ? value
      : typeof value === "object" && value && typeof value.seconds === "number"
        ? new Date(value.seconds * 1000)
        : null;

  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function SupportWidget() {
  const location = useLocation();
  const token = useAppSelector((state) => state.session.token);
  const userId = useAppSelector((state) => state.session.userId);
  const displayName = useAppSelector((state) => state.session.displayName);
  const primaryRole = useAppSelector((state) => state.session.primaryRole);
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requestMessage, setRequestMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

  const shouldHide = useMemo(
    () =>
      ["/login", "/register", "/staff"].some((path) =>
        location.pathname.startsWith(path),
      ),
    [location.pathname],
  );

  const isStaff = isStaffRole(primaryRole);

  useEffect(() => {
    if (!isOpen || !token || isStaff) {
      setIsFirebaseReady(false);
      return;
    }

    let cancelled = false;
    ensureFirebaseChatLogin()
      .then(() => {
        if (!cancelled) setIsFirebaseReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setIsFirebaseReady(false);
          toast.error(
            error instanceof Error
              ? error.message
              : "Không kết nối được Firebase chat.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, token, isStaff, userId]);

  useEffect(() => {
    setIsFirebaseReady(false);
    setConversations([]);
    setSelectedConversationId("");
    setMessages([]);
    setRequestMessage("");
    setReplyMessage("");
  }, [token, userId]);

  useEffect(() => {
    if (!isOpen || !isFirebaseReady) return;
    let unsubscribe: undefined | (() => void);
    listenMyConversations((items) => {
      setConversations(items);
      setSelectedConversationId((current) => {
        if (current && items.some((conversation) => conversation.id === current)) {
          return current;
        }
        return items[0]?.id || "";
      });
    })
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Không tải được lịch sử hỗ trợ.",
        );
      });

    return () => {
      unsubscribe?.();
    };
  }, [isOpen, isFirebaseReady, token, userId]);

  useEffect(() => {
    if (!selectedConversationId || !isFirebaseReady || !isOpen) {
      setMessages([]);
      return;
    }

    let unsubscribe: undefined | (() => void);
    listenMessages(selectedConversationId, setMessages)
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Không tải được tin nhắn.",
        );
      });

    return () => {
      unsubscribe?.();
    };
  }, [selectedConversationId, isFirebaseReady, isOpen, token, userId]);

  const currentConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  async function handleOpenSupport() {
    const safeMessage = requestMessage.trim();
    if (!safeMessage) {
      toast.info("Hãy nhập nội dung bạn cần hỗ trợ trước khi bắt đầu.");
      return;
    }

    try {
      setIsSubmitting(true);
      await ensureFirebaseChatLogin();
      const response = await openSupportConversation(safeMessage);
      setSelectedConversationId(response.conversation_id);
      setRequestMessage("");
      toast.success(response.message || "Đã gửi yêu cầu hỗ trợ.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không mở được yêu cầu hỗ trợ.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendMessage() {
    const safeMessage = replyMessage.trim();
    if (!selectedConversationId || !safeMessage) return;

    try {
      setIsSubmitting(true);
      await sendConversationMessage(
        selectedConversationId,
        safeMessage,
        "USER",
        displayName || "Khách hàng",
      );
      setReplyMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không gửi được tin nhắn.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token || shouldHide || isStaff) {
    return null;
  }

  return (
    <div className="fixed bottom-24 right-5 z-60">
      {isOpen ? (
        <div className="absolute bottom-0 right-20 h-[min(38rem,calc(100vh-7rem))] w-[calc(100vw-6.5rem)] max-w-[24rem] overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-2xl sm:w-[24rem]">
          <div className="flex items-center justify-between bg-teal-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Hỗ trợ khách hàng</p>
              <p className="text-xs text-teal-100">
                Chat realtime với nhân viên
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
            >
              <CloseOutlined />
            </button>
          </div>

          <div className="grid h-[calc(100%-3.75rem)] grid-rows-[auto,1fr,auto]">
            <div className="border-b border-gray-100 p-3">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Bắt đầu yêu cầu hỗ trợ
              </label>
              <textarea
                value={requestMessage}
                onChange={(event) => setRequestMessage(event.target.value)}
                rows={3}
                placeholder="Ví dụ: Em cần hỏi về tình trạng đơn hàng #12 hoặc muốn tư vấn sách học Java..."
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-teal-600"
              />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleOpenSupport}
                className="mt-2 inline-flex items-center rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
              </button>
            </div>

            <div className="grid min-h-0 grid-rows-[auto,1fr]">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Lịch sử hỗ trợ
                </p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {conversations.length === 0 ? (
                    <span className="text-xs text-gray-400">
                      Chưa có cuộc trò chuyện nào.
                    </span>
                  ) : (
                    conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() =>
                          setSelectedConversationId(conversation.id)
                        }
                        className={`min-w-44 rounded-xl border px-3 py-2 text-left text-xs transition ${
                          selectedConversationId === conversation.id
                            ? "border-teal-700 bg-teal-50 text-teal-900"
                            : "border-gray-200 text-gray-600 hover:border-teal-200"
                        }`}
                      >
                        <div className="font-semibold">
                          #{conversation.id.slice(0, 8)}
                        </div>
                        <div className="mt-1 line-clamp-2">
                          {conversation.lastMessage || "Chưa có nội dung"}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
                          {conversation.status}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto bg-gray-50 px-3 py-3">
                {currentConversation ? (
                  <div className="mb-3 rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs text-gray-600">
                    <div className="font-semibold text-teal-800">
                      {currentConversation.staffName
                        ? `Đang hỗ trợ: ${currentConversation.staffName}`
                        : currentConversation.status === "WAITING"
                          ? "Tất cả nhân viên đang bận, yêu cầu của bạn đang chờ xử lý"
                          : "Đang kết nối với nhân viên"}
                    </div>
                    <div className="mt-1">
                      Trạng thái: {currentConversation.status}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  {messages.map((message) => {
                    const mine = message.senderRole === "USER";
                    return (
                      <div
                        key={message.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            mine
                              ? "bg-teal-700 text-white"
                              : "bg-white text-gray-700"
                          }`}
                        >
                          {!mine && message.senderName ? (
                            <div className="mb-1 text-xs font-semibold text-teal-700">
                              {message.senderName}
                            </div>
                          ) : null}
                          <div className="whitespace-pre-wrap">
                            {message.content}
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${mine ? "text-teal-100" : "text-gray-400"}`}
                          >
                            {formatTime(message.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {currentConversation && messages.length === 0 ? (
                    <p className="text-center text-sm text-gray-400">
                      Chưa có tin nhắn nào trong cuộc trò chuyện này.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  rows={2}
                  placeholder={
                    selectedConversationId
                      ? "Nhập tin nhắn..."
                      : "Hãy gửi yêu cầu hỗ trợ trước"
                  }
                  disabled={!selectedConversationId || isSubmitting}
                  className="min-h-13 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-teal-600 disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!selectedConversationId || isSubmitting}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
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
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg transition hover:bg-teal-800"
        title="Chat với nhân viên hỗ trợ"
      >
        <MessageOutlined className="text-xl" />
      </button>
    </div>
  );
}
