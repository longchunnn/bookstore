import axiosClient from "./axiosClient";
import { unwrapResult } from "../utils/apiResponse";

// ============================================================
// Types
// ============================================================

export interface FlashSaleActiveItem {
  flash_sale_item_id: number;
  book_id: number;
  book_title: string;
  cover_image: string;
  original_price: number;
  flash_sale_price: number;
  total_quantity: number;
  remaining_stock: number;
  sold_quantity: number;
  max_per_user: number;
  sold_out: boolean;
  is_purchased: boolean;
}

export interface FlashSaleActiveCampaign {
  campaign_id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  items: FlashSaleActiveItem[];
}

export interface FlashSaleReserveResponse {
  reservation_id: string;
  order_id: number;
  payment_url: string;
  expires_at: number;
  countdown_seconds: number;
}

export interface FlashSaleReservationStatus {
  reservation_id: string;
  order_id: number;
  status: "PENDING" | "SUCCESS" | "EXPIRED" | "CANCELLED";
  remaining_seconds: number;
  payment_url: string;
}

export interface StockUpdateEvent {
  flash_sale_item_id: number;
  remaining_stock: number;
  sold_out: boolean;
}

// ============================================================
// API calls
// ============================================================

export async function getActiveFlashSales(): Promise<FlashSaleActiveCampaign[]> {
  const response = await axiosClient.get("/flash-sale/active");
  return unwrapResult<FlashSaleActiveCampaign[]>(response) ?? [];
}

export async function reserveFlashSale(
  flashSaleItemId: number,
  quantity: number,
  shippingAddress: string
): Promise<FlashSaleReserveResponse> {
  const response = await axiosClient.post("/flash-sale/reserve", {
    flash_sale_item_id: flashSaleItemId,
    quantity,
    shipping_address: shippingAddress,
  });
  return unwrapResult<FlashSaleReserveResponse>(response);
}

export async function getReservationStatus(
  reservationId: string
): Promise<FlashSaleReservationStatus> {
  const response = await axiosClient.get(
    `/flash-sale/reserve/${reservationId}/status`
  );
  return unwrapResult<FlashSaleReservationStatus>(response);
}

// ============================================================
// SSE connection
// ============================================================

export function connectStockSSE(
  onUpdate: (data: StockUpdateEvent) => void,
  onError?: (err: Event) => void
): EventSource {
  const baseUrl =
    (axiosClient.defaults.baseURL ?? "http://localhost:8081/api/v1").replace(
      /\/$/,
      ""
    );
  const eventSource = new EventSource(`${baseUrl}/flash-sale/sse/stock`);

  eventSource.addEventListener("stock-update", (event) => {
    try {
      const data: StockUpdateEvent = JSON.parse(
        (event as MessageEvent).data
      );
      onUpdate(data);
    } catch {
      console.warn("[SSE] Failed to parse stock update", event);
    }
  });

  eventSource.addEventListener("connected", () => {
    console.log("[SSE] Connected to flash sale stock stream");
  });

  eventSource.onerror = (err) => {
    console.error("[SSE] Connection error", err);
    onError?.(err);
  };

  return eventSource;
}
