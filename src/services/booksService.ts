import axiosClient from "./axiosClient";
import { normalizeBook, type ApiBook } from "../utils/apiMappers";
import {
  unwrapPagedContent,
  unwrapResult,
  type PagedResult,
} from "../utils/apiResponse";

export async function getBooks(): Promise<ApiBook[]> {
  const response = await axiosClient.get("/books", {
    params: { _page: 0, _limit: 100, _sort: "bookId", _order: "desc" },
  });
  return unwrapPagedContent<unknown>(response).map((entry) => normalizeBook(entry));
}

export async function getBookById(bookId: string): Promise<ApiBook> {
  const response = await axiosClient.get(`/books/${encodeURIComponent(bookId)}`);
  return normalizeBook(unwrapResult(response));
}

export async function getBooksForStaff(params?: {
  page?: number;
  limit?: number;
  q?: string;
  categoryName?: string;
}): Promise<ApiBook[]> {
  const limit = params?.limit ?? 100;
  const firstPage = params?.page ?? 0;
  const response = await axiosClient.get("/books", {
    params: {
      _page: firstPage,
      _limit: limit,
      q: params?.q,
      category_name: params?.categoryName,
      _sort: "bookId",
      _order: "desc",
    },
  });
  const firstResult = unwrapResult<PagedResult<unknown> | unknown[]>(response);
  if (Array.isArray(firstResult)) {
    return firstResult.map((entry) => normalizeBook(entry));
  }

  const content = firstResult.content.map((entry) => normalizeBook(entry));
  if (params?.page !== undefined || firstResult.totalPages <= firstPage + 1) {
    return content;
  }

  const remainingResponses = await Promise.all(
    Array.from(
      { length: firstResult.totalPages - firstPage - 1 },
      (_, index) =>
        axiosClient.get("/books", {
          params: {
            _page: firstPage + index + 1,
            _limit: limit,
            q: params?.q,
            category_name: params?.categoryName,
            _sort: "bookId",
            _order: "desc",
          },
        }),
    ),
  );

  return [
    ...content,
    ...remainingResponses.flatMap((entry) =>
      unwrapPagedContent<unknown>(entry).map((item) => normalizeBook(item)),
    ),
  ];
}

export async function createBook(payload: Record<string, unknown>): Promise<ApiBook> {
  const response = await axiosClient.post("/books", payload);
  return normalizeBook(unwrapResult(response));
}

export async function updateBookPartial(
  bookId: string,
  payload: Record<string, unknown>,
): Promise<ApiBook> {
  const response = await axiosClient.patch(
    `/books/${encodeURIComponent(bookId)}`,
    payload,
  );
  return normalizeBook(unwrapResult(response));
}
