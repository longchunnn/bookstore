import { useEffect } from "react";
import { useAppDispatch } from "./hooks";
import { cleanupExpiredClaimedVouchers } from "../features/voucher/voucherCleanup";

export default function AppBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(cleanupExpiredClaimedVouchers() as any);
  }, [dispatch]);

  return null;
}
