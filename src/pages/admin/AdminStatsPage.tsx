import { useEffect, useMemo, useState } from "react";
import { Segmented } from "antd";
import {
  CarOutlined,
  DollarOutlined,
  RightOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import type { ApiBook, ApiOrder, ApiUser } from "../../utils/apiMappers";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { fetchAdminOrders } from "../../features/adminStats/adminStatsSlice";
import { getBooks } from "../../services/booksService";
import { getUserById } from "../../services/usersService";

type ChartMetric = "revenue" | "orders";

type MonthPoint = {
  label: string;
  revenue: number;
  orderCount: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isApprovedByStaff(order: ApiOrder): boolean {
  const normalized = String(order.order_status || "")
    .trim()
    .toLowerCase();
  return normalized !== "cho duyet";
}

function isSameYearMonth(
  date: Date,
  year: number,
  monthIndex: number,
): boolean {
  return date.getFullYear() === year && date.getMonth() === monthIndex;
}

function isShippingOrder(order: ApiOrder): boolean {
  const normalized = String(order.order_status || "")
    .trim()
    .toLowerCase();
  return (
    normalized.includes("dang giao") ||
    normalized.includes("van chuyen") ||
    normalized.includes("shipping")
  );
}

function getInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

function buildChartPaths(points: number[], width: number, height: number) {
  const paddingX = 18;
  const paddingY = 16;
  const innerW = Math.max(1, width - paddingX * 2);
  const innerH = Math.max(1, height - paddingY * 2);

  const max = points.reduce((m, v) => Math.max(m, v), 0);
  const safeMax = max <= 0 ? 1 : max;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((value, index) => {
    const x = paddingX + index * step;
    const y = paddingY + (1 - value / safeMax) * innerH;
    return { x, y };
  });

  const line = coords
    .map(
      (c, idx) =>
        `${idx === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    )
    .join(" ");

  const area =
    coords.length > 0
      ? `${line} L ${(paddingX + (points.length - 1) * step).toFixed(2)} ${(paddingY + innerH).toFixed(2)} L ${paddingX.toFixed(2)} ${(paddingY + innerH).toFixed(2)} Z`
      : "";

  return { line, area };
}

export default function AdminStatsPage() {
  const dispatch = useAppDispatch();
  const { orders, loading, error } = useAppSelector(
    (state) => state.adminStats,
  );

  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [books, setBooks] = useState<ApiBook[]>([]);
  const [userById, setUserById] = useState<Record<string, ApiUser>>({});

  useEffect(() => {
    void dispatch(fetchAdminOrders());
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await getBooks();
        if (cancelled) return;
        setBooks(Array.isArray(response) ? response : []);
      } catch {
        if (cancelled) return;
        setBooks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const approvedOrders = useMemo(
    () => orders.filter((order) => isApprovedByStaff(order)),
    [orders],
  );

  const booksById = useMemo(() => {
    const map = new Map<string, ApiBook>();
    books.forEach((book) => map.set(String(book.id), book));
    return map;
  }, [books]);

  const ordersSortedByDate = useMemo(() => {
    const copy = [...orders];
    copy.sort((a, b) => {
      const ad = new Date(a.order_date).getTime();
      const bd = new Date(b.order_date).getTime();
      if (!Number.isNaN(bd) && !Number.isNaN(ad) && bd !== ad) return bd - ad;
      return String(b.id).localeCompare(String(a.id));
    });
    return copy;
  }, [orders]);

  const todayApprovedOrders = useMemo(() => {
    const today = new Date();
    return approvedOrders.filter((order) => {
      const orderDate = new Date(order.order_date);
      return (
        !Number.isNaN(orderDate.getTime()) && isSameLocalDate(orderDate, today)
      );
    });
  }, [approvedOrders]);

  const shippingOrdersCount = useMemo(
    () => approvedOrders.filter((order) => isShippingOrder(order)).length,
    [approvedOrders],
  );

  const monthSeries = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    const months: Array<{ year: number; monthIndex: number; label: string }> =
      [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        label: `TH${d.getMonth() + 1}`,
      });
    }

    return months.map((m) => {
      let revenue = 0;
      let orderCount = 0;

      for (const order of approvedOrders) {
        const d = new Date(order.order_date);
        if (Number.isNaN(d.getTime())) continue;
        if (!isSameYearMonth(d, m.year, m.monthIndex)) continue;
        revenue += Number(order.total_amount || 0);
        orderCount += 1;
      }

      return { label: m.label, revenue, orderCount };
    });
  }, [approvedOrders]);

  const thisMonthRevenue = useMemo(
    () =>
      monthSeries.length > 0 ? monthSeries[monthSeries.length - 1].revenue : 0,
    [monthSeries],
  );

  const thisMonthApprovedOrders = useMemo(() => {
    const now = new Date();
    return approvedOrders.filter((order) => {
      const d = new Date(order.order_date);
      if (Number.isNaN(d.getTime())) return false;
      return isSameYearMonth(d, now.getFullYear(), now.getMonth());
    });
  }, [approvedOrders]);

  const recentOrders = useMemo(
    () => ordersSortedByDate.slice(0, 5),
    [ordersSortedByDate],
  );

  const topBooksThisMonth = useMemo(() => {
    const totals = new Map<
      string,
      { bookId: string; title: string; quantity: number }
    >();

    for (const order of thisMonthApprovedOrders) {
      for (const item of order.items) {
        const bookId = String(item.book_item_id || "");
        const key = bookId || item.title;
        const current = totals.get(key) ?? {
          bookId,
          title: item.title,
          quantity: 0,
        };
        current.quantity += Number(item.quantity || 0);
        totals.set(key, current);
      }
    }

    return Array.from(totals.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [thisMonthApprovedOrders]);

  const topCustomersThisMonth = useMemo(() => {
    const totals = new Map<
      string,
      { userId: string; total: number; orders: number }
    >();

    for (const order of thisMonthApprovedOrders) {
      const userId = String(order.user_id || "");
      if (!userId) continue;
      const current = totals.get(userId) ?? { userId, total: 0, orders: 0 };
      current.total += Number(order.total_amount || 0);
      current.orders += 1;
      totals.set(userId, current);
    }

    return Array.from(totals.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [thisMonthApprovedOrders]);

  useEffect(() => {
    const ids = new Set<string>();
    recentOrders.forEach((order) => {
      if (order.user_id) ids.add(String(order.user_id));
    });
    topCustomersThisMonth.forEach((entry) => ids.add(String(entry.userId)));

    const missing = Array.from(ids).filter((id) => id && !userById[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        missing.map(async (id) => {
          try {
            const user = await getUserById(id);
            return user ? ([id, user] as const) : null;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const next: Record<string, ApiUser> = {};
      pairs.forEach((pair) => {
        if (!pair) return;
        next[pair[0]] = pair[1];
      });
      if (Object.keys(next).length === 0) return;
      setUserById((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
  }, [recentOrders, topCustomersThisMonth, userById]);

  const primarySeries = useMemo(() => {
    const values = monthSeries.map((p) =>
      chartMetric === "revenue" ? p.revenue : p.orderCount,
    );
    return values;
  }, [chartMetric, monthSeries]);

  const secondarySeries = useMemo(() => {
    const values = monthSeries.map((p) =>
      chartMetric === "revenue" ? p.orderCount : p.revenue,
    );
    return values;
  }, [chartMetric, monthSeries]);

  const primaryPaths = useMemo(
    () => buildChartPaths(primarySeries, 760, 240),
    [primarySeries],
  );
  const secondaryPaths = useMemo(
    () => buildChartPaths(secondarySeries, 760, 240),
    [secondarySeries],
  );

  const statusBadge = (status: string) => {
    const normalized = String(status || "")
      .trim()
      .toLowerCase();
    if (
      normalized.includes("da thanh toan") ||
      normalized.includes("thanh toan")
    ) {
      return "bg-teal-50 text-teal-800 ring-1 ring-teal-200";
    }
    if (normalized.includes("dang giao") || normalized.includes("van chuyen")) {
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    }
    if (normalized.includes("cho") || normalized.includes("xu ly")) {
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    }
    if (normalized.includes("huy") || normalized.includes("cancel")) {
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    }
    return "bg-gray-50 text-gray-700 ring-1 ring-gray-200";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-teal-900">Thống kê</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
                Doanh thu tháng này
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {formatCurrency(thisMonthRevenue)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-700 ring-1 ring-amber-100">
              <DollarOutlined />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
                Đơn hàng hôm nay
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {todayApprovedOrders.length}
              </p>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-700 ring-1 ring-indigo-100">
              <ShoppingCartOutlined />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">
                Đang vận chuyển
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {shippingOrdersCount}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-700 ring-1 ring-amber-100">
              <CarOutlined />
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Biểu đồ Doanh thu theo tháng
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Theo dõi doanh thu và số lượng đơn hàng trong 6 tháng qua.
            </p>
          </div>

          <Segmented
            value={chartMetric}
            onChange={(value) => setChartMetric(value as ChartMetric)}
            options={[
              { label: "Doanh thu", value: "revenue" },
              { label: "Số lượng", value: "orders" },
            ]}
          />
        </div>

        {monthSeries.every((p) => p.revenue === 0 && p.orderCount === 0) ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
            Chưa có dữ liệu trong 6 tháng gần đây.
          </div>
        ) : (
          <div className="mt-4">
            <div className="w-full overflow-hidden rounded-xl border border-gray-100 bg-white">
              <svg
                viewBox="0 0 760 240"
                className="h-56 w-full"
                role="img"
                aria-label="Biểu đồ doanh thu theo tháng"
              >
                <defs>
                  <linearGradient id="statsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fdba74" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <line
                  x1="18"
                  y1="224"
                  x2="742"
                  y2="224"
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />

                {primaryPaths.area ? (
                  <path d={primaryPaths.area} fill="url(#statsArea)" />
                ) : null}

                {secondaryPaths.line ? (
                  <path
                    d={secondaryPaths.line}
                    fill="none"
                    stroke="#111827"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    opacity="0.7"
                  />
                ) : null}

                {primaryPaths.line ? (
                  <path
                    d={primaryPaths.line}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="3"
                  />
                ) : null}
              </svg>
            </div>

            <div className="mt-2 flex items-center justify-between px-2 text-[11px] font-semibold text-gray-500">
              {monthSeries.map((p) => (
                <span key={p.label} className="w-full text-center">
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-bold text-gray-900">
              Đơn hàng gần đây
            </h2>
          </div>

          <div className="px-5 py-4">
            {loading ? (
              <div className="text-sm text-gray-500">Đang tải dữ liệu...</div>
            ) : recentOrders.length === 0 ? (
              <div className="text-sm text-gray-500">Chưa có đơn hàng.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <div className="grid grid-cols-[120px_1fr_130px_140px] gap-3 bg-gray-50 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                  <div>Mã đơn</div>
                  <div>Khách hàng</div>
                  <div>Trạng thái</div>
                  <div className="text-right">Tổng tiền</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {recentOrders.map((order) => {
                    const user = userById[String(order.user_id)];
                    const customerName =
                      user?.full_name || `User #${order.user_id}`;
                    return (
                      <div
                        key={order.id}
                        className="grid grid-cols-[120px_1fr_130px_140px] items-center gap-3 px-4 py-3 text-sm"
                      >
                        <div className="font-semibold text-teal-800">
                          ##{order.id}
                        </div>
                        <div
                          className="truncate text-gray-800"
                          title={customerName}
                        >
                          {customerName}
                        </div>
                        <div>
                          <span
                            className={[
                              "inline-flex rounded-full px-2 py-1 text-[11px] font-bold",
                              statusBadge(order.order_status),
                            ].join(" ")}
                          >
                            {order.order_status || "-"}
                          </span>
                        </div>
                        <div className="text-right font-semibold text-gray-900">
                          {formatCurrency(Number(order.total_amount || 0))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-bold text-gray-900">
              Top Sách Bán Chạy
            </h2>
          </div>
          <div className="px-5 py-4">
            {topBooksThisMonth.length === 0 ? (
              <div className="text-sm text-gray-500">
                Chưa có dữ liệu tháng này.
              </div>
            ) : (
              <div className="space-y-3">
                {topBooksThisMonth.map((entry) => {
                  const book = entry.bookId
                    ? booksById.get(entry.bookId)
                    : undefined;
                  const title = book?.title || entry.title;
                  const category = book?.category_name || "-";
                  const cover =
                    book?.cover_image ||
                    "https://picsum.photos/200/280?grayscale";
                  return (
                    <div
                      key={entry.bookId || entry.title}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                          <img
                            src={cover}
                            alt={title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0">
                          <div
                            className="truncate text-sm font-semibold text-gray-900"
                            title={title}
                          >
                            {title}
                          </div>
                          <div className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">
                            {category}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <span>{entry.quantity} bán</span>
                        <RightOutlined className="text-gray-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">
            Top Khách Hàng của Tháng
          </h2>
        </div>

        <div className="px-5 py-4">
          {topCustomersThisMonth.length === 0 ? (
            <div className="text-sm text-gray-500">
              Chưa có dữ liệu tháng này.
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {topCustomersThisMonth.map((entry) => {
                const user = userById[String(entry.userId)];
                const name = user?.full_name || `User #${entry.userId}`;
                return (
                  <div
                    key={entry.userId}
                    className="min-w-60 rounded-2xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-extrabold text-teal-800 ring-1 ring-teal-100">
                        {getInitials(name)}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm font-bold text-gray-900"
                          title={name}
                        >
                          {name}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {entry.orders} đơn hàng
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-sm font-extrabold text-amber-800">
                      {formatCurrency(entry.total)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
