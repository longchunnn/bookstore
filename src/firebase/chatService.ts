import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import axiosClient from "../services/axiosClient";
import { unwrapResult } from "../utils/apiResponse";
import { firebaseAuth, firebaseDb, firebaseEnabled } from "./client";
import { ensureFirebaseChatLogin } from "./chatAuth";

export type ChatConversation = {
  id: string;
  userUid: string;
  userId?: number | null;
  userName?: string;
  staffUid?: string | null;
  staffId?: number | null;
  staffName?: string | null;
  lastStaffName?: string | null;
  status: "WAITING" | "ACTIVE" | "CLOSED" | string;
  createdAt?: { seconds?: number; nanoseconds?: number } | Date | null;
  updatedAt?: { seconds?: number; nanoseconds?: number } | Date | null;
  lastMessage?: string;
  lastMessageAt?: { seconds?: number; nanoseconds?: number } | Date | null;
  unreadByUser?: number;
  unreadByStaff?: number;
  tags?: string[];
};

export type ChatMessage = {
  id: string;
  senderUid: string;
  senderRole: string;
  senderName?: string;
  content: string;
  createdAt?: { seconds?: number; nanoseconds?: number } | Date | null;
  read?: boolean;
};

type StaffStatusPayload = {
  staffUid: string;
  staffId: string;
  staffName: string;
  acceptingChats: boolean;
  currentLoad?: number;
  maxLoad: number;
};

function requireFirebaseDb() {
  if (!firebaseEnabled || !firebaseDb || !firebaseAuth) {
    throw new Error(
      "Firebase chưa sẵn sàng. Hãy kiểm tra cấu hình Firebase phía frontend.",
    );
  }
  return { db: firebaseDb, auth: firebaseAuth };
}

function toMillis(value: ChatConversation["updatedAt"] | ChatConversation["lastMessageAt"] | ChatMessage["createdAt"]) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function mapConversationDoc(entry: { id: string; data: () => unknown }): ChatConversation {
  const data = entry.data() as Omit<ChatConversation, "id">;
  return normalizeConversation({ id: entry.id, ...data });
}

function normalizeConversation(raw: ChatConversation): ChatConversation {
  return {
    ...raw,
    userId: raw.userId ?? null,
    staffId: raw.staffId ?? null,
    staffUid: raw.staffUid ?? null,
    staffName: raw.staffName ?? null,
    lastStaffName: raw.lastStaffName ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
  };
}

function normalizeConversations(items: ChatConversation[]) {
  return items
    .map(normalizeConversation)
    .sort((left, right) => toMillis(right.updatedAt) - toMillis(left.updatedAt));
}

function createPollingSubscription(
  load: () => Promise<void>,
  intervalMs = 3500,
): Unsubscribe {
  let stopped = false;
  let timer: number | undefined;

  const tick = () => {
    if (stopped) return;
    void load()
      .catch((error) => {
        console.error("[staff chat polling]", error);
      })
      .finally(() => {
        if (!stopped) {
          timer = window.setTimeout(tick, intervalMs);
        }
      });
  };

  tick();

  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  };
}

export async function listenMyConversations(
  callback: (items: ChatConversation[]) => void,
): Promise<Unsubscribe> {
  await ensureFirebaseChatLogin();
  const { db, auth } = requireFirebaseDb();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Bạn chưa đăng nhập Firebase Chat.");

  const q = query(collection(db, "conversations"), where("userUid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map(mapConversationDoc)
      .sort((left, right) => toMillis(right.updatedAt) - toMillis(left.updatedAt));
    callback(items);
  });
}

export async function listenAssignedConversations(
  callback: (items: ChatConversation[]) => void,
): Promise<Unsubscribe> {
  // Staff không query trực tiếp collection conversations nữa vì Firestore Rules thường
  // không cho client list toàn bộ hội thoại. Backend Admin SDK sẽ đọc thay staff.
  const load = async () => {
    const response = await axiosClient.get("/staff/chat/conversations");
    const items = unwrapResult<ChatConversation[]>(response);
    callback(normalizeConversations(Array.isArray(items) ? items : []));
  };

  return createPollingSubscription(load);
}

export async function listenMessages(
  conversationId: string,
  callback: (items: ChatMessage[]) => void,
): Promise<Unsubscribe> {
  await ensureFirebaseChatLogin();
  const { db } = requireFirebaseDb();
  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((entry) => ({
      id: entry.id,
      ...(entry.data() as Omit<ChatMessage, "id">),
    }));
    callback(items);
  });
}

export async function listenStaffMessages(
  conversationId: string,
  callback: (items: ChatMessage[]) => void,
): Promise<Unsubscribe> {
  const load = async () => {
    const response = await axiosClient.get(`/staff/chat/conversations/${conversationId}/messages`);
    const items = unwrapResult<ChatMessage[]>(response);
    callback(Array.isArray(items) ? items : []);
  };

  return createPollingSubscription(load, 2500);
}

export async function sendConversationMessage(
  conversationId: string,
  content: string,
  senderRole: string,
  senderName: string,
): Promise<void> {
  const safeContent = String(content || "").trim();
  if (!safeContent) return;

  await ensureFirebaseChatLogin();
  const { db, auth } = requireFirebaseDb();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Bạn chưa đăng nhập Firebase Chat.");

  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    senderUid: uid,
    senderRole,
    senderName,
    content: safeContent,
    createdAt: serverTimestamp(),
    read: false,
  });

  const conversationPatch: Record<string, unknown> = {
    lastMessage: safeContent,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: "ACTIVE",
  };

  if (senderRole === "STAFF") {
    conversationPatch.staffUid = uid;
    conversationPatch.staffName = senderName;
    conversationPatch.lastStaffName = senderName;
    conversationPatch.unreadByUser = increment(1);
    conversationPatch.unreadByStaff = 0;
  } else {
    conversationPatch.unreadByStaff = increment(1);
    conversationPatch.unreadByUser = 0;
  }

  // Chỉ user widget còn dùng đường Firestore trực tiếp. Staff dùng backend ở
  // sendStaffConversationMessage để không bị permission-denied.
  await updateDoc(doc(db, "conversations", conversationId), conversationPatch);
}

export async function sendStaffConversationMessage(
  conversationId: string,
  content: string,
): Promise<void> {
  const safeContent = String(content || "").trim();
  if (!safeContent) return;
  await axiosClient.post(`/staff/chat/conversations/${conversationId}/messages`, {
    content: safeContent,
  });
}

export async function updateConversationTags(
  conversationId: string,
  tags: string[],
): Promise<void> {
  const safeTags = Array.from(
    new Set(tags.map((tag) => String(tag).trim()).filter(Boolean)),
  );
  await axiosClient.patch(`/staff/chat/conversations/${conversationId}/tags`, {
    tags: safeTags,
  });
}

export async function markConversationRead(
  conversationId: string,
  readerRole: "USER" | "STAFF",
): Promise<void> {
  if (readerRole === "STAFF") {
    await axiosClient.patch(`/staff/chat/conversations/${conversationId}/read`);
    return;
  }

  await ensureFirebaseChatLogin();
  const { db } = requireFirebaseDb();
  await updateDoc(doc(db, "conversations", conversationId), {
    unreadByUser: 0,
  });
}

export async function upsertStaffStatus(params: StaffStatusPayload): Promise<void> {
  await axiosClient.post("/staff/chat/status", {
    accepting_chats: params.acceptingChats,
    current_load: params.currentLoad,
    max_load: params.maxLoad,
  });
}
