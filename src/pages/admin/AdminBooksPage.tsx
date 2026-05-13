import { useEffect, useMemo, useState } from "react";
import { CloudUploadOutlined, LoadingOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import type { ApiBook } from "../../utils/apiMappers";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  createAdminBook,
  fetchAdminBooks,
  updateAdminBook,
} from "../../features/adminBooks/adminBooksSlice";
import { normalizeText } from "../../utils/textNormalize";
import axiosClient from "../../services/axiosClient";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

type BookDraft = {
  title: string;
  author_name: string;
  isbn: string;
  category_name: string;
  cover_image: string;
  selling_price: string;
  original_price: string;
  total_stock: string;
  description: string;
};

function getDefaultDraft(book?: ApiBook | null): BookDraft {
  return {
    title: book?.title ?? "",
    author_name: book?.author_name ?? "",
    isbn: "",
    category_name: book?.category_name ?? "",
    cover_image: book?.cover_image ?? "",
    selling_price: String(book?.selling_price ?? ""),
    original_price: String(book?.original_price ?? ""),
    total_stock: String(book?.total_stock ?? ""),
    description: book?.description ?? "",
  };
}

function clampNonNegativeInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

function parseDigitsOnly(raw: string): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

function formatVnThousands(raw: string): string {
  const digits = parseDigitsOnly(raw);
  if (!digits) return "";
  const numeric = Number(digits);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(numeric);
}

