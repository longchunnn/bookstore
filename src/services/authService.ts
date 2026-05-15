import axiosClient from "./axiosClient";
import {
  normalizeLoginResponse,
  normalizeUser,
  type ApiUser,
} from "../utils/apiMappers";
import { unwrapResult } from "../utils/apiResponse";

export type LoginResponse = {
  accessToken: string;
  user: ApiUser | null;
};

export type RegisterPayload = {
  fullName: string;
  username: string;
  email: string;
  password: string;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

function normalizeAccount(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export async function loginWithEmailOrUsername(
  identifier: string,
  password: string,
): Promise<LoginResponse> {
  const account = normalizeAccount(identifier);
  const safePassword = String(password || "");

  if (!account || !safePassword) {
    throw new Error("Vui lòng nhập đầy đủ tài khoản và mật khẩu.");
  }

  if (import.meta.env.DEV) {
    console.log("👀 loginWithEmailOrUsername called:", { identifier: account });
  }

  let response: unknown;
  try {
    response = await axiosClient.post("/auth/login", {
      username: account,
      password: safePassword,
    });
    console.log("👀 Raw response from /auth/login:", response);
  } catch (error) {
    console.error("❌ Error during /auth/login request:", error);
    if (import.meta.env.DEV) {
      console.error("❌ loginWithEmailOrUsername failed:", error);
    }
    throw error;
  }

  if (import.meta.env.DEV) {
    console.log("👀 DỮ LIỆU THẬT MÀ AXIOS NHẬN ĐƯỢC LÀ:", response);
  }

  const normalized = normalizeLoginResponse(response);

  if (!normalized.accessToken) {
    throw new Error("Đăng nhập thất bại. Backend không trả về token.");
  }

  return normalized;
}

export async function loginWithGoogleToken(idToken: string): Promise<LoginResponse> {
  if (!idToken) {
    throw new Error("Không có token đăng nhập từ Google.");
  }

  let response: unknown;
  try {
    response = await axiosClient.post("/auth/google", {
      id_token: idToken,
    });
  } catch (error) {
    console.error("❌ Error during /auth/google request:", error);
    throw error;
  }

  const normalized = normalizeLoginResponse(response);

  if (!normalized.accessToken) {
    throw new Error("Đăng nhập bằng Google thất bại. Backend không trả về token.");
  }

  return normalized;
}

export async function registerAccount(
  payload: RegisterPayload,
): Promise<ApiUser> {
  const fullName = String(payload.fullName || "").trim();
  const username = normalizeAccount(payload.username);
  const email = normalizeAccount(payload.email);
  const password = String(payload.password || "");

  if (!fullName || !username || !email || !password) {
    throw new Error("Vui lòng nhập đầy đủ thông tin đăng ký.");
  }

  const response = await axiosClient.post("/auth/register", {
    full_name: fullName,
    username,
    email,
    password,
  });

  return normalizeUser(unwrapResult(response));
}

export async function changeCustomerPassword(
  payload: ChangePasswordPayload,
): Promise<void> {
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!currentPassword.trim() || !newPassword.trim()) {
    throw new Error("Vui lòng nhập đầy đủ thông tin đổi mật khẩu.");
  }
  if (newPassword.length < 6) {
    throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");
  }

  await axiosClient.patch("/users/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
