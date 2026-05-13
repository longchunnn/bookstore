import axiosClient from "./axiosClient";
import { normalizeUser, type ApiUser } from "../utils/apiMappers";
import { unwrapPagedContent, unwrapResult } from "../utils/apiResponse";

export async function getUserById(userId: string): Promise<ApiUser | null> {
  if (!userId.trim()) return null;
  const response = await axiosClient.get(`/users/${encodeURIComponent(userId)}`);
  return normalizeUser(unwrapResult(response));
}

export async function getUsersForStaff(params?: {
  page?: number;
  limit?: number;
  roleId?: number;
  status?: number;
  q?: string;
}): Promise<ApiUser[]> {
  const response = await axiosClient.get("/users", {
    params: {
      _page: params?.page ?? 0,
      _limit: params?.limit ?? 100,
      _sort: "userId",
      _order: "desc",
      role_id: params?.roleId,
      status: params?.status,
      q: params?.q?.trim() || undefined,
    },
  });
  return unwrapPagedContent<unknown>(response).map((entry) => normalizeUser(entry));
}

export type UserAccountPayload = {
  username?: string;
  password?: string;
  role_id?: number;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  total_points?: number;
  status?: number;
};

export async function createUserAccount(payload: UserAccountPayload): Promise<ApiUser> {
  const response = await axiosClient.post("/users", payload);
  return normalizeUser(unwrapResult(response));
}

export async function updateUserAccount(
  userId: string,
  payload: UserAccountPayload,
): Promise<ApiUser> {
  const response = await axiosClient.patch(
    `/users/${encodeURIComponent(userId)}`,
    payload,
  );
  return normalizeUser(unwrapResult(response));
}
