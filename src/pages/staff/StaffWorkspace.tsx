/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BellOutlined,
  BookOutlined,
  CameraOutlined,
  InboxOutlined,
  LockOutlined,
  LogoutOutlined,
  MessageOutlined,
  SearchOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import axiosClient, { clearAccessToken } from "../../services/axiosClient";
import { getBooksForStaff, updateBookPartial } from "../../services/booksService";
import {
  getOrdersForStaff,
  updateOrderStatus,
} from "../../services/ordersService";
import { getUsersForStaff } from "../../services/usersService";
import { normalizeUser, type ApiBook, type ApiOrder, type ApiUser } from "../../utils/apiMappers";
import { unwrapResult } from "../../utils/apiResponse";
import { setAvatarSrc, setUser } from "../../features/session/sessionSlice";
import { ensureFirebaseChatLogin } from "../../firebase/chatAuth";
import {
  listenAssignedConversations,
  listenStaffMessages,
  markConversationRead,
  sendStaffConversationMessage,
  updateConversationTags,
  upsertStaffStatus,
  type ChatConversation,
  type ChatMessage,
} from "../../firebase/chatService";

const MAX_ACTIVE_CHATS = 999;
const STAFF_ORDERS_PAGE_SIZE = 10;
const STAFF_BOOKS_PAGE_SIZE = 9;
const DEFAULT_CHAT_TAGS = ["Gấp", "Đơn hàng", "Tư vấn sách", "Khiếu nại", "VIP"];
const ORDER_TAGS = ["Gấp", "Cần gọi", "VIP", "Địa chỉ khó", "Thanh toán"];
const ORDER_STATUS_OPTIONS = [
  { value: "Chờ duyệt", label: "Chờ duyệt" },
  { value: "Đã duyệt", label: "Đã duyệt" },
  { value: "Chờ giao hàng", label: "Chờ giao hàng" },
  { value: "Đã hủy", label: "Đã hủy" },
];

const ORDER_STATUS_LEGACY_ALIASES: Record<string, string> = {
  "cho duyet": "Chờ duyệt",
  "dang xu ly": "Chờ duyệt",
  "dang giao": "Chờ giao hàng",
  "da giao": "Chờ giao hàng",
  "thanh cong": "Chờ giao hàng",
  "da huy": "Đã hủy",
};

const DEFAULT_STAFF_PREFERENCES = {
  notificationSound: true,
  prioritizeUnreadChats: true,
};

export type StaffView = "chat" | "orders" | "books" | "settings";

const STAFF_ROUTE_BY_VIEW: Record<StaffView, string> = {
  chat: "/staff/chat",
  orders: "/staff/orders",
  books: "/staff/books",
  settings: "/staff/settings",
};
type StockFilter = "all" | "inStock" | "lowStock" | "outOfStock";
type StaffPreferences = typeof DEFAULT_STAFF_PREFERENCES;

function getStaffPreferenceKey(staffId?: string | number | null) {
  return `staff_preferences:${staffId || "guest"}`;
}

