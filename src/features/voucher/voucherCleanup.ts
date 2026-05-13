import { getVouchers } from "../../services/vouchersService";
import { isJwtExpired, parseJwtPayload } from "../../utils/jwt";
import { isExpired } from "../../utils/promotionExpiry";
import { setClaimedVouchers, type VoucherWalletItem } from "./voucherSlice";

const TOKEN_KEY = "access_token";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function getCurrentUserIdFromStorage(): string {
  if (!canUseStorage()) return "";
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || isJwtExpired(token)) return "";
    const payload = parseJwtPayload(token);
    return String(payload?.user_id ?? payload?.sub ?? "").trim();
  } catch {
    return "";
  }
}

function persistClaimedVouchers(userId: string, vouchers: VoucherWalletItem[]) {
  if (!canUseStorage()) return;
  if (!userId) return;
  try {
    localStorage.setItem(
      `bookstore_claimed_vouchers:${userId}`,
      JSON.stringify(vouchers),
    );
  } catch {
    // ignore
  }
}

export function cleanupExpiredClaimedVouchers() {
  return async (dispatch: any, getState: any) => {
    const state = getState?.();
    const claimed: VoucherWalletItem[] = Array.isArray(
      state?.voucher?.claimedVouchers,
    )
      ? state.voucher.claimedVouchers
      : [];

    if (!claimed.length) {
      return { removed: 0 };
    }

    const nowMs = Date.now();

    // Always drop vouchers that have a known expires_at in the past.
    const prefiltered = claimed.filter((item) => {
      const expiresAt = (item as any).expires_at as string | undefined;
      return !isExpired(expiresAt, nowMs);
    });

    let vouchersFromServer: { promotionId: string; endDate?: string }[] = [];
    try {
      const list = await getVouchers();
      vouchersFromServer = Array.isArray(list)
        ? list.map((v) => ({
            promotionId: String(v.promotionId),
            endDate: v.endDate,
          }))
        : [];
    } catch {
      vouchersFromServer = [];
    }

    const endDateById = new Map(
      vouchersFromServer
        .map((v) => [String(v.promotionId), v.endDate] as const)
        .filter(([id]) => Boolean(id)),
    );

    const next = prefiltered.filter((item) => {
      const expiresAt = (item as any).expires_at as string | undefined;
      if (expiresAt) {
        return !isExpired(expiresAt, nowMs);
      }

      const endDate = endDateById.get(String(item.id));
      if (!endDate) {
        // Unknown end date => keep (avoid deleting user data aggressively).
        return true;
      }

      return !isExpired(endDate, nowMs);
    });

    const removed = claimed.length - next.length;
    if (removed <= 0) {
      return { removed: 0 };
    }

    dispatch(setClaimedVouchers(next));

    // Persist even if session slice isn't hydrated yet.
    const userId = getCurrentUserIdFromStorage();
    persistClaimedVouchers(userId, next);

    return { removed };
  };
}
