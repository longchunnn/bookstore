import axiosClient from "./axiosClient";
import { normalizeBook, type ApiBook } from "../utils/apiMappers";
import { unwrapPagedContent, unwrapResult } from "../utils/apiResponse";

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
  const response = await axiosClient.get("/books", {
    params: {
      _page: params?.page ?? 0,
      _limit: params?.limit ?? 100,
      q: params?.q,
      category_name: params?.categoryName,
      _sort: "bookId",
      _order: "desc",
    },
  });

  return unwrapPagedContent<unknown>(response).map((entry) => normalizeBook(entry));
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
