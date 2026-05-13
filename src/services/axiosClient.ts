import axios from "axios";
import { isJwtExpired, parseJwtPayload } from "../utils/jwt";
import { resolvePrimaryRole, resolveRoles } from "../utils/roles";
import { getStoreRef } from "../app/storeRef";
import { clearSession, hydrateSession } from "../features/session/sessionSlice";
import {
  clearCart,
  clearCheckoutSession,
  setCartItems,
  setCheckoutSession,
} from "../features/cart/cartSlice";
import {
  clearClaimedVouchers,
  setClaimedVouchers,
} from "../features/voucher/voucherSlice";

const DEFAULT_BASE_URL = "http://localhost:8081/api/v1";
const AUTH_TOKEN_KEY = "access_token";

const baseURL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  DEFAULT_BASE_URL;

export function getAccessToken(): string | null {
  const store = getStoreRef();
  const storeToken = (store?.getState() as { session?: { token?: string } })
    ?.session?.token;
  if (storeToken) {
    return isJwtExpired(storeToken) ? null : storeToken;
  }

  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token || isJwtExpired(token)) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  const store = getStoreRef();

  try {
    if (!token) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } else {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // ignore storage errors
  }

  if (!token || isJwtExpired(token)) {
    store?.dispatch(clearSession());
    store?.dispatch(clearCart());
    store?.dispatch(clearCheckoutSession());
    store?.dispatch(clearClaimedVouchers());
    return;
  }

  const payload = parseJwtPayload(token);
  const userId = String(payload?.user_id ?? payload?.sub ?? "");
  const fullName =
    typeof payload?.full_name === "string" ? payload.full_name : "";
  const username =
    typeof payload?.username === "string" ? payload.username : "";
  const email = typeof payload?.email === "string" ? payload.email : "";
  const primaryRole = resolvePrimaryRole(payload);
  const roles = resolveRoles(payload, primaryRole);
  const displayName = fullName || username;

  const profileFormRaw = localStorage.getItem(
    `bookstore_profile_form:${userId}`,
  );
  const savedAddressesRaw = localStorage.getItem(
    `bookstore_saved_addresses:${userId}`,
  );
  const avatarSrc =
    localStorage.getItem(`bookstore_profile_avatar:${userId}`) ?? "";
  const cartItemsRaw = localStorage.getItem(`bookstore_cart_items:${userId}`);
  const checkoutSessionRaw = localStorage.getItem(
    `bookstore_checkout_session:${userId}`,
  );
  const claimedVouchersRaw = localStorage.getItem(
    `bookstore_claimed_vouchers:${userId}`,
  );

  store?.dispatch(
    hydrateSession({
      token,
      userId,
      displayName,
      user: {
        id: userId,
        username,
        email,
        full_name: fullName,
      },
      profileForm: profileFormRaw ? JSON.parse(profileFormRaw) : undefined,
      savedAddresses: savedAddressesRaw
        ? JSON.parse(savedAddressesRaw)
        : undefined,
      avatarSrc,
      selectedAddressId: undefined,
      roles,
      primaryRole,
    }),
  );

  store?.dispatch(setCartItems(cartItemsRaw ? JSON.parse(cartItemsRaw) : []));
  if (checkoutSessionRaw) {
    store?.dispatch(setCheckoutSession(JSON.parse(checkoutSessionRaw)));
  } else {
    store?.dispatch(clearCheckoutSession());
  }
  store?.dispatch(
    setClaimedVouchers(
      claimedVouchersRaw ? JSON.parse(claimedVouchersRaw) : [],
    ),
  );
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export type NormalizedAxiosError = {
  message: string;
  status: number | null;
  data: unknown;
  isNetworkError: boolean;
  isCanceled: boolean;
  original: unknown;
};

export function normalizeAxiosError(error: unknown): NormalizedAxiosError {
  const safeError = error as {
    isAxiosError?: boolean;
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  if (!safeError) {
    return {
      message: "Unknown error",
      status: null,
      data: null,
      isNetworkError: false,
      isCanceled: false,
      original: error,
    };
  }

  const isAxios = Boolean(safeError.isAxiosError);
  const status = safeError.response?.status ?? null;
  const data = safeError.response?.data ?? null;
  const isCanceled =
    typeof axios.isCancel === "function" ? axios.isCancel(safeError) : false;
  const isNetworkError = isAxios && !safeError.response;

  let message = safeError.message || "Request failed";
  if (typeof data === "string" && data.trim()) message = data;
  if (data && typeof data === "object") {
    const dataObj = data as { message?: string; error?: string };
    message = dataObj.message || dataObj.error || message;
  }

  return {
    message,
    status,
    data,
    isNetworkError,
    isCanceled,
    original: error,
  };
}

const axiosClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      if (isJwtExpired(token)) {
        clearAccessToken();
        return config;
      }
      config.headers.Authorization = `Bearer ${token}`;
    }

    const isDev =
      typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
    if (isDev) {
      console.info("[axios request]", {
        method: config.method,
        url: config.url,
        headers: config.headers,
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error: unknown) => {
    const isDev =
      typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
    if (isDev) {
      console.error("[axios request error]", error);
    }
    return Promise.reject(normalizeAxiosError(error));
  },
);

axiosClient.interceptors.response.use(
  (response) => {
    const isDev =
      typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
    if (isDev) {
      console.info("[axios response]", {
        url: response.config?.url,
        status: response.status,
        data: response.data,
      });
    }
    return response.data;
  },
  (error: unknown) => {
    const err = error as { response?: { status?: number } };
    const isDev =
      typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
    if (isDev) {
      console.error("[axios response error]", error);
    }
    if (err?.response?.status === 401) {
      clearAccessToken();
    }
    return Promise.reject(normalizeAxiosError(error));
  },
);

export default axiosClient;