export default function AdminBooksPage() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const {
    items: books,
    loading,
    saving,
    error,
  } = useAppSelector((state) => state.adminBooks);

  const [query, setQuery] = useState(() => {
    return new URLSearchParams(location.search).get("q") ?? "";
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookDraft>(getDefaultDraft());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<BookDraft>(getDefaultDraft());
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    isEditMode: boolean
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      const formData = new FormData();
      formData.append("file", file);

      const response: any = await axiosClient.post("/upload/image", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const imageUrl = response?.result || response?.url;
      if (imageUrl) {
        if (isEditMode) {
          setDraft((prev) => ({ ...prev, cover_image: imageUrl }));
        } else {
          setCreateDraft((prev) => ({ ...prev, cover_image: imageUrl }));
        }
        toast.success("Tải ảnh lên thành công!");
      }
    } catch (error: any) {
      toast.error(error?.message || "Lỗi khi tải ảnh lên.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    void dispatch(fetchAdminBooks());
  }, [dispatch]);

  useEffect(() => {
    const next = new URLSearchParams(location.search).get("q") ?? "";
    if (next !== query) {
      setQuery(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return books;
    return books.filter((book) =>
      normalizeText(
        [
          book.title,
          book.author_name,
          book.category_name,
          String(book.id),
        ].join(" "),
      ).includes(q),
    );
  }, [books, query]);

  const editingBook = useMemo(
    () => (editingId ? (books.find((b) => b.id === editingId) ?? null) : null),
    [books, editingId],
  );

  const openEdit = (book: ApiBook) => {
    setEditingId(book.id);
    setDraft(getDefaultDraft(book));
  };

  const closeEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingBook) return;

    const payload: Record<string, unknown> = {
      title: draft.title.trim(),
      author_name: draft.author_name.trim(),
      category_name: draft.category_name.trim(),
      cover_image: draft.cover_image.trim(),
      ...(draft.isbn.trim() ? { isbn: draft.isbn.trim() } : null),
      selling_price: Number(draft.selling_price || 0),
      original_price: Number(draft.original_price || 0),
      total_stock: Number(draft.total_stock || 0),
      description: draft.description.trim(),
    };

    try {
      await dispatch(
        updateAdminBook({ bookId: editingBook.id, payload }),
      ).unwrap();
      toast.success("Đã lưu thay đổi sách.");
      closeEdit();
    } catch (error_) {
      toast.error(typeof error_ === "string" ? error_ : "Không lưu được sách.");
    }
  };

  const handleCreate = async () => {
    const payload: Record<string, unknown> = {
      title: createDraft.title.trim(),
      author_name: createDraft.author_name.trim(),
      category_name: createDraft.category_name.trim(),
      cover_image: createDraft.cover_image.trim(),
      ...(createDraft.isbn.trim() ? { isbn: createDraft.isbn.trim() } : null),
      selling_price: Number(createDraft.selling_price || 0),
      original_price: Number(createDraft.original_price || 0),
      total_stock: Number(createDraft.total_stock || 0),
      description: createDraft.description.trim(),
      sold_count: 0,
      rental_count: 0,
    };

    try {
      await dispatch(createAdminBook(payload)).unwrap();
      toast.success("Đã thêm sách mới vào kho.");
      setIsCreateOpen(false);
      setCreateDraft(getDefaultDraft());
    } catch (error_) {
      toast.error(
        typeof error_ === "string" ? error_ : "Không thêm được sách mới.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">Quản lý sách</h1>
          <p className="mt-1 text-sm text-gray-500">
            Xem và cập nhật thông tin sách như ở shop
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Thêm sách mới
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-500">
            {loading ? "Đang tải..." : `${filtered.length} sách`}
          </div>
          {query.trim() ? (
            <div className="text-xs font-semibold text-gray-400">
              Đang lọc theo:{" "}
              <span className="text-gray-600">{query.trim()}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-4 divide-y divide-gray-100">
          {filtered.map((book) => (
            <div
              key={book.id}
              className="grid gap-3 py-4 lg:grid-cols-[1.2fr,0.8fr,0.5fr,auto] lg:items-center"
            >
              <div className="flex gap-3">
                <img
                  src={book.cover_image}
                  alt={book.title}
                  className="h-20 w-14 rounded-lg border border-gray-100 object-cover"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <div
                    className="truncate text-base font-semibold text-teal-900"
                    title={book.title}
                  >
                    {book.title}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {book.author_name} • {book.category_name}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-700">
                    {formatCurrency(book.selling_price)}
                    <span className="ml-2 text-xs text-gray-400 line-through">
                      {formatCurrency(book.original_price)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm md:max-w-sm">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tồn kho
                  </div>
                  <div className="mt-1 font-bold text-gray-800">
                    {book.total_stock ?? 0}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Đã bán
                  </div>
                  <div className="mt-1 font-bold text-gray-800">
                    {book.sold_count ?? 0}
                  </div>
                </div>
              </div>

              <div className="flex justify-start lg:justify-end">
                <button
                  type="button"
                  onClick={() => openEdit(book)}
                  className="rounded-2xl border border-teal-200 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  Chỉnh sửa
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              Không có sách phù hợp.
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        title={<span className="font-bold text-teal-900">Chỉnh sửa sách</span>}
        open={Boolean(editingId)}
        onCancel={closeEdit}
        onOk={() => void handleSaveEdit()}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnClose
      >
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tên sách
              </div>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tác giả
              </div>
              <input
                value={draft.author_name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    author_name: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Thể loại
              </div>
              <input
                value={draft.category_name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category_name: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Ảnh bìa (URL)
                </div>
                <label className="cursor-pointer text-xs font-semibold text-teal-600 hover:text-teal-800">
                  {uploadingImage ? "Đang tải..." : "Tải ảnh lên"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => void handleImageUpload(e, true)}
                    disabled={uploadingImage}
                  />
                </label>
              </div>
              <input
                value={draft.cover_image}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cover_image: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Giá bán
              </div>
              <input
                inputMode="numeric"
                value={formatVnThousands(draft.selling_price)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    selling_price: parseDigitsOnly(event.target.value),
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Giá gốc
              </div>
              <input
                inputMode="numeric"
                value={formatVnThousands(draft.original_price)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    original_price: parseDigitsOnly(event.target.value),
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tồn kho
              </div>
              <input
                inputMode="numeric"
                value={draft.total_stock}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    total_stock: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Mô tả ngắn
            </div>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </label>
        </div>
      </Modal>

      <Modal
        title={
          <span className="font-bold text-teal-900">Thêm Sách Mới Vào Kho</span>
        }
        open={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        confirmLoading={saving}
        destroyOnClose
        width={880}
      >
        <div className="grid gap-6 md:grid-cols-[260px,1fr]">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Ảnh bìa sách
            </div>

            <label className="relative flex h-56 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-200 bg-gray-50 transition hover:bg-gray-100">
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => void handleImageUpload(e, false)}
                disabled={uploadingImage}
              />
              {uploadingImage ? (
                <div className="flex flex-col items-center justify-center text-teal-600">
                  <LoadingOutlined className="mb-2 text-3xl" />
                  <div className="text-sm font-semibold">Đang tải ảnh lên...</div>
                </div>
              ) : createDraft.cover_image.trim() ? (
                <img
                  src={createDraft.cover_image.trim()}
                  alt={createDraft.title || "Cover"}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="px-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                    <CloudUploadOutlined className="text-xl" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-gray-600">
                    Bấm chọn ảnh hoặc dán link ảnh
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Định dạng: JPG, PNG
                  </div>
                </div>
              )}
            </label>

            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Link ảnh bìa (URL)
              </div>
              <input
                value={createDraft.cover_image}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    cover_image: event.target.value,
                  }))
                }
                placeholder="https://..."
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Nhập chi tiết thông tin sách để cập nhật hệ thống
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tên tựa sách
                </div>
                <input
                  value={createDraft.title}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ví dụ: Chiến tranh và Hòa bình"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tác giả
                </div>
                <input
                  value={createDraft.author_name}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      author_name: event.target.value,
                    }))
                  }
                  placeholder="Leo Tolstoy"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mã ISBN
                </div>
                <input
                  value={createDraft.isbn}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      isbn: event.target.value,
                    }))
                  }
                  placeholder="978-..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Danh mục
                </div>
                <input
                  value={createDraft.category_name}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      category_name: event.target.value,
                    }))
                  }
                  list="admin-book-categories"
                  placeholder="Văn học cổ điển"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
                <datalist id="admin-book-categories">
                  {Array.from(
                    new Set(
                      books
                        .map((book) => String(book.category_name || "").trim())
                        .filter(Boolean),
                    ),
                  ).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>

              <label className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Giá bán (VND)
                </div>
                <input
                  inputMode="numeric"
                  value={createDraft.selling_price}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      selling_price: event.target.value,
                    }))
                  }
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Giá gốc (VND)
                </div>
                <input
                  inputMode="numeric"
                  value={createDraft.original_price}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      original_price: event.target.value,
                    }))
                  }
                  placeholder="0"
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </label>
            </div>

            <label className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Mô tả tóm tắt
              </div>
              <textarea
                rows={4}
                value={createDraft.description}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Nhập tóm tắt nội dung chính của sách..."
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:bg-white"
              />
            </label>

            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Số lượng tồn kho
                </div>
                <div className="text-xs text-gray-500">
                  Số lượng ban đầu khi nhập kho
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCreateDraft((current) => {
                      const next = Math.max(
                        0,
                        clampNonNegativeInt(current.total_stock, 0) - 1,
                      );
                      return { ...current, total_stock: String(next) };
                    })
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                  aria-label="Giảm số lượng tồn kho"
                >
                  -
                </button>

                <div className="min-w-10 text-center text-sm font-bold text-gray-900">
                  {clampNonNegativeInt(createDraft.total_stock, 0)}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCreateDraft((current) => {
                      const next =
                        clampNonNegativeInt(current.total_stock, 0) + 1;
                      return { ...current, total_stock: String(next) };
                    })
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition hover:bg-gray-50"
                  aria-label="Tăng số lượng tồn kho"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Lưu thông tin
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
