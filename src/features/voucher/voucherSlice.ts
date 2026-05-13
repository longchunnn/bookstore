import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isJwtExpired, parseJwtPayload } from "../../utils/jwt";
import { isExpired } from "../../utils/promotionExpiry";

export type VoucherType = "discount" | "freeship";

export type VoucherWalletItem = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  discount_percent: number;
  applies_to_categories: string[];
  voucher_type: VoucherType;
  claimed_at: string;
  expires_at?: string;
};

type VoucherState = {
  claimedVouchers: VoucherWalletItem[];
};

type ClaimVoucherPayload = Omit<
  VoucherWalletItem,
  "claimed_at" | "applies_to_categories"
> & {
  applies_to_categories?: string[];
};

const TOKEN_KEY = "access_token";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function loadInitialVouchers(): VoucherWalletItem[] {
  if (!canUseStorage()) {
    return [];
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || isJwtExpired(token)) {
    return [];
  }

  const payload = parseJwtPayload(token);
  const userId = String(payload?.user_id ?? payload?.sub ?? "").trim();
  if (!userId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(`bookstore_claimed_vouchers:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as VoucherWalletItem[];
    if (!Array.isArray(parsed)) return [];

    const nowMs = Date.now();
    return parsed
      .filter((voucher) => !isExpired(voucher.expires_at, nowMs))
      .map((voucher) => normalizeVoucherDisplay(voucher));
  } catch {
    return [];
  }
}

const initialState: VoucherState = {
  claimedVouchers: loadInitialVouchers(),
};

function normalizeVoucherDisplay(
  voucher: VoucherWalletItem,
): VoucherWalletItem {
  if (voucher.voucher_type !== "freeship") {
    return voucher;
  }

  return {
    ...voucher,
    title: "Giảm 100% phí vận chuyển",
    subtitle: "Áp dụng cho phí ship tiêu chuẩn",
  };
}

function normalizeCategories(categories?: string[]): string[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    return ["ALL"];
  }
  return categories;
}

const voucherSlice = createSlice({
  name: "voucher",
  initialState,
  reducers: {
    setClaimedVouchers(state, action: PayloadAction<VoucherWalletItem[]>) {
      state.claimedVouchers = Array.isArray(action.payload)
        ? action.payload.map((voucher) => normalizeVoucherDisplay(voucher))
        : [];
    },
    claimVoucher(state, action: PayloadAction<ClaimVoucherPayload>) {
      const exists = state.claimedVouchers.some(
        (item) => item.id === action.payload.id,
      );
      if (exists) return;

      const nextVoucher: VoucherWalletItem = normalizeVoucherDisplay({
        ...action.payload,
        applies_to_categories: normalizeCategories(
          action.payload.applies_to_categories,
        ),
        claimed_at: new Date().toISOString(),
      });

      state.claimedVouchers = [nextVoucher, ...state.claimedVouchers];
    },
    clearClaimedVouchers(state) {
      state.claimedVouchers = [];
    },
  },
});

export const { setClaimedVouchers, claimVoucher, clearClaimedVouchers } =
  voucherSlice.actions;

export default voucherSlice.reducer;
