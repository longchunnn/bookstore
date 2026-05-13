import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isJwtExpired, parseJwtPayload } from "../../utils/jwt";
import { normalizeRole, resolvePrimaryRole, resolveRoles } from "../../utils/roles";

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  phone?: string;
};

export type ProfileForm = {
  fullName: string;
  email: string;
  phone: string;
  shippingFullName: string;
  shippingPhone: string;
  shippingAddressLine: string;
  shippingProvince: string;
  shippingDistrict: string;
  shippingWard: string;
};

export type SavedAddress = {
  id: string;
  isDefault?: boolean;
  fullName: string;
  phone: string;
  addressLine: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  wardCode: string;
  wardName: string;
  postalCode: string;
};

export type SessionState = {
  token: string | null;
  userId: string;
  displayName: string;
  user: UserRecord | null;
  profileForm: ProfileForm;
  avatarSrc: string;
  savedAddresses: SavedAddress[];
  selectedAddressId: string | null;
  roles: string[];
  primaryRole: string;
};

export type HydrateSessionPayload = {
  token: string;
  userId: string;
  displayName: string;
  user?: UserRecord | null;
  profileForm?: ProfileForm | null;
  avatarSrc?: string;
  savedAddresses?: SavedAddress[];
  selectedAddressId?: string | null;
  roles?: string[];
  primaryRole?: string;
};

const TOKEN_KEY = "access_token";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function getStorageKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

function normalizeRoles(raw: unknown, primaryRole = ""): string[] {
  const roles = Array.isArray(raw)
    ? raw
        .map((value) => normalizeRole(value))
        .filter(Boolean)
        .map((value) => `ROLE_${value}`)
    : [];

  const normalizedPrimaryRole = normalizeRole(primaryRole);
  if (normalizedPrimaryRole) {
    const entry = `ROLE_${normalizedPrimaryRole}`;
    if (!roles.includes(entry)) roles.push(entry);
  }

  return roles;
}

function getDefaultProfileForm(user: UserRecord | null): ProfileForm {
  return {
    fullName: user?.full_name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    shippingFullName: user?.full_name ?? "",
    shippingPhone: user?.phone ?? "",
    shippingAddressLine: "",
    shippingProvince: "",
    shippingDistrict: "",
    shippingWard: "",
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadInitialSession(): SessionState {
  if (!canUseStorage()) {
    return {
      token: null,
      userId: "",
      displayName: "",
      user: null,
      profileForm: getDefaultProfileForm(null),
      avatarSrc: "",
      savedAddresses: [],
      selectedAddressId: null,
      roles: [],
      primaryRole: "",
    };
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || isJwtExpired(token)) {
    return {
      token: null,
      userId: "",
      displayName: "",
      user: null,
      profileForm: getDefaultProfileForm(null),
      avatarSrc: "",
      savedAddresses: [],
      selectedAddressId: null,
      roles: [],
      primaryRole: "",
    };
  }

  const payload = parseJwtPayload(token);
  const userId = String(payload?.user_id ?? payload?.sub ?? "");
  const fullName =
    typeof payload?.full_name === "string" ? payload.full_name : "";
  const username =
    typeof payload?.username === "string" ? payload.username : "";
  const email = typeof payload?.email === "string" ? payload.email : "";
  const displayName = fullName || username;
  const primaryRole = resolvePrimaryRole(payload);
  const roles = resolveRoles(payload, primaryRole);
  const profileForm = readJson<ProfileForm>(
    getStorageKey("bookstore_profile_form", userId),
    getDefaultProfileForm({ id: userId, username, email, full_name: fullName }),
  );
  const savedAddresses = readJson<SavedAddress[]>(
    getStorageKey("bookstore_saved_addresses", userId),
    [],
  );
  const selectedAddressId =
    savedAddresses.find((address) => address.isDefault)?.id ?? null;
  const avatarSrc =
    localStorage.getItem(getStorageKey("bookstore_profile_avatar", userId)) ??
    "";

  return {
    token,
    userId,
    displayName,
    user: {
      id: userId,
      username,
      email,
      full_name: fullName,
    },
    profileForm,
    avatarSrc,
    savedAddresses,
    selectedAddressId,
    roles,
    primaryRole,
  };
}

const initialState: SessionState = loadInitialSession();

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    hydrateSession(state, action: PayloadAction<HydrateSessionPayload>) {
      state.token = action.payload.token;
      state.userId = action.payload.userId;
      state.displayName = action.payload.displayName;
      state.user = action.payload.user ?? null;
      state.profileForm =
        action.payload.profileForm ??
        getDefaultProfileForm(action.payload.user ?? null);
      state.avatarSrc = action.payload.avatarSrc ?? "";
      state.savedAddresses = action.payload.savedAddresses ?? [];
      state.selectedAddressId =
        action.payload.selectedAddressId ??
        state.savedAddresses.find((address) => address.isDefault)?.id ??
        null;
      state.primaryRole = normalizeRole(action.payload.primaryRole);
      state.roles = normalizeRoles(action.payload.roles, state.primaryRole);
    },
    clearSession(state) {
      state.token = null;
      state.userId = "";
      state.displayName = "";
      state.user = null;
      state.profileForm = getDefaultProfileForm(null);
      state.avatarSrc = "";
      state.savedAddresses = [];
      state.selectedAddressId = null;
      state.roles = [];
      state.primaryRole = "";
    },
    setUser(state, action: PayloadAction<UserRecord | null>) {
      state.user = action.payload;
      if (action.payload) {
        state.displayName = action.payload.full_name || action.payload.username;
      }
    },
    setProfileForm(state, action: PayloadAction<ProfileForm>) {
      state.profileForm = action.payload;
    },
    setAvatarSrc(state, action: PayloadAction<string>) {
      state.avatarSrc = action.payload;
    },
    setSavedAddresses(state, action: PayloadAction<SavedAddress[]>) {
      state.savedAddresses = action.payload;
    },
    setSelectedAddressId(state, action: PayloadAction<string | null>) {
      state.selectedAddressId = action.payload;
    },
    upsertSavedAddress(state, action: PayloadAction<SavedAddress>) {
      const next = state.savedAddresses.filter(
        (address) => address.id !== action.payload.id,
      );
      state.savedAddresses = [action.payload, ...next];
      state.selectedAddressId = action.payload.id;
    },
    removeSavedAddress(state, action: PayloadAction<string>) {
      state.savedAddresses = state.savedAddresses.filter(
        (address) => address.id !== action.payload,
      );
      if (state.selectedAddressId === action.payload) {
        state.selectedAddressId =
          state.savedAddresses.find((address) => address.isDefault)?.id ??
          state.savedAddresses[0]?.id ??
          null;
      }
    },
  },
});

export const {
  hydrateSession,
  clearSession,
  setUser,
  setProfileForm,
  setAvatarSrc,
  setSavedAddresses,
  setSelectedAddressId,
  upsertSavedAddress,
  removeSavedAddress,
} = sessionSlice.actions;

export default sessionSlice.reducer;
