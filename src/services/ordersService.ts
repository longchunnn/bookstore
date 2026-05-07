import axiosClient from "./axiosClient";
import { normalizeOrder, type ApiOrder } from "../utils/apiMappers";
import { unwrapPagedContent, unwrapResult } from "../utils/apiResponse";

type CreateOrderPayload = Record<string, unknown>;

type UpdateOrderPayload = {
  order_status?: string;
  payment_status?: string;
};

export async function getOrders(): Promise<ApiOrder[]> {
  const response = await axiosClient.get("/orders", {
    params: { _page: 0, _limit: 100, _sort: "orderId", _order: "desc" },
  });
  return unwrapPagedContent<unknown>(response).map((entry) =>
    normalizeOrder(entry),
  );
}

export async function createOrder(
  payload: CreateOrderPayload,
): Promise<ApiOrder> {
  const response = await axiosClient.post("/orders", payload);
  return normalizeOrder(unwrapResult(response));
}

export async function getOrdersForStaff(params?: {
  page?: number;
  limit?: number;
  userId?: string;
}): Promise<ApiOrder[]> {
  const response = await axiosClient.get("/orders", {
    params: {
      _page: params?.page ?? 0,
      _limit: params?.limit ?? 100,
      _sort: "orderId",
      _order: "desc",
      user_id: params?.userId,
    },
  });
  return unwrapPagedContent<unknown>(response).map((entry) =>
    normalizeOrder(entry),
  );
}

export async function updateOrderStatus(
  orderId: string,
  payload: UpdateOrderPayload,
): Promise<ApiOrder> {
  const response = await axiosClient.patch(
    `/orders/${encodeURIComponent(orderId)}`,
    payload,
  );
  return normalizeOrder(unwrapResult(response));
}

export async function cancelOrder(orderId: string, userId: string): Promise<ApiOrder> {
  const response = await axiosClient.post(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
    { user_id: userId },
  );
  return normalizeOrder(unwrapResult(response));
}
