import axiosClient from "./axiosClient";
import { normalizeOrder, type ApiOrder } from "../utils/apiMappers";
import {
  unwrapPagedContent,
  unwrapResult,
  type PagedResult,
} from "../utils/apiResponse";

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
  const limit = params?.limit ?? 100;
  const firstPage = params?.page ?? 0;
  const response = await axiosClient.get("/orders", {
    params: {
      _page: firstPage,
      _limit: limit,
      _sort: "orderId",
      _order: "desc",
      user_id: params?.userId,
    },
  });
  const firstResult = unwrapResult<PagedResult<unknown> | unknown[]>(response);
  if (Array.isArray(firstResult)) {
    return firstResult.map((entry) => normalizeOrder(entry));
  }

  const content = firstResult.content.map((entry) => normalizeOrder(entry));
  if (params?.page !== undefined || firstResult.totalPages <= firstPage + 1) {
    return content;
  }

  const remainingResponses = await Promise.all(
    Array.from(
      { length: firstResult.totalPages - firstPage - 1 },
      (_, index) =>
        axiosClient.get("/orders", {
          params: {
            _page: firstPage + index + 1,
            _limit: limit,
            _sort: "orderId",
            _order: "desc",
            user_id: params?.userId,
          },
        }),
    ),
  );

  return [
    ...content,
    ...remainingResponses.flatMap((entry) =>
      unwrapPagedContent<unknown>(entry).map((item) => normalizeOrder(item)),
    ),
  ];
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