function readStaffPreferences(staffId?: string | number | null): StaffPreferences {
  try {
    const raw = localStorage.getItem(getStaffPreferenceKey(staffId));
    if (!raw) return { ...DEFAULT_STAFF_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<StaffPreferences> &
      Partial<{
        compactChatList: boolean;
        autoFocusReply: boolean;
        showWorkSummary: boolean;
      }>;

    return {
      ...DEFAULT_STAFF_PREFERENCES,
      notificationSound:
        typeof parsed.notificationSound === "boolean"
          ? parsed.notificationSound
          : DEFAULT_STAFF_PREFERENCES.notificationSound,
      prioritizeUnreadChats:
        typeof parsed.prioritizeUnreadChats === "boolean"
          ? parsed.prioritizeUnreadChats
          : typeof parsed.compactChatList === "boolean"
            ? parsed.compactChatList
            : DEFAULT_STAFF_PREFERENCES.prioritizeUnreadChats,
    };
  } catch {
    return { ...DEFAULT_STAFF_PREFERENCES };
  }
}

function getDate(
  value?: ChatConversation["updatedAt"] | ChatMessage["createdAt"] | string,
) {
  if (!value) return null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value instanceof Date) return value;
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatDateTime(
  value?: ChatConversation["updatedAt"] | ChatMessage["createdAt"] | string,
) {
  const date = getDate(value);
  if (!date) return "Chưa có thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortTime(
  value?: ChatConversation["updatedAt"] | ChatMessage["createdAt"],
) {
  const date = getDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAge(value?: ChatConversation["updatedAt"]) {
  const date = getDate(value);
  if (!date) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function removeVietnameseAccents(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeText(value: unknown) {
  return removeVietnameseAccents(String(value ?? ""))
    .trim()
    .toLowerCase();
}

function normalizeStatusKey(value: unknown) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function getOrderStatusOption(status: string) {
  const key = normalizeStatusKey(status);
  const canonicalStatus = ORDER_STATUS_LEGACY_ALIASES[key];
  if (canonicalStatus) {
    return ORDER_STATUS_OPTIONS.find((option) => option.value === canonicalStatus);
  }

  return ORDER_STATUS_OPTIONS.find(
    (option) =>
      normalizeStatusKey(option.value) === key ||
      normalizeStatusKey(option.label) === key,
  );
}

function getOrderStatusValue(status: string) {
  return getOrderStatusOption(status)?.value ?? status;
}

function getOrderStatusLabel(status: string) {
  return getOrderStatusOption(status)?.label ?? (status || "Chưa rõ");
}

function statusStyle(status: string) {
  const key = normalizeStatusKey(status);
  if (key.includes("huy") || key === "closed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (key.includes("da duyet")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (key.includes("cho giao") || key === "active") {
    return "border-teal-200 bg-teal-50 text-teal-700";
  }
  if (key.includes("cho duyet")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function canStaffApproveOrder(order: ApiOrder) {
  return (
    normalizeStatusKey(order.payment_method) === "cod" &&
    getOrderStatusValue(order.order_status) === "Chờ duyệt"
  );
}

function Avatar({
  name,
  active,
  size = "md",
}: {
  name?: string;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const initials = String(name || "KH")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const sizeClass = size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm";

  return (
    <div
      className={`relative shrink-0 rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 p-[2px] ${sizeClass}`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-white font-bold text-teal-700">
        {initials || "KH"}
      </div>
      {active ? (
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
      ) : null}
    </div>
  );
}

function StaffAvatar({
  name,
  imageUrl,
  size = "md",
}: {
  name?: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
}) {
  const initials = String(name || "NV")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const sizeClass =
    size === "lg"
      ? "h-14 w-14 text-base"
      : size === "sm"
        ? "h-10 w-10 text-xs"
        : "h-12 w-12 text-sm";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border-2 border-white/80 bg-white shadow-sm ${sizeClass}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name || "Nhân viên"}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-teal-50 font-black text-teal-700">
          {initials || "NV"}
        </div>
      )}
    </div>
  );
}

function SettingCard({
  title,
  icon,
  children,
  description,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  description?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-lg text-teal-700">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
        checked
          ? "border-teal-200 bg-teal-50/80"
          : "border-slate-100 bg-slate-50 hover:border-teal-100 hover:bg-teal-50/40"
      }`}
    >
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
          {description}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition ${
          checked ? "bg-teal-700" : "bg-slate-300"
        }`}
        aria-hidden="true"
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function TagButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? "border-teal-500 bg-teal-50 text-teal-700"
          : "border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:text-teal-700"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
      <InboxOutlined className="mb-2 text-2xl" />
      <p>{text}</p>
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
      <span>
        Hiển thị <b>{start}</b>-<b>{end}</b> / <b>{totalItems}</b>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 transition hover:border-teal-200 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trước
        </button>
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            className={`h-9 min-w-9 rounded-xl border px-3 text-sm font-bold transition ${
              item === page
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700"
            }`}
          >
            {item}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-600 transition hover:border-teal-200 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

export default function StaffWorkspace({ activeView }: { activeView: StaffView }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const displayName = useAppSelector((state) => state.session.displayName);
  const userId = useAppSelector((state) => state.session.userId);
  const sessionUser = useAppSelector((state) => state.session.user);
  const staffAvatarSrc = useAppSelector((state) => state.session.avatarSrc);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousUnreadChatsRef = useRef<number | null>(null);
  const preferencesReadyForRef = useRef<string | null>(null);

  const view = activeView;
  const setView = (nextView: StaffView) => {
    navigate(STAFF_ROUTE_BY_VIEW[nextView], { replace: false });
  };

  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [books, setBooks] = useState<ApiBook[]>([]);
  const [bookDrafts, setBookDrafts] = useState<
    Record<string, { total_stock: string; description: string }>
  >({});

  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderTagFilter, setOrderTagFilter] = useState("all");
  const [orderTagsById, setOrderTagsById] = useState<Record<string, string[]>>({});
  const [orderPage, setOrderPage] = useState(1);

  const [bookQuery, setBookQuery] = useState("");
  const [bookCategoryFilter, setBookCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [bookPage, setBookPage] = useState(1);

  const [staffUid, setStaffUid] = useState("");
  const [assignedConversations, setAssignedConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const [chatStatusFilter, setChatStatusFilter] = useState("all");
  const [chatTagFilter, setChatTagFilter] = useState("all");
  const [customChatTag, setCustomChatTag] = useState("");

  const [profileDraft, setProfileDraft] = useState({
    fullName: displayName || "",
    username: sessionUser?.username || "",
    email: sessionUser?.email || "",
    phone: sessionUser?.phone || "",
    avatarUrl: staffAvatarSrc || "",
  });
  const [passwordDraft, setPasswordDraft] = useState({
    password: "",
    confirmPassword: "",
  });
  const [staffPreferences, setStaffPreferences] = useState<StaffPreferences>(() =>
    readStaffPreferences(userId),
  );

  useEffect(() => {
    Promise.all([getOrdersForStaff(), getUsersForStaff(), getBooksForStaff()])
      .then(([orderResponse, userResponse, bookResponse]) => {
        setOrders(orderResponse);
        setUsers(userResponse.filter((user) => Number(user.role_id) === 3));
        setBooks(bookResponse);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Không tải được dữ liệu nhân viên.",
        );
      });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("staff_order_tags");
      if (raw) setOrderTagsById(JSON.parse(raw));
    } catch {
      setOrderTagsById({});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("staff_order_tags", JSON.stringify(orderTagsById));
  }, [orderTagsById]);

  useEffect(() => {
    setOrderPage(1);
  }, [orderQuery, orderStatusFilter, orderTagFilter]);

  useEffect(() => {
    setBookPage(1);
  }, [bookQuery, bookCategoryFilter, stockFilter]);

  useEffect(() => {
    setProfileDraft({
      fullName: displayName || sessionUser?.full_name || "",
      username: sessionUser?.username || "",
      email: sessionUser?.email || "",
      phone: sessionUser?.phone || "",
      avatarUrl: staffAvatarSrc || "",
    });
  }, [displayName, sessionUser, staffAvatarSrc]);

  useEffect(() => {
    const preferenceKey = getStaffPreferenceKey(userId);
    preferencesReadyForRef.current = null;
    setStaffPreferences(readStaffPreferences(userId));
    preferencesReadyForRef.current = preferenceKey;
  }, [userId]);

  useEffect(() => {
    const preferenceKey = getStaffPreferenceKey(userId);
    if (preferencesReadyForRef.current !== preferenceKey) return;
    localStorage.setItem(preferenceKey, JSON.stringify(staffPreferences));
  }, [staffPreferences, userId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    window.setTimeout(() => replyInputRef.current?.focus(), 100);
  }, [selectedConversationId]);

  function playStaffNotificationSound() {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.14);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    window.setTimeout(() => void context.close().catch(() => undefined), 300);
  }


  useEffect(() => {
    let cancelled = false;

    ensureFirebaseChatLogin()
      .then(async (uid) => {
        if (cancelled) return;
        setStaffUid(uid);
        await upsertStaffStatus({
          staffUid: uid,
          staffId: userId,
          staffName: displayName || "Nhân viên",
          acceptingChats: true,
          maxLoad: MAX_ACTIVE_CHATS,
        });
      })
      .catch((error) => {
        if (!cancelled) {
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
  }, [displayName, userId]);

  useEffect(() => {
    if (!staffUid) return;

    let unsubscribe: undefined | (() => void);
    listenAssignedConversations((items) => {
      setAssignedConversations(items);
      setSelectedConversationId((current) => {
        if (current && items.some((item) => item.id === current)) return current;
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
            : "Không tải được danh sách hội thoại.",
        );
      });

    return () => unsubscribe?.();
  }, [staffUid]);

  const activeChatCount = useMemo(
    () => assignedConversations.filter((item) => item.status === "ACTIVE").length,
    [assignedConversations],
  );

  useEffect(() => {
    if (!staffUid) return;

    const heartbeat = () => {
      void upsertStaffStatus({
        staffUid,
        staffId: userId,
        staffName: displayName || "Nhân viên",
        acceptingChats: true,
        currentLoad: activeChatCount,
        maxLoad: MAX_ACTIVE_CHATS,
      }).catch(() => undefined);
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 45000);
    return () => window.clearInterval(timer);
  }, [activeChatCount, displayName, staffUid, userId]);

  useEffect(() => {
    if (!staffUid || !selectedConversationId) {
      setMessages([]);
      return;
    }

    setMessages([]);
    let unsubscribe: undefined | (() => void);

    listenStaffMessages(selectedConversationId, (items) => {
      setMessages(items);
    })
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Không tải được tin nhắn hỗ trợ.",
        );
      });

    return () => unsubscribe?.();
  }, [selectedConversationId, staffUid]);

  const customersById = useMemo(
    () =>
      users.reduce<Record<string, ApiUser>>(
        (map, user) => ({ ...map, [user.id]: user }),
        {},
      ),
    [users],
  );

  const activeConversation = useMemo(
    () =>
      assignedConversations.find((item) => item.id === selectedConversationId) ?? null,
    [assignedConversations, selectedConversationId],
  );

  useEffect(() => {
    if (!selectedConversationId || !activeConversation?.unreadByStaff) return;
    void markConversationRead(selectedConversationId, "STAFF").catch(() => undefined);
  }, [activeConversation?.unreadByStaff, selectedConversationId]);

  const allChatTags = useMemo(() => {
    const dynamicTags = assignedConversations.flatMap((conversation) => conversation.tags ?? []);
    return Array.from(new Set([...DEFAULT_CHAT_TAGS, ...dynamicTags]));
  }, [assignedConversations]);

  const filteredConversations = useMemo(() => {
    const query = normalizeText(chatQuery);
    const visibleConversations = assignedConversations.filter((conversation) => {
      const tags = conversation.tags ?? [];
      const searchText = [
        conversation.userName,
        conversation.userId,
        conversation.lastMessage,
        conversation.lastStaffName,
        conversation.id,
        ...tags,
      ]
        .map(normalizeText)
        .join(" ");

      return (
        (!query || searchText.includes(query)) &&
        (chatStatusFilter === "all" || conversation.status === chatStatusFilter) &&
        (chatTagFilter === "all" || tags.includes(chatTagFilter))
      );
    });

    if (!staffPreferences.prioritizeUnreadChats) return visibleConversations;

    return [...visibleConversations].sort((left, right) => {
      const leftUnread = Number(left.unreadByStaff ?? 0) > 0 ? 1 : 0;
      const rightUnread = Number(right.unreadByStaff ?? 0) > 0 ? 1 : 0;
      if (leftUnread !== rightUnread) return rightUnread - leftUnread;
      return (
        (getDate(right.updatedAt)?.getTime() ?? 0) -
        (getDate(left.updatedAt)?.getTime() ?? 0)
      );
    });
  }, [
    assignedConversations,
    chatQuery,
    chatStatusFilter,
    chatTagFilter,
    staffPreferences.prioritizeUnreadChats,
  ]);

  const filteredOrders = useMemo(() => {
    const query = normalizeText(orderQuery);
    return orders.filter((order) => {
      const customer = customersById[order.user_id];
      const tags = orderTagsById[order.id] ?? [];
      const searchText = [
        order.id,
        order.user_id,
        customer?.full_name,
        customer?.email,
        customer?.phone,
        order.shipping_address,
        order.payment_method,
        getOrderStatusLabel(order.order_status),
        ...order.items.map((item) => item.title),
        ...tags,
      ]
        .map(normalizeText)
        .join(" ");

      return (
        (!query || searchText.includes(query)) &&
        (orderStatusFilter === "all" ||
          getOrderStatusValue(order.order_status) === orderStatusFilter) &&
        (orderTagFilter === "all" || tags.includes(orderTagFilter))
      );
    });
  }, [customersById, orderQuery, orderStatusFilter, orderTagFilter, orderTagsById, orders]);

  const orderTotalPages = Math.max(
    1,
    Math.ceil(filteredOrders.length / STAFF_ORDERS_PAGE_SIZE),
  );
  const safeOrderPage = Math.min(orderPage, orderTotalPages);
  const paginatedOrders = filteredOrders.slice(
    (safeOrderPage - 1) * STAFF_ORDERS_PAGE_SIZE,
    safeOrderPage * STAFF_ORDERS_PAGE_SIZE,
  );

  const bookCategories = useMemo(
    () =>
      Array.from(
        new Set(books.map((book) => book.category_name).filter(Boolean)),
      ),
    [books],
  );

  const filteredBooks = useMemo(() => {
    const query = normalizeText(bookQuery);
    return books.filter((book) => {
      const stock = Number(book.total_stock ?? 0);
      const searchText = [
        book.id,
        book.title,
        book.author_name,
        book.category_name,
        book.description,
      ]
        .map(normalizeText)
        .join(" ");

      return (
        (!query || searchText.includes(query)) &&
        (bookCategoryFilter === "all" || book.category_name === bookCategoryFilter) &&
        (stockFilter === "all" ||
          (stockFilter === "inStock" && stock > 5) ||
          (stockFilter === "lowStock" && stock > 0 && stock <= 5) ||
          (stockFilter === "outOfStock" && stock <= 0))
      );
    });
  }, [bookCategoryFilter, bookQuery, books, stockFilter]);

  const bookTotalPages = Math.max(
    1,
    Math.ceil(filteredBooks.length / STAFF_BOOKS_PAGE_SIZE),
  );
  const safeBookPage = Math.min(bookPage, bookTotalPages);
  const paginatedBooks = filteredBooks.slice(
    (safeBookPage - 1) * STAFF_BOOKS_PAGE_SIZE,
    safeBookPage * STAFF_BOOKS_PAGE_SIZE,
  );

  const unreadChats = assignedConversations.reduce(
    (total, item) => total + Number(item.unreadByStaff ?? 0),
    0,
  );
  useEffect(() => {
    const previous = previousUnreadChatsRef.current;
    if (previous === null) {
      previousUnreadChatsRef.current = unreadChats;
      return;
    }

    if (staffPreferences.notificationSound && unreadChats > previous) {
      try {
        playStaffNotificationSound();
      } catch {
        // Browser có thể chặn âm thanh nếu người dùng chưa tương tác với trang.
      }
    }

    previousUnreadChatsRef.current = unreadChats;
  }, [staffPreferences.notificationSound, unreadChats]);


  async function handleUpdateOrderStatus(orderId: string, orderStatus: string) {
    try {
      const updated = await updateOrderStatus(orderId, {
        order_status: orderStatus,
      });
      setOrders((current) =>
        current.map((item) => (item.id === orderId ? updated : item)),
      );
      toast.success("Đã cập nhật trạng thái đơn hàng.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không cập nhật được đơn hàng.",
      );
    }
  }

  function toggleOrderTag(orderId: string, tag: string) {
    setOrderTagsById((current) => {
      const tags = current[orderId] ?? [];
      const next = tags.includes(tag)
        ? tags.filter((item) => item !== tag)
        : [...tags, tag];
      return { ...current, [orderId]: next };
    });
  }

  async function setConversationTags(conversation: ChatConversation, nextTags: string[]) {
    const safeTags = Array.from(new Set(nextTags.map((tag) => tag.trim()).filter(Boolean)));

    setAssignedConversations((current) =>
      current.map((item) =>
        item.id === conversation.id ? { ...item, tags: safeTags } : item,
      ),
    );

    try {
      await updateConversationTags(conversation.id, safeTags);
    } catch (error) {
      setAssignedConversations((current) =>
        current.map((item) =>
          item.id === conversation.id ? { ...item, tags: conversation.tags ?? [] } : item,
        ),
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Không cập nhật được thẻ hội thoại.",
      );
    }
  }

  async function toggleConversationTag(conversation: ChatConversation, tag: string) {
    const tags = conversation.tags ?? [];
    const next = tags.includes(tag)
      ? tags.filter((item) => item !== tag)
      : [...tags, tag];
    await setConversationTags(conversation, next);
  }

  async function addCustomConversationTag() {
    if (!activeConversation) return;
    const tag = customChatTag.trim();
    if (!tag) return;

    const exists = (activeConversation.tags ?? []).some(
      (item) => normalizeText(item) === normalizeText(tag),
    );
    if (exists) {
      setCustomChatTag("");
      return;
    }

    await setConversationTags(activeConversation, [
      ...(activeConversation.tags ?? []),
      tag,
    ]);
    setCustomChatTag("");
  }

  async function handleSendChat() {
    if (!selectedConversationId || !chatDraft.trim()) return;

    try {
      await sendStaffConversationMessage(
        selectedConversationId,
        chatDraft.trim(),
      );
      setChatDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không gửi được tin nhắn.",
      );
    }
  }

  async function handleSaveBook(bookId: string) {
    const draft = bookDrafts[bookId];
    if (!draft) return;

    try {
      const updated = await updateBookPartial(bookId, {
        total_stock: Number(draft.total_stock || 0),
        description: draft.description,
      });
      setBooks((current) =>
        current.map((item) => (item.id === bookId ? updated : item)),
      );
      toast.success("Đã cập nhật thông tin sách.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không cập nhật được sách.",
      );
    }
  }

  async function updateStaffAccount(payload: Record<string, unknown>) {
    if (!userId) throw new Error("Không xác định được tài khoản nhân viên.");
    const response = await axiosClient.patch(
      `/users/${encodeURIComponent(userId)}`,
      payload,
    );
    return normalizeUser(unwrapResult(response));
  }

  function handleStaffAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh hợp lệ.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;

      setProfileDraft((current) => ({
        ...current,
        avatarUrl: dataUrl,
      }));

      if (userId) {
        localStorage.setItem(`bookstore_profile_avatar:${userId}`, dataUrl);
      }
      dispatch(setAvatarSrc(dataUrl));
      toast.success("Đã cập nhật ảnh đại diện nhân viên.");
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveStaffAvatar() {
    setProfileDraft((current) => ({
      ...current,
      avatarUrl: "",
    }));

    if (userId) {
      localStorage.removeItem(`bookstore_profile_avatar:${userId}`);
    }
    dispatch(setAvatarSrc(""));
    toast.success("Đã xoá ảnh đại diện nhân viên.");
  }

  async function handleSaveStaffProfile() {
    const fullName = profileDraft.fullName.trim();
    const username = profileDraft.username.trim();
    const email = profileDraft.email.trim();
    const phone = profileDraft.phone.trim();
    const avatarUrl = profileDraft.avatarUrl.trim();

    if (!fullName || !username || !email) {
      toast.error("Vui lòng nhập đủ họ tên, tài khoản và email.");
      return;
    }

    try {
      const updatedUser = await updateStaffAccount({
        full_name: fullName,
        username,
        email,
        phone,
      });

      localStorage.setItem(`bookstore_profile_avatar:${userId}`, avatarUrl);
      dispatch(setAvatarSrc(avatarUrl));
      dispatch(
        setUser({
          id: updatedUser.id || userId,
          username: updatedUser.username || username,
          email: updatedUser.email || email,
          full_name: updatedUser.full_name || fullName,
          phone: updatedUser.phone || phone,
        }),
      );
      toast.success("Đã lưu thông tin nhân viên.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không cập nhật được thông tin nhân viên.",
      );
    }
  }

  async function handleChangePassword() {
    const password = passwordDraft.password.trim();
    const confirmPassword = passwordDraft.confirmPassword.trim();

    if (password.length < 6) {
      toast.error("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận chưa trùng khớp.");
      return;
    }

    try {
      await updateStaffAccount({ password });
      setPasswordDraft({ password: "", confirmPassword: "" });
      toast.success("Đã đổi mật khẩu nhân viên.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không đổi được mật khẩu.",
      );
    }
  }

  function handleResetStaffPreferences() {
    setStaffPreferences(DEFAULT_STAFF_PREFERENCES);
    toast.success("Đã khôi phục cài đặt staff mặc định.");
  }

  function handleLogout() {
    clearAccessToken();
    navigate("/login", { replace: true });
  }

  function renderChatMessages() {
    let lastDate = "";

    return messages.map((message) => {
      const date = getDate(message.createdAt);
      const dateKey = date ? date.toLocaleDateString("vi-VN") : "";
      const showDate = dateKey && dateKey !== lastDate;
      if (showDate) lastDate = dateKey;

      const mine = message.senderRole === "STAFF";

      return (
        <div key={message.id}>
          {showDate ? (
            <div className="my-4 flex justify-center">
              <span className="rounded-full bg-slate-300/90 px-4 py-1 text-xs font-semibold text-slate-600">
                {dateKey}
              </span>
            </div>
          ) : null}

          <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
            {!mine ? (
              <Avatar
                name={activeConversation?.userName}
                active={activeConversation?.status === "ACTIVE"}
                size="sm"
              />
            ) : null}
            <div
              className={`max-w-[72%] rounded-2xl border px-4 py-3 shadow-sm ${
                mine
                  ? "rounded-br-md border-teal-700 bg-teal-700 text-white"
                  : "rounded-bl-md border-teal-100 bg-white text-slate-800"
              }`}
            >
              {message.senderName ? (
                <p className={`mb-1 text-xs font-semibold ${mine ? "text-teal-100" : "text-slate-500"}`}>
                  {message.senderName}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
              <p className={`mt-2 text-[11px] ${mine ? "text-teal-100" : "text-slate-400"}`}>
                {formatShortTime(message.createdAt)}
              </p>
            </div>
          </div>
        </div>
      );
    });
  }

  const navItems: Array<{
    key: StaffView;
    icon: ReactNode;
    label: string;
    badge?: number;
  }> = [
    { key: "chat", icon: <MessageOutlined />, label: "Chat", badge: unreadChats },
    { key: "orders", icon: <ShoppingCartOutlined />, label: "Đơn hàng" },
    { key: "books", icon: <BookOutlined />, label: "Sách" },
    { key: "settings", icon: <SettingOutlined />, label: "Cài đặt" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-100"
      style={{
        display: "grid",
        gridTemplateColumns: "76px minmax(0, 1fr)",
        height: "100vh",
        width: "100vw",
      }}
    >
      <nav className="flex h-screen flex-col items-center bg-gradient-to-b from-teal-800 via-teal-700 to-emerald-700 py-4 text-white shadow-xl">
        <button
          type="button"
          title="Cài đặt tài khoản nhân viên"
          onClick={() => setView("settings")}
          className={`mb-6 rounded-full p-1 transition ${
            view === "settings" ? "bg-white/25" : "hover:bg-white/15"
          }`}
        >
          <StaffAvatar
            name={displayName || sessionUser?.username || "Nhân viên"}
            imageUrl={staffAvatarSrc}
            size="lg"
          />
        </button>

        <div className="flex flex-1 flex-col items-center gap-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              title={item.label}
              onClick={() => setView(item.key)}
              className={`relative flex h-14 w-14 items-center justify-center rounded-2xl text-2xl transition ${
                view === item.key ? "bg-white/25 shadow-sm" : "hover:bg-white/15"
              }`}
            >
              {item.icon}
              {item.badge ? (
                <span className="absolute right-1 top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          title="Đăng xuất"
          onClick={handleLogout}
          className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl transition hover:bg-white/15"
        >
          <LogoutOutlined />
        </button>
      </nav>

      {view === "chat" ? (
        <div
          className="h-screen overflow-hidden"
          style={{ display: "grid", gridTemplateColumns: "384px minmax(0, 1fr)" }}
        >
          <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-950">Tin nhắn</h1>
                  <p className="text-xs text-slate-500">
                    Tất cả staff đều thấy và trả lời được hội thoại
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Online
                </span>
              </div>

              <label className="relative block">
                <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={chatQuery}
                  onChange={(event) => setChatQuery(event.target.value)}
                  placeholder="Tìm tên khách, nội dung, thẻ..."
                  className="w-full rounded-xl border border-transparent bg-slate-100 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-400 focus:bg-white"
                />
              </label>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <p className="text-sm font-black text-slate-900">{assignedConversations.length}</p>
                  <p>Tổng</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <p className="text-sm font-black text-slate-900">{activeChatCount}</p>
                  <p>Đang mở</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                  <p className="text-sm font-black text-rose-600">{unreadChats}</p>
                  <p>Chưa đọc</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={chatStatusFilter}
                  onChange={(event) => setChatStatusFilter(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-teal-500"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang mở</option>
                  <option value="WAITING">Đang chờ</option>
                  <option value="CLOSED">Đã đóng</option>
                </select>

                <select
                  value={chatTagFilter}
                  onChange={(event) => setChatTagFilter(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-teal-500"
                >
                  <option value="all">Tất cả thẻ</option>
                  {allChatTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <EmptyState text="Chưa có hội thoại phù hợp." />
              ) : (
                filteredConversations.map((conversation) => {
                  const active = selectedConversationId === conversation.id;
                  const unread = Number(conversation.unreadByStaff ?? 0);

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        if (selectedConversationId === conversation.id) return;
                        setSelectedConversationId(conversation.id);
                      }}
                      className={`block w-full border-l-4 px-4 text-left transition py-3 ${
                        active
                          ? "border-teal-700 bg-teal-50"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex gap-3">
                        <Avatar
                          name={conversation.userName}
                          active={conversation.status === "ACTIVE"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-semibold text-slate-900">
                              {conversation.userName || `Khách #${conversation.userId ?? "ẩn danh"}`}
                            </p>
                            <span className="shrink-0 text-xs text-slate-500">
                              {formatAge(conversation.updatedAt)}
                            </span>
                          </div>

                          <p className={`mt-1 line-clamp-1 text-sm ${unread ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                            {conversation.lastMessage || "Chưa có tin nhắn"}
                          </p>
                          {conversation.lastStaffName ? (
                            <p className="mt-1 line-clamp-1 text-xs font-medium text-teal-700">
                              NV gần nhất: {conversation.lastStaffName}
                            </p>
                          ) : null}

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {(conversation.tags ?? []).slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            {unread > 0 ? (
                              <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-bold text-white">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="grid h-full grid-rows-[auto,1fr,auto] overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  name={activeConversation?.userName}
                  active={activeConversation?.status === "ACTIVE"}
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-slate-900">
                    {activeConversation?.userName || "Chọn một hội thoại"}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {activeConversation
                      ? `${activeConversation.status} · ${messages.length} tin nhắn · Cập nhật ${formatAge(activeConversation.updatedAt)}`
                      : "Danh sách hội thoại nằm ở cột bên trái"}
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                Hội thoại dùng chung
              </span>
            </div>

            <div className="min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.16),transparent_28%),radial-gradient(circle_at_70%_70%,rgba(59,130,246,0.14),transparent_32%),#eef2f7] px-6 py-5">
              {activeConversation ? (
                <div className="mx-auto max-w-4xl space-y-3">
                  <div className="mb-4 rounded-xl border border-teal-100 bg-white/95 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          Thông tin hội thoại
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Cập nhật gần nhất: {formatDateTime(activeConversation.updatedAt)}
                        </p>
                        {activeConversation.lastStaffName ? (
                          <p className="mt-1 text-sm text-teal-700">
                            Nhân viên phản hồi gần nhất: {activeConversation.lastStaffName}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex max-w-xl flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          {allChatTags.map((tag) => (
                            <TagButton
                              key={tag}
                              active={(activeConversation.tags ?? []).includes(tag)}
                              onClick={() => void toggleConversationTag(activeConversation, tag)}
                            >
                              {tag}
                            </TagButton>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={customChatTag}
                            onChange={(event) => setCustomChatTag(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void addCustomConversationTag();
                              }
                            }}
                            placeholder="Nhập thẻ mới..."
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-teal-500"
                          />
                          <button
                            type="button"
                            onClick={() => void addCustomConversationTag()}
                            disabled={!customChatTag.trim()}
                            className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Gắn thẻ
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {messages.length > 0 ? (
                    renderChatMessages()
                  ) : (
                    <p className="text-center text-sm text-slate-500">
                      Hội thoại chưa có tin nhắn nào.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Chọn một khách hàng để xem lịch sử chat và phản hồi.
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <div className="mx-auto flex max-w-4xl items-end gap-3">
                <textarea
                  ref={replyInputRef}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  rows={2}
                  disabled={!activeConversation}
                  placeholder="Nhập phản hồi cho khách hàng..."
                  className="min-h-12 flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-700 disabled:bg-slate-100"
                />

                <button
                  type="button"
                  onClick={() => void handleSendChat()}
                  disabled={!activeConversation || !chatDraft.trim()}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Gửi tin nhắn"
                >
                  <SendOutlined />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {view === "orders" ? (
        <section className="h-screen overflow-y-auto bg-slate-50 p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Đơn hàng</h1>
              <p className="mt-1 text-sm text-slate-500">
                Tìm kiếm, lọc và cập nhật trạng thái đơn hàng ngay trong bảng.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
              {filteredOrders.length} đơn
            </span>
          </div>

          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr,13rem,13rem]">
            <label className="relative block">
              <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={orderQuery}
                onChange={(event) => setOrderQuery(event.target.value)}
                placeholder="Tìm theo mã đơn, khách hàng, địa chỉ, tên sách..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
              />
            </label>

            <select
              value={orderStatusFilter}
              onChange={(event) => setOrderStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả trạng thái</option>
              {ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>

            <select
              value={orderTagFilter}
              onChange={(event) => setOrderTagFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả thẻ</option>
              {ORDER_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Đơn hàng</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Tổng tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thẻ xử lý</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {paginatedOrders.map((order) => {
                  const customer = customersById[order.user_id];
                  const tags = orderTagsById[order.id] ?? [];
                  const canApproveOrder = canStaffApproveOrder(order);
                  const statusOptionsForOrder = canApproveOrder
                    ? ORDER_STATUS_OPTIONS.filter((status) =>
                        ["Chờ duyệt", "Đã duyệt"].includes(status.value),
                      )
                    : ORDER_STATUS_OPTIONS;

                  return (
                    <tr key={order.id} className="align-top transition hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">#{order.id}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(order.order_date)}
                        </p>
                        <p className="mt-2 max-w-56 text-xs leading-relaxed text-slate-500">
                          {order.shipping_address}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-800">
                          {customer?.full_name || `Khách #${order.user_id}`}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {customer?.phone || customer?.email || "Chưa có liên hệ"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {order.payment_method}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <div className="max-w-72 space-y-1">
                          {order.items.map((item) => (
                            <p key={`${order.id}-${item.book_item_id}`} className="line-clamp-1 text-slate-600">
                              {item.title} x {item.quantity}
                            </p>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-4 font-semibold text-slate-900">
                        {formatCurrency(order.total_amount)}
                      </td>

                      <td className="px-4 py-4">
                        <select
                          value={getOrderStatusValue(order.order_status)}
                          onChange={(event) =>
                            void handleUpdateOrderStatus(order.id, event.target.value)
                          }
                          disabled={!canApproveOrder}
                          title={
                            canApproveOrder
                              ? "Chuyển đơn COD sang Đã duyệt"
                              : "Trạng thái này không được nhân viên cập nhật"
                          }
                          className={`rounded-full border px-3 py-2 text-xs font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-80 ${statusStyle(order.order_status)}`}
                        >
                          {statusOptionsForOrder.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex max-w-64 flex-wrap gap-2">
                          {ORDER_TAGS.map((tag) => (
                            <TagButton
                              key={tag}
                              active={tags.includes(tag)}
                              onClick={() => toggleOrderTag(order.id, tag)}
                            >
                              {tag}
                            </TagButton>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredOrders.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-400">
                Không tìm thấy đơn hàng phù hợp.
              </div>
            ) : null}
          </div>

          <PaginationControls
            page={safeOrderPage}
            totalPages={orderTotalPages}
            totalItems={filteredOrders.length}
            pageSize={STAFF_ORDERS_PAGE_SIZE}
            onPageChange={setOrderPage}
          />
        </section>
      ) : null}

      {view === "settings" ? (
        <section className="h-screen overflow-y-auto bg-slate-50 p-6">
          <div className="mb-5 flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <StaffAvatar
                name={profileDraft.fullName || displayName || "Nhân viên"}
                imageUrl={profileDraft.avatarUrl}
                size="lg"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                  Staff workspace
                </p>
                <h1 className="mt-1 text-2xl font-bold text-slate-950">
                  Cài đặt nhân viên
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Quản lý avatar, thông tin tài khoản, mật khẩu và thói quen xử lý chat.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-lg font-black text-slate-950">{assignedConversations.length}</p>
                <p>Hội thoại</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-lg font-black text-slate-950">{activeChatCount}</p>
                <p>Đang mở</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-lg font-black text-slate-950">{unreadChats}</p>
                <p>Chưa đọc</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr),minmax(22rem,0.85fr)]">
            <div className="space-y-5">
              <SettingCard
                title="Hồ sơ & avatar"
                icon={<CameraOutlined />}
                description="Ảnh đại diện giúp staff khác và admin nhận biết người đang phản hồi khách hàng."
              >
                <div className="grid gap-4 md:grid-cols-[9rem,minmax(0,1fr)]">
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-4 text-center">
                    <StaffAvatar
                      name={profileDraft.fullName || displayName || "Nhân viên"}
                      imageUrl={profileDraft.avatarUrl}
                      size="lg"
                    />
                    <p className="mt-3 text-sm font-bold text-slate-900">
                      {profileDraft.fullName || "Nhân viên"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {profileDraft.username || "staff"}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-xs font-semibold text-slate-500">
                      Họ tên
                      <input
                        value={profileDraft.fullName}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            fullName: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-500">
                      Tài khoản
                      <input
                        value={profileDraft.username}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            username: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-500">
                      Email
                      <input
                        value={profileDraft.email}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-500">
                      Số điện thoại
                      <input
                        value={profileDraft.phone}
                        onChange={(event) =>
                          setProfileDraft((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 p-4 md:col-span-2">
                      <p className="text-xs font-semibold text-slate-600">Ảnh đại diện</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Chọn ảnh trực tiếp từ máy tính giống trang tài khoản khách hàng. Ảnh sẽ được lưu tạm theo tài khoản đang đăng nhập.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="staff-avatar-upload"
                          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
                        >
                          <CameraOutlined />
                          {profileDraft.avatarUrl ? "Đổi ảnh đại diện" : "Tải ảnh đại diện"}
                        </label>
                        <input
                          id="staff-avatar-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleStaffAvatarChange}
                          className="hidden"
                        />
                        {profileDraft.avatarUrl ? (
                          <button
                            type="button"
                            onClick={handleRemoveStaffAvatar}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            Xoá ảnh
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="md:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveStaffProfile()}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                      >
                        <SaveOutlined />
                        Lưu hồ sơ
                      </button>
                    </div>
                  </div>
                </div>
              </SettingCard>

              <SettingCard
                title="Bảo mật tài khoản"
                icon={<LockOutlined />}
                description="Đổi mật khẩu định kỳ để bảo vệ tài khoản staff và lịch sử hỗ trợ khách hàng."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-500">
                    Mật khẩu mới
                    <input
                      type="password"
                      value={passwordDraft.password}
                      onChange={(event) =>
                        setPasswordDraft((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-500">
                    Nhập lại mật khẩu mới
                    <input
                      type="password"
                      value={passwordDraft.confirmPassword}
                      onChange={(event) =>
                        setPasswordDraft((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                    />
                  </label>

                  <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700">
                    <span>
                      Sau khi đổi mật khẩu, nếu token cũ vẫn còn hiệu lực thì bạn có thể tiếp tục làm việc; lần đăng nhập sau dùng mật khẩu mới.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleChangePassword()}
                      className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                    >
                      Đổi mật khẩu
                    </button>
                  </div>
                </div>
              </SettingCard>
            </div>

            <div className="space-y-5">
              <SettingCard
                title="Cài đặt hiển thị & thông báo"
                icon={<BellOutlined />}
                description="Chỉ giữ các tuỳ chọn đang cần dùng thật trong luồng chat staff; mỗi tài khoản có cấu hình riêng."
              >
                <div className="space-y-3">
                  <SettingToggle
                    label="Âm thanh thông báo"
                    description="Phát âm báo ngắn khi số tin nhắn chưa đọc của staff tăng lên. Nếu trình duyệt chặn âm thanh, hãy bấm bật lại sau khi đã tương tác với trang."
                    checked={staffPreferences.notificationSound}
                    onChange={(value) => {
                      setStaffPreferences((current) => ({
                        ...current,
                        notificationSound: value,
                      }));
                      if (value) {
                        try {
                          playStaffNotificationSound();
                        } catch {
                          toast.info("Trình duyệt có thể chỉ phát âm thanh sau khi bạn tương tác với trang.");
                        }
                      }
                    }}
                  />
                  <SettingToggle
                    label="Ưu tiên hội thoại chưa đọc"
                    description="Đưa các hội thoại còn tin nhắn chưa đọc lên đầu danh sách để staff xử lý trước, giống luồng CSKH thực tế."
                    checked={staffPreferences.prioritizeUnreadChats}
                    onChange={(value) =>
                      setStaffPreferences((current) => ({
                        ...current,
                        prioritizeUnreadChats: value,
                      }))
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={handleResetStaffPreferences}
                  className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
                >
                  Khôi phục mặc định
                </button>
              </SettingCard>

              <SettingCard
                title="Quy trình staff nên dùng"
                icon={<MessageOutlined />}
                description="Bố cục này mô phỏng các hệ thống CSKH thực tế: nhận diện người xử lý, gắn thẻ, lọc hội thoại và giữ lịch sử chung cho nhiều staff."
              >
                <div className="space-y-3 text-sm text-slate-600">
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    1. Dùng thẻ như <b>Gấp</b>, <b>Khiếu nại</b>, <b>Đơn hàng</b> để lọc nhanh khách cần xử lý trước.
                  </p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    2. Mỗi tin nhắn staff gửi đều hiện tên nhân viên, nên staff khác vẫn tiếp tục hỗ trợ được mà không mất ngữ cảnh.
                  </p>
                  <p className="rounded-2xl bg-slate-50 px-4 py-3">
                    3. Với đơn hàng, chọn trạng thái bằng nhãn tiếng Việt có dấu để nhân viên không nhầm bước xử lý.
                  </p>
                </div>
              </SettingCard>
            </div>
          </div>
        </section>
      ) : null}

      {view === "books" ? (
        <section className="h-screen overflow-y-auto bg-slate-50 p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Sách & tồn kho</h1>
              <p className="mt-1 text-sm text-slate-500">
                Xem nhanh sách, lọc tồn kho và cập nhật thông tin cơ bản.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
              {filteredBooks.length} sách
            </span>
          </div>

          <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr,13rem,13rem]">
            <label className="relative block">
              <SearchOutlined className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder="Tìm theo tên sách, tác giả, mô tả..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
              />
            </label>

            <select
              value={bookCategoryFilter}
              onChange={(event) => setBookCategoryFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả thể loại</option>
              {bookCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value as StockFilter)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả tồn kho</option>
              <option value="inStock">Còn nhiều</option>
              <option value="lowStock">Sắp hết</option>
              <option value="outOfStock">Hết hàng</option>
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paginatedBooks.map((book) => {
              const draft = bookDrafts[book.id] ?? {
                total_stock: String(book.total_stock ?? 0),
                description: book.description ?? "",
              };
              const stock = Number(book.total_stock ?? 0);

              return (
                <article key={book.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex gap-3">
                    <img
                      src={book.cover_image || "/placeholder-book.png"}
                      alt={book.title}
                      className="h-28 w-20 rounded-xl object-cover bg-slate-100"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-bold text-slate-900">{book.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{book.author_name || "Chưa rõ tác giả"}</p>
                      <p className="mt-1 text-xs text-slate-500">{book.category_name || "Chưa phân loại"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-teal-50 px-2 py-1 font-semibold text-teal-700">
                          {formatCurrency(book.selling_price)}
                        </span>
                        <span className={`rounded-full px-2 py-1 font-semibold ${stock <= 0 ? "bg-rose-50 text-rose-700" : stock <= 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                          Tồn: {stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <label className="block text-xs font-semibold text-slate-500">
                      Tồn kho
                      <input
                        value={draft.total_stock}
                        onChange={(event) =>
                          setBookDrafts((current) => ({
                            ...current,
                            [book.id]: { ...draft, total_stock: event.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-slate-500">
                      Mô tả ngắn
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setBookDrafts((current) => ({
                            ...current,
                            [book.id]: { ...draft, description: event.target.value },
                          }))
                        }
                        rows={3}
                        className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-teal-500"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void handleSaveBook(book.id)}
                      className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredBooks.length === 0 ? (
            <EmptyState text="Không tìm thấy sách phù hợp." />
          ) : null}

          <PaginationControls
            page={safeBookPage}
            totalPages={bookTotalPages}
            totalItems={filteredBooks.length}
            pageSize={STAFF_BOOKS_PAGE_SIZE}
            onPageChange={setBookPage}
          />
        </section>
      ) : null}
    </div>
  );
}
