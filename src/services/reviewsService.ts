import axiosClient from "./axiosClient";
import { unwrapResult } from "../utils/apiResponse";

export type ReviewStatus = "all" | "pending" | "approved" | "rejected";

export type ApiReview = {
  id: string;
  book_id: string;
  book_title: string;
  user_id: string;
  user_name: string;
  rating: number;
  comment: string;
  is_approved: number;
  created_at: string;
};

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeReview(value: unknown): ApiReview {
  const review = (value || {}) as Record<string, unknown>;
  return {
    id: asString(review.id ?? review.reviewId),
    book_id: asString(review.book_id ?? review.bookId),
    book_title: asString(review.book_title ?? review.bookTitle),
    user_id: asString(review.user_id ?? review.userId),
    user_name: asString(review.user_name ?? review.userName),
    rating: asNumber(review.rating),
    comment: asString(review.comment),
    is_approved: asNumber(review.is_approved ?? review.isApproved),
    created_at: asString(review.created_at ?? review.createdAt),
  };
}

export async function getBookReviews(bookId: string): Promise<ApiReview[]> {
  const response = await axiosClient.get(
    `/books/${encodeURIComponent(bookId)}/reviews`,
  );
  const result = unwrapResult<unknown[]>(response);
  return Array.isArray(result) ? result.map((item) => normalizeReview(item)) : [];
}

export async function createBookReview(
  bookId: string,
  payload: { rating: number; comment: string },
): Promise<ApiReview> {
  const response = await axiosClient.post(
    `/books/${encodeURIComponent(bookId)}/reviews`,
    {
      rating: payload.rating,
      comment: payload.comment,
    },
  );
  return normalizeReview(unwrapResult(response));
}

export async function getReviewsForModeration(
  status: ReviewStatus = "pending",
): Promise<ApiReview[]> {
  const response = await axiosClient.get("/admin/reviews", {
    params: { status },
  });
  const result = unwrapResult<unknown[]>(response);
  return Array.isArray(result) ? result.map((item) => normalizeReview(item)) : [];
}

export async function moderateReview(
  reviewId: string,
  isApproved: 1 | -1,
): Promise<ApiReview> {
  const response = await axiosClient.patch(
    `/admin/reviews/${encodeURIComponent(reviewId)}`,
    {
      is_approved: isApproved,
    },
  );
  return normalizeReview(unwrapResult(response));
}
