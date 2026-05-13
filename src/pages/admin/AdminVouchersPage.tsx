import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Table } from "antd";
import { toast } from "react-toastify";
import type { ApiVoucher } from "../../services/vouchersService";
import { isExpired } from "../../utils/promotionExpiry";
import {
  getCategories,
  type ApiCategory,
} from "../../services/categoriesService";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import {
  createAdminVoucher,
  fetchAdminVoucherDetail,
  fetchAdminVouchers,
  updateAdminVoucher,
} from "../../features/adminVouchers/adminVouchersSlice";

type VoucherDraft = {
  title: string;
  description: string;
  code: string;
  discountPercent: string;
  minOrderValue: string;
  maxDiscountAmount: string;
  usageLimit: string;
  startDate: string;
  endDate: string;
  appliesToCategories: string[];
};

function formatThousandsInput(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("vi-VN");
}

function parseThousandsInput(raw: string): number {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

function normalizePercentInput(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const value = Number(digits);
  if (!Number.isFinite(value)) return "";
  return String(Math.min(Math.max(value, 0), 100));
}

function normalizeVoucherCodeInput(raw: string): string {
  return String(raw ?? "").toUpperCase();
}

function parseDateTimeLocal(value: string): number | null {
  const safe = String(value ?? "").trim();
  if (!safe) return null;
  const parsed = Date.parse(safe);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEndAfterStart(start: string, end: string): boolean {
  const startMs = parseDateTimeLocal(start);
  const endMs = parseDateTimeLocal(end);
  if (startMs === null || endMs === null) return true;
  return endMs > startMs;
}

function toDatetimeLocalValue(value?: string): string {
  const safe = String(value ?? "").trim();
  if (!safe) return "";

  // ISO/LocalDateTime: 2026-04-24T09:00:00 -> 2026-04-24T09:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(safe)) {
    return safe.slice(0, 16);
  }

  // datetime-local already
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(safe)) return safe;
  return "";
}

function getDefaultDraft(voucher?: ApiVoucher | null): VoucherDraft {
  const categoriesFromApi = voucher?.applicableCategories;

  return {
    title: voucher?.title ?? "",
    description: voucher?.description ?? "",
    code: normalizeVoucherCodeInput(voucher?.code ?? ""),
    discountPercent: String(voucher?.discountPercent ?? ""),
    minOrderValue:
      voucher?.minOrderValue !== undefined && voucher?.minOrderValue !== null
        ? Number(voucher.minOrderValue).toLocaleString("vi-VN")
        : "",
    maxDiscountAmount:
      voucher?.maxDiscountAmount !== undefined &&
      voucher?.maxDiscountAmount !== null
        ? Number(voucher.maxDiscountAmount).toLocaleString("vi-VN")
        : "",
    usageLimit:
      voucher?.usageLimit !== undefined && voucher?.usageLimit !== null
        ? String(voucher.usageLimit)
        : "",
    startDate: toDatetimeLocalValue(voucher?.startDate),
    endDate: toDatetimeLocalValue(voucher?.endDate),
    appliesToCategories: Array.isArray(categoriesFromApi)
      ? categoriesFromApi
      : ["ALL"],
  };
}

function normalizeLocalDateTimeInput(value: string): string | null {
  const safe = String(value ?? "").trim();
  if (!safe) return null;
  // Support common inputs:
  // - "2026-04-24T09:00" (datetime-local)
  // - "2026-04-24T09:00:00" (LocalDateTime)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(safe)) return `${safe}:00`;
  return safe;
}

function validateCreateDraft(draft: VoucherDraft): string | null {
  if (!draft.title.trim()) return "Vui lòng nhập tiêu đề voucher.";
  if (!draft.description.trim()) return "Vui lòng nhập mô tả voucher.";
  if (!draft.code.trim()) return "Vui lòng nhập code voucher.";
  if (!draft.discountPercent.trim()) return "Vui lòng nhập % giảm.";
  if (!draft.minOrderValue.trim()) return "Vui lòng nhập giá trị tối thiểu.";
  if (!draft.maxDiscountAmount.trim()) return "Vui lòng nhập giảm tối đa.";
  if (!draft.usageLimit.trim()) return "Vui lòng nhập số lượng voucher.";
  if (!draft.startDate.trim()) return "Vui lòng chọn thời gian bắt đầu.";
  if (!draft.endDate.trim()) return "Vui lòng chọn thời gian kết thúc.";

  const selectedCategories = Array.isArray(draft.appliesToCategories)
    ? draft.appliesToCategories.filter((item) => String(item).trim())
    : [];

  if (!selectedCategories.length) {
    return "Vui lòng chọn ít nhất một thể loại áp dụng.";
  }

  return null;
}

