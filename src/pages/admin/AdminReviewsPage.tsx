import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  getReviewsForModeration,
  moderateReview,
  type ApiReview,
  type ReviewStatus,
} from "../../services/reviewsService";

const STATUS_TABS: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Chờ duyệt" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "all", label: "Tất cả" },
];

function formatStatus(status: number): string {
  if (status === 1) return "Đã duyệt";
  if (status === -1) return "Từ chối";
  return "Chờ duyệt";
}

function statusClass(status: number): string {
  if (status === 1) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === -1) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function renderStars(rating: number): string {
  const safe = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminReviewsPage() {
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [reviews, setReviews] = useState<ApiReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const pendingCount = useMemo(
    () => reviews.filter((review) => review.is_approved === 0).length,
    [reviews],
  );

  async function loadReviews(nextStatus = status) {
    try {
      setLoading(true);
      setReviews(await getReviewsForModeration(nextStatus));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không tải được đánh giá.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviews(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleModerate(reviewId: string, isApproved: 1 | -1) {
    try {
      setUpdatingId(reviewId);
      await moderateReview(reviewId, isApproved);
      toast.success(isApproved === 1 ? "Đã duyệt đánh giá." : "Đã từ chối đánh giá.");
      await loadReviews(status);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không cập nhật được đánh giá.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">Duyệt đánh giá</h1>
          <p className="mt-1 text-sm text-gray-500">
            Kiểm tra bình luận của khách hàng trước khi hiển thị công khai.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
          {pendingCount} đánh giá chờ duyệt
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setStatus(item.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              status === item.value
                ? "bg-teal-700 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:border-teal-600 hover:text-teal-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-5 text-sm text-gray-500">Đang tải đánh giá...</div>
        ) : reviews.length === 0 ? (
          <div className="p-5 text-sm text-gray-500">
            Không có đánh giá nào trong nhóm này.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reviews.map((review) => (
              <article key={review.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-gray-900">
                        {review.user_name || `User #${review.user_id}`}
                      </h2>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                          review.is_approved,
                        )}`}
                      >
                        {formatStatus(review.is_approved)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {review.book_title || `Sách #${review.book_id}`} ·{" "}
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                  <div className="text-right text-sm font-semibold text-amber-500">
                    {renderStars(review.rating)}
                  </div>
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-700">
                  {review.comment}
                </p>

                {review.is_approved === 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleModerate(review.id, 1)}
                      disabled={updatingId === review.id}
                      className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Duyệt
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleModerate(review.id, -1)}
                      disabled={updatingId === review.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Từ chối
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
