import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchAdminBooks } from "../../features/adminBooks/adminBooksSlice";
import {
  addFlashSaleCampaignItem,
  createFlashSaleCampaign,
  fetchCampaigns,
} from "../../features/flashSaleAdmin/flashSaleAdminSlice";
import type { ApiBook } from "../../utils/apiMappers";

type TimeDraft = {
  campaignName: string;
  date: string;
  startTime: string;
  endTime: string;
};

type PriceDraft = {
  flash_price: string;
  flash_stock: string;
  purchase_limit: string;
  afterStatus: "restore";
};

type FlashSaleCreateDraft = {
  step: 1 | 2 | 3;
  time: TimeDraft;
  selectedBookIds: string[];
  itemConfigByBookId: Record<string, PriceDraft>;
};

const DRAFT_KEY = "admin_flash_sale_create_draft";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function clampNonNegativeInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

function toIsoWithOffset(date: string, time: string): string | null {
  const safeDate = String(date || "").trim();
  const safeTime = String(time || "").trim();
  if (!safeDate || !safeTime) return null;

  const local = new Date(`${safeDate}T${safeTime}`);
  if (Number.isNaN(local.getTime())) return null;

  const normalizedTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
  return `${safeDate}T${normalizedTime}`;
}

function formatDateLabel(date: string): string {
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function getDiscountPercent(original: number, flash: number): number {
  if (!original || original <= 0) return 0;
  if (!flash || flash <= 0) return 0;
  if (flash >= original) return 0;
  return Math.round(((original - flash) / original) * 100);
}

function getDefaultDraft(): FlashSaleCreateDraft {
  return {
    step: 1,
    time: {
      campaignName: "",
      date: "",
      startTime: "09:00",
      endTime: "12:00",
    },
    selectedBookIds: [],
    itemConfigByBookId: {},
  };
}

function readDraftFromStorage(): FlashSaleCreateDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FlashSaleCreateDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraftToStorage(draft: FlashSaleCreateDraft) {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

function clearDraftStorage() {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps: Array<{ id: 1 | 2 | 3; label: string }> = [
    { id: 1, label: "THỜI GIAN" },
    { id: 2, label: "CHỌN SẢN PHẨM" },
    { id: 3, label: "THIẾT LẬP GIÁ" },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="relative grid grid-cols-3 gap-2">
        <div className="absolute left-6 right-6 top-5 h-0.5 bg-teal-100" />
        {steps.map((item) => {
          const done = item.id < step;
          const active = item.id === step;
          const circleClass = done
            ? "bg-teal-700 text-white"
            : active
              ? "bg-white text-teal-800 ring-2 ring-teal-600"
              : "bg-white text-gray-400 ring-2 ring-gray-200";
          const labelClass = active
            ? "text-teal-800"
            : done
              ? "text-teal-700"
              : "text-gray-400";

          return (
            <div key={item.id} className="relative flex flex-col items-center">
              <div
                className={[
                  "z-10 flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold",
                  circleClass,
                ].join(" ")}
              >
                {item.id}
              </div>
              <div
                className={["mt-2 text-[11px] font-extrabold", labelClass].join(
                  " ",
                )}
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminFlashSaleCreatePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const token = useAppSelector((state) => state.session.token);
  const { items: books } = useAppSelector((state) => state.adminBooks);
  const { campaigns, saving } = useAppSelector((state) => state.flashSaleAdmin);

  const [draft, setDraft] = useState<FlashSaleCreateDraft>(() => {
    const loaded = token ? readDraftFromStorage() : null;
    return loaded ?? getDefaultDraft();
  });

  useEffect(() => {
    if (!token) return;
    writeDraftToStorage(draft);
  }, [draft, token]);

  useEffect(() => {
    void dispatch(fetchAdminBooks());
    void dispatch(fetchCampaigns());
  }, [dispatch]);

  const bookById = useMemo(() => {
    return new Map<string, ApiBook>(
      books.map((book) => [String(book.id), book]),
    );
  }, [books]);

  const selectedBooks = useMemo(() => {
    return draft.selectedBookIds
      .map((id) => bookById.get(String(id)))
      .filter(Boolean) as ApiBook[];
  }, [bookById, draft.selectedBookIds]);

  const startIso = useMemo(() => {
    return toIsoWithOffset(draft.time.date, draft.time.startTime);
  }, [draft.time.date, draft.time.startTime]);

  const endIso = useMemo(() => {
    return toIsoWithOffset(draft.time.date, draft.time.endTime);
  }, [draft.time.date, draft.time.endTime]);

  const handleNext = () => {
    if (draft.step === 1) {
      const name = draft.time.campaignName.trim();
      if (!name) {
        toast.error("Vui lòng nhập tên chiến dịch.");
        return;
      }
      if (!startIso || !endIso) {
        toast.error("Vui lòng chọn ngày và khung giờ.");
        return;
      }
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        toast.error("Thời gian không hợp lệ.");
        return;
      }
      if (end.getTime() <= start.getTime()) {
        toast.error("Giờ kết thúc phải sau giờ bắt đầu.");
        return;
      }

      setDraft((current) => ({ ...current, step: 2 }));
      return;
    }

    if (draft.step === 2) {
      if (draft.selectedBookIds.length === 0) {
        toast.error("Vui lòng chọn ít nhất 1 sản phẩm.");
        return;
      }
      setDraft((current) => ({ ...current, step: 3 }));
    }
  };

  const handleBack = () => {
    setDraft((current) => ({
      ...current,
      step: (current.step === 3 ? 2 : 1) as 1 | 2 | 3,
    }));
  };

  const handleRemoveSelectedBook = (bookId: string) => {
    setDraft((current) => {
      const nextIds = current.selectedBookIds.filter(
        (id) => String(id) !== bookId,
      );
      const nextConfig = { ...current.itemConfigByBookId };
      delete nextConfig[bookId];
      return {
        ...current,
        selectedBookIds: nextIds,
        itemConfigByBookId: nextConfig,
      };
    });
  };

  const handleSaveDraft = () => {
    if (!token) {
      toast.error("Phiên đăng nhập không hợp lệ.");
      return;
    }
    writeDraftToStorage(draft);
    toast.success("Đã lưu nháp.");
  };

  const handleActivate = async () => {
    if (draft.selectedBookIds.length === 0) {
      toast.error("Vui lòng chọn ít nhất 1 sản phẩm.");
      return;
    }

    const name = draft.time.campaignName.trim();
    if (!name || !startIso || !endIso) {
      toast.error("Vui lòng nhập đầy đủ thông tin thời gian.");
      return;
    }

    const nextStart = new Date(startIso).getTime();
    const nextEnd = new Date(endIso).getTime();
    if (Number.isNaN(nextStart) || Number.isNaN(nextEnd)) {
      toast.error("Thời gian chiến dịch không hợp lệ.");
      return;
    }

    const conflict = campaigns.find((campaign) => {
      const currentStart = new Date(campaign.starts_at).getTime();
      const currentEnd = new Date(campaign.ends_at).getTime();
      if (Number.isNaN(currentStart) || Number.isNaN(currentEnd)) return false;

      // Time ranges overlap if they intersect at any instant.
      return nextStart < currentEnd && nextEnd > currentStart;
    });

    if (conflict) {
      toast.error(
        `Khung giờ bị trùng với chiến dịch "${conflict.name}". Vui lòng chọn giờ khác.`,
      );
      return;
    }

    for (const bookId of draft.selectedBookIds) {
      const book = bookById.get(String(bookId));
      if (!book) {
        toast.error("Có sản phẩm không hợp lệ.");
        return;
      }

      const config = draft.itemConfigByBookId[String(book.id)];
      const price = Number(config?.flash_price || 0);
      const stock = clampNonNegativeInt(config?.flash_stock || "", 0);
      const limit = Math.max(
        1,
        clampNonNegativeInt(config?.purchase_limit || "1", 1),
      );

      if (!price) {
        toast.error(`Vui lòng nhập giá flash sale cho: ${book.title}`);
        return;
      }
      if (price >= book.selling_price) {
        toast.error(`Giá flash sale phải thấp hơn giá bán: ${book.title}`);
        return;
      }
      if (stock < 1) {
        toast.error(`Số lượng khuyến mãi phải > 0: ${book.title}`);
        return;
      }
      if (typeof book.total_stock === "number" && stock > book.total_stock) {
        toast.error(`Số lượng khuyến mãi vượt tồn kho: ${book.title}`);
        return;
      }
      if (limit < 1) {
        toast.error(`Giới hạn mua không hợp lệ: ${book.title}`);
        return;
      }
    }

    try {
      const created = await dispatch(
        createFlashSaleCampaign({
          name,
          starts_at: startIso,
          ends_at: endIso,
          status: "UPCOMING",
        }),
      ).unwrap();

      for (const bookId of draft.selectedBookIds) {
        const book = bookById.get(String(bookId));
        if (!book) continue;
        const config = draft.itemConfigByBookId[String(book.id)];
        const price = Number(config?.flash_price || 0);
        const stock = clampNonNegativeInt(config?.flash_stock || "", 0);
        const limit = Math.max(
          1,
          clampNonNegativeInt(config?.purchase_limit || "1", 1),
        );

        await dispatch(
          addFlashSaleCampaignItem({
            campaignId: created.id,
            payload: {
              book_id: (() => {
                const numeric = Number(book.id);
                return Number.isFinite(numeric) ? numeric : book.id;
              })(),
              flash_price: price,
              flash_stock: stock,
              purchase_limit: limit,
            },
          }),
        ).unwrap();
      }

      clearDraftStorage();
      toast.success("Đã tạo và kích hoạt chiến dịch.");
      navigate(`/admin/flash-sale?campaign=${encodeURIComponent(created.id)}`, {
        replace: true,
      });
    } catch (error_) {
      toast.error(
        typeof error_ === "string" ? error_ : "Không tạo được chiến dịch.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-gray-500">
          <Link to="/admin/flash-sale" className="hover:text-teal-800">
            Flash Sale
          </Link>
          <span className="px-2">›</span>
          <span className="text-gray-700">Tạo chiến dịch mới</span>
        </div>
        <h1 className="text-3xl font-extrabold text-teal-900">
          Tạo Flash Sale
        </h1>
        <p className="text-sm text-gray-500">
          Thiết lập chương trình khuyến mãi chớp nhoáng để tăng doanh thu và
          tương tác.
        </p>
      </div>

      <Stepper step={draft.step} />

      <div className="grid gap-5 lg:grid-cols-[1fr,20rem]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {draft.step === 1 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-extrabold text-teal-800">
                  Thông số Flash Sale
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tên chiến dịch
                  </div>
                  <input
                    value={draft.time.campaignName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        time: {
                          ...current.time,
                          campaignName: event.target.value,
                        },
                      }))
                    }
                    placeholder="Flash Sale 09:00 - 12:00"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ngày
                  </div>
                  <input
                    type="date"
                    value={draft.time.date}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        time: { ...current.time, date: event.target.value },
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Giờ bắt đầu
                  </div>
                  <input
                    type="time"
                    value={draft.time.startTime}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        time: {
                          ...current.time,
                          startTime: event.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Giờ kết thúc
                  </div>
                  <input
                    type="time"
                    value={draft.time.endTime}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        time: { ...current.time, endTime: event.target.value },
                      }))
                    }
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Tiếp tục
                </button>
              </div>
            </div>
          ) : null}

          {draft.step === 2 ? (
            <div className="space-y-4">
              <div className="text-sm font-extrabold text-teal-800">
                Chọn sản phẩm
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-gray-900">
                    Đã chọn: {draft.selectedBookIds.length} sản phẩm
                  </div>
                  <div className="text-xs text-gray-500">
                    Nhấn nút để mở trang tìm kiếm và thêm nhiều sản phẩm.
                  </div>
                </div>

                <Link
                  to="/admin/flash-sale/new/select"
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Chọn sản phẩm
                </Link>
              </div>

              {selectedBooks.length > 0 ? (
                <div className="space-y-2">
                  {selectedBooks.map((book) => (
                    <div
                      key={String(book.id)}
                      className="rounded-2xl border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="h-14 w-12 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                            {book.cover_image ? (
                              <img
                                src={book.cover_image}
                                alt={book.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-extrabold text-gray-900">
                              {book.title}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {book.author_name} • SKU: #{book.id}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveSelectedBook(String(book.id))
                          }
                          className="shrink-0 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Chưa chọn sản phẩm nào.
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                >
                  Tiếp tục
                </button>
              </div>
            </div>
          ) : null}

          {draft.step === 3 ? (
            <div className="space-y-4">
              <div className="text-sm font-extrabold text-teal-800">
                Thông số Flash Sale
              </div>

              {selectedBooks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Bạn chưa chọn sản phẩm.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedBooks.map((book) => {
                    const bookId = String(book.id);
                    const raw = draft.itemConfigByBookId[bookId];
                    const config: PriceDraft = {
                      flash_price: raw?.flash_price ?? "",
                      flash_stock: raw?.flash_stock ?? "0",
                      purchase_limit: raw?.purchase_limit ?? "2",
                      afterStatus: "restore",
                    };

                    const currentFlashPrice = Number(config.flash_price || 0);
                    const currentDiscount = getDiscountPercent(
                      book.selling_price,
                      currentFlashPrice,
                    );

                    return (
                      <div
                        key={bookId}
                        className="rounded-2xl border border-gray-200 bg-white p-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-16 w-14 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                            {book.cover_image ? (
                              <img
                                src={book.cover_image}
                                alt={book.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-extrabold text-gray-900">
                              {book.title}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {book.author_name} • SKU: #{book.id}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              Giá hiện tại: {formatCurrency(book.selling_price)}{" "}
                              • Kho: {book.total_stock} cuốn
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Giá Flash Sale (VND)
                            </div>
                            <input
                              inputMode="numeric"
                              value={config.flash_price}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  itemConfigByBookId: {
                                    ...current.itemConfigByBookId,
                                    [bookId]: {
                                      ...config,
                                      flash_price: event.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder="185000"
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                            />
                            {currentFlashPrice ? (
                              <div className="text-xs text-gray-500">
                                {currentDiscount
                                  ? `Giảm ${currentDiscount}% so với giá gốc`
                                  : ""}
                              </div>
                            ) : null}
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Số lượng khuyến mãi
                            </div>
                            <input
                              inputMode="numeric"
                              value={config.flash_stock}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  itemConfigByBookId: {
                                    ...current.itemConfigByBookId,
                                    [bookId]: {
                                      ...config,
                                      flash_stock: event.target.value,
                                    },
                                  },
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Giới hạn mua mỗi user
                            </div>
                            <input
                              inputMode="numeric"
                              value={config.purchase_limit}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  itemConfigByBookId: {
                                    ...current.itemConfigByBookId,
                                    [bookId]: {
                                      ...config,
                                      purchase_limit: event.target.value,
                                    },
                                  },
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Trạng thái sau Flash Sale
                            </div>
                            <select
                              value={config.afterStatus}
                              onChange={() => {
                                // only one option for now to match UI
                              }}
                              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                            >
                              <option value="restore">Trở về giá cũ</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  ← Quay lại bước 2
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="rounded-2xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                  >
                    Lưu nháp
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleActivate()}
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Kích hoạt chiến dịch
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
              Lịch trình
            </div>
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-gray-500">
                  Ngày bắt đầu
                </div>
                <div className="mt-1 text-sm font-extrabold text-gray-900">
                  {formatDateLabel(draft.time.date)}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                <div className="text-xs font-semibold text-gray-500">
                  Khung giờ
                </div>
                <div className="text-xs font-extrabold text-teal-800">
                  {draft.time.startTime || "—"} — {draft.time.endTime || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