export default function AdminVouchersPage() {
  const dispatch = useAppDispatch();
  const { items, loading, saving, error } = useAppSelector(
    (state) => state.adminVouchers,
  );

  const requestedDetailsRef = useRef<Set<string>>(new Set());

  const [categories, setCategories] = useState<ApiCategory[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VoucherDraft>(getDefaultDraft());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] =
    useState<VoucherDraft>(getDefaultDraft());

  useEffect(() => {
    void dispatch(fetchAdminVouchers());
  }, [dispatch]);

  useEffect(() => {
    // Hydrate missing fields (list endpoint may return limited PromotionResponse).
    for (const voucher of items) {
      const id = String(voucher.promotionId ?? "").trim();
      if (!id) continue;
      if (requestedDetailsRef.current.has(id)) continue;

      const needsDetail =
        voucher.minOrderValue === undefined ||
        voucher.usageLimit === undefined ||
        voucher.usedCount === undefined ||
        voucher.maxDiscountAmount === undefined ||
        voucher.applicableCategories === undefined;

      if (!needsDetail) continue;
      requestedDetailsRef.current.add(id);
      void dispatch(fetchAdminVoucherDetail(id));
    }
  }, [dispatch, items]);

  useEffect(() => {
    let alive = true;
    getCategories()
      .then((result) => {
        if (!alive) return;
        setCategories(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!alive) return;
        setCategories([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visibleItems = useMemo(() => {
    const nowMs = Date.now();
    return items.filter((voucher) => !isExpired(voucher.endDate, nowMs));
  }, [items]);

  const editingVoucher = useMemo(
    () =>
      editingId
        ? (items.find((v) => v.promotionId === editingId) ?? null)
        : null,
    [items, editingId],
  );

  const openEdit = (voucher: ApiVoucher) => {
    setEditingId(voucher.promotionId);
    setDraft(getDefaultDraft(voucher));
  };

  const closeEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingVoucher) return;

    if (!isEndAfterStart(draft.startDate, draft.endDate)) {
      toast.error("Ngày kết thúc phải sau ngày bắt đầu.");
      return;
    }

    try {
      await dispatch(
        updateAdminVoucher({
          voucherId: editingVoucher.promotionId,
          payload: {
            title: draft.title.trim(),
            description: draft.description.trim(),
            code: draft.code.trim().toUpperCase(),
            discount_percent: Number(draft.discountPercent || 0),
            min_order_value: parseThousandsInput(draft.minOrderValue),
            max_discount_amount: parseThousandsInput(draft.maxDiscountAmount),
            usage_limit: Number(draft.usageLimit || 0),
            applicable_categories:
              Array.isArray(draft.appliesToCategories) &&
              draft.appliesToCategories.length
                ? draft.appliesToCategories
                : ["ALL"],
            status: 1,
            start_date: normalizeLocalDateTimeInput(draft.startDate),
            end_date: normalizeLocalDateTimeInput(draft.endDate),
          },
        }),
      ).unwrap();

      closeEdit();
    } catch (error_) {
      toast.error(
        typeof error_ === "string" ? error_ : "Không lưu được mã giảm giá.",
      );
    }
  };

  const handleCreate = async () => {
    try {
      const validationError = validateCreateDraft(createDraft);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      if (!isEndAfterStart(createDraft.startDate, createDraft.endDate)) {
        toast.error("Ngày kết thúc phải sau ngày bắt đầu.");
        return;
      }

      await dispatch(
        createAdminVoucher({
          title: createDraft.title.trim(),
          description: createDraft.description.trim(),
          code: createDraft.code.trim().toUpperCase(),
          discount_percent: Number(createDraft.discountPercent || 0),
          min_order_value: parseThousandsInput(createDraft.minOrderValue),
          max_discount_amount: parseThousandsInput(
            createDraft.maxDiscountAmount,
          ),
          usage_limit: Number(createDraft.usageLimit || 0),
          applicable_categories:
            Array.isArray(createDraft.appliesToCategories) &&
            createDraft.appliesToCategories.length
              ? createDraft.appliesToCategories
              : ["ALL"],
          status: 1,
          start_date: normalizeLocalDateTimeInput(createDraft.startDate),
          end_date: normalizeLocalDateTimeInput(createDraft.endDate),
        }),
      ).unwrap();

      setIsCreateOpen(false);
      setCreateDraft(getDefaultDraft());
    } catch (error_) {
      toast.error(
        typeof error_ === "string" ? error_ : "Không tạo được mã giảm giá.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-teal-900">
            Quản lý mã giảm giá
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Thêm và chỉnh sửa voucher đang áp dụng
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
        >
          Thêm mã mới
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
            {loading ? "Đang tải..." : `${visibleItems.length} mã`}
          </div>
        </div>

        <Table
          className="mt-4"
          rowKey={(record) => record.promotionId}
          loading={loading}
          dataSource={visibleItems}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: "Code",
              dataIndex: "code",
              key: "code",
              width: 160,
            },
            {
              title: "% giảm",
              dataIndex: "discountPercent",
              key: "discountPercent",
              width: 120,
            },
            {
              title: "Tối thiểu",
              dataIndex: "minOrderValue",
              key: "minOrderValue",
              width: 140,
              render: (value: unknown) => {
                const numeric =
                  typeof value === "number" ? value : Number(value);
                if (!Number.isFinite(numeric)) return "-";
                return numeric.toLocaleString("vi-VN");
              },
            },
            {
              title: "Thể loại áp dụng",
              dataIndex: "applicableCategories",
              key: "applicableCategories",
              render: (value: unknown) => {
                const list = Array.isArray(value)
                  ? (value as unknown[])
                      .map((item) => String(item))
                      .filter(Boolean)
                  : [];
                if (!list.length || list.includes("ALL")) return "Tất cả";
                return list.join(", ");
              },
            },
            {
              title: "Còn lại",
              key: "remaining",
              width: 120,
              render: (_: unknown, record: ApiVoucher) => {
                if (
                  record.usageLimit === undefined ||
                  record.usedCount === undefined
                ) {
                  return "-";
                }

                const usageLimit = Number(record.usageLimit || 0);
                const usedCount = Number(record.usedCount || 0);
                return Math.max(usageLimit - usedCount, 0);
              },
            },
            {
              title: "Hành động",
              key: "actions",
              width: 140,
              render: (_: unknown, record: ApiVoucher) => (
                <button
                  type="button"
                  onClick={() => openEdit(record)}
                  className="rounded-xl border border-teal-200 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
                >
                  Chỉnh sửa
                </button>
              ),
            },
          ]}
        />
      </div>

      <Modal
        title={<span className="font-bold text-teal-900">Chỉnh sửa mã</span>}
        open={Boolean(editingId)}
        onCancel={closeEdit}
        onOk={() => void handleSaveEdit()}
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnClose
      >
        <VoucherForm
          draft={draft}
          onChange={setDraft}
          categories={categories}
        />
      </Modal>

      <Modal
        title={<span className="font-bold text-teal-900">Thêm mã mới</span>}
        open={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        onOk={() => void handleCreate()}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={saving}
        destroyOnClose
      >
        <VoucherForm
          draft={createDraft}
          onChange={setCreateDraft}
          categories={categories}
        />
      </Modal>
    </div>
  );
}

function VoucherForm({
  draft,
  onChange,
  categories,
}: {
  draft: VoucherDraft;
  onChange: (
    next: VoucherDraft | ((prev: VoucherDraft) => VoucherDraft),
  ) => void;
  categories: ApiCategory[];
}) {
  const categoryNames = useMemo(() => {
    const names = categories
      .map((category) => category.name)
      .map((name) => String(name).trim())
      .filter(Boolean);
    const unique = Array.from(new Set(names));
    unique.sort((a, b) => a.localeCompare(b, "vi-VN"));
    return unique;
  }, [categories]);

  const selectedCategories = Array.isArray(draft.appliesToCategories)
    ? draft.appliesToCategories
    : [];

  const toggleCategory = (name: string) => {
    onChange((prev) => {
      const current = Array.isArray(prev.appliesToCategories)
        ? prev.appliesToCategories
        : [];

      if (name === "ALL") {
        // allow unchecking ALL so user can pick specific categories
        return current.includes("ALL")
          ? { ...prev, appliesToCategories: [] }
          : { ...prev, appliesToCategories: ["ALL"] };
      }

      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current.filter((item) => item !== "ALL"), name];

      return { ...prev, appliesToCategories: next.length ? next : ["ALL"] };
    });
  };

  return (
    <div className="space-y-3">
      <label className="space-y-1">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
          Tiêu đề
        </div>
        <input
          required
          value={draft.title}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, title: event.target.value }))
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
        />
      </label>

      <label className="space-y-1">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
          Mô tả
        </div>
        <input
          required
          value={draft.description}
          onChange={(event) =>
            onChange((prev) => ({ ...prev, description: event.target.value }))
          }
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Giá trị tối thiểu
          </div>
          <input
            required
            inputMode="numeric"
            type="text"
            value={draft.minOrderValue}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                minOrderValue: formatThousandsInput(event.target.value),
              }))
            }
            placeholder="30.000"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Giảm tối đa
          </div>
          <input
            required
            inputMode="numeric"
            type="text"
            value={draft.maxDiscountAmount}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                maxDiscountAmount: formatThousandsInput(event.target.value),
              }))
            }
            placeholder="30.000"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Số lượng
          </div>
          <input
            required
            inputMode="numeric"
            value={draft.usageLimit}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, usageLimit: event.target.value }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <div />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Bắt đầu
          </div>
          <input
            required
            type="datetime-local"
            value={draft.startDate}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, startDate: event.target.value }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Kết thúc
          </div>
          <input
            required
            type="datetime-local"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(event) =>
              onChange((prev) => ({ ...prev, endDate: event.target.value }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
          Thể loại áp dụng
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selectedCategories.includes("ALL")}
              onChange={() => toggleCategory("ALL")}
            />
            <span>Tất cả</span>
          </label>
          {categoryNames.map((name) => (
            <label
              key={name}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(name)}
                onChange={() => toggleCategory(name)}
              />
              <span>{name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            Code
          </div>
          <input
            required
            value={draft.code}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                code: normalizeVoucherCodeInput(event.target.value),
              }))
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <label className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-700">
            % giảm
          </div>
          <input
            required
            inputMode="numeric"
            type="text"
            value={draft.discountPercent}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                discountPercent: normalizePercentInput(event.target.value),
              }))
            }
            placeholder="10"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <div />
      </div>
    </div>
  );
}
