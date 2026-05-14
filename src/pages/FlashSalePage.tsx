import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ShoppingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type {
  FlashSaleActiveCampaign,
  FlashSaleActiveItem,
} from "../services/flashSalePurchaseService";
import {
  connectStockSSE,
  getActiveFlashSales,
  reserveFlashSale,
} from "../services/flashSalePurchaseService";
import { useAppSelector } from "../app/hooks";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import {
  formatShippingAddress,
  getDefaultShippingAddress,
} from "../utils/shippingAddress";

export default function FlashSalePage() {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.session);
  const savedAddresses = useAppSelector((state) => state.session.savedAddresses);
  const selectedAddressId = useAppSelector(
    (state) => state.session.selectedAddressId,
  );

  const [campaigns, setCampaigns] = useState<FlashSaleActiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<number | null>(null);

  const summary = useMemo(() => {
    const items = campaigns.flatMap((campaign) => campaign.items);
    return {
      itemCount: items.length,
      remaining: items.reduce(
        (sum, item) => sum + Number(item.remaining_stock || 0),
        0,
      ),
      sold: items.reduce((sum, item) => sum + Number(item.sold_quantity || 0), 0),
    };
  }, [campaigns]);

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        setLoading(true);
        const data = await getActiveFlashSales();
        setCampaigns(data);
      } catch (error) {
        console.error(error);
        toast.error("Không thể tải dữ liệu flash sale");
      } finally {
        setLoading(false);
      }
    };

    void fetchCampaigns();
  }, []);

  useEffect(() => {
    const sse = connectStockSSE((data) => {
      setCampaigns((prev) =>
        prev.map((campaign) => ({
          ...campaign,
          items: campaign.items.map((item) =>
            item.flash_sale_item_id === data.flash_sale_item_id
              ? {
                  ...item,
                  remaining_stock: data.remaining_stock,
                  sold_out: data.sold_out,
                }
              : item,
          ),
        })),
      );
    });

    return () => {
      sse.close();
    };
  }, []);

  const handleBuyClick = async (item: FlashSaleActiveItem) => {
    if (!user) {
      toast.warning("Vui lòng đăng nhập để mua hàng");
      navigate("/login");
      return;
    }

    const defaultAddress = getDefaultShippingAddress(
      savedAddresses,
      selectedAddressId,
    );
    if (!defaultAddress) {
      toast.warning(
        "Vui lòng nhập địa chỉ giao hàng mặc định trong hồ sơ để mua Flash Sale.",
      );
      navigate("/account");
      return;
    }

    try {
      setReservingId(item.flash_sale_item_id);
      const response = await reserveFlashSale(
        item.flash_sale_item_id,
        1,
        formatShippingAddress(defaultAddress),
      );

      toast.success(
        "Giữ chỗ thành công! Vui lòng thanh toán trong thời gian đếm ngược.",
      );
      navigate(`/flash-sale/countdown/${response.reservation_id}`);
    } catch (error: unknown) {
      console.error(error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || "Có lỗi xảy ra");
    } finally {
      setReservingId(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(price);
  };

  const calculateDiscount = (original: number, flash: number) => {
    if (!original || original <= 0) return 0;
    return Math.max(0, Math.round(((original - flash) / original) * 100));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-100 border-t-red-600" />
        </div>
        <Footer />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4 py-12">
          <section className="w-full rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-2xl text-red-600">
              <ThunderboltOutlined />
            </div>
            <h2 className="mt-5 text-2xl font-extrabold text-gray-900">
              Chưa có chương trình Flash Sale
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Các khung giờ ưu đãi mới sẽ được cập nhật tại đây. Bạn có thể tiếp tục khám phá sách trong lúc chờ.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
            >
              Tiếp tục mua sắm
            </Link>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 transition hover:text-teal-600"
        >
          <ArrowLeftOutlined />
          Quay về trang chủ
        </Link>

        <section className="mt-4 overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[1.35fr,0.65fr]">
            <div className="bg-linear-to-br from-red-600 via-orange-500 to-amber-400 px-6 py-8 text-white md:px-8 md:py-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-white/30">
                <ThunderboltOutlined />
                Khung giờ ưu đãi
              </div>
              <h1 className="mt-4 text-3xl font-black uppercase tracking-wide md:text-5xl">
                Flash Sale
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium text-red-50 md:text-base">
                Chọn nhanh sách đang giảm giá, hệ thống giữ chỗ trong thời gian đếm ngược và chuyển bạn sang thanh toán VNPay.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="rounded-xl bg-white/15 px-4 py-3 ring-1 ring-white/25">
                  <div className="text-2xl font-black">{summary.itemCount}</div>
                  <div className="text-xs font-semibold text-red-50">Sản phẩm</div>
                </div>
                <div className="rounded-xl bg-white/15 px-4 py-3 ring-1 ring-white/25">
                  <div className="text-2xl font-black">{summary.remaining}</div>
                  <div className="text-xs font-semibold text-red-50">Suất còn lại</div>
                </div>
                <div className="rounded-xl bg-white/15 px-4 py-3 ring-1 ring-white/25">
                  <div className="text-2xl font-black">{summary.sold}</div>
                  <div className="text-xs font-semibold text-red-50">Đã bán</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-3 bg-red-50 p-6 md:p-8">
              <div className="rounded-xl border border-red-100 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <FireOutlined />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-gray-900">
                      Mua nhanh 1 sản phẩm
                    </div>
                    <div className="text-xs text-gray-500">
                      Áp dụng theo giới hạn từng sách
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-red-100 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <ClockCircleOutlined />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-gray-900">
                      Giữ chỗ có thời hạn
                    </div>
                    <div className="text-xs text-gray-500">
                      Thanh toán trong trang đếm ngược
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {campaigns.map((campaign) => (
          <section key={campaign.campaign_id} className="mt-8">
            <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-red-600">
                  Đang diễn ra
                </div>
                <h2 className="mt-1 text-2xl font-extrabold text-gray-900">
                  {campaign.name}
                </h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-sm font-bold text-red-600 shadow-sm">
                <ClockCircleOutlined />
                Kết thúc: {new Date(campaign.ends_at).toLocaleString("vi-VN")}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {campaign.items.map((item) => {
                const discount = calculateDiscount(
                  item.original_price,
                  item.flash_sale_price,
                );
                const progress =
                  item.total_quantity > 0
                    ? (item.sold_quantity / item.total_quantity) * 100
                    : 0;
                const disabled =
                  item.sold_out ||
                  item.is_purchased ||
                  reservingId === item.flash_sale_item_id;

                return (
                  <article
                    key={item.flash_sale_item_id}
                    className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-red-100 hover:shadow-xl"
                  >
                    <div className="relative overflow-hidden bg-gray-100">
                      <div className="aspect-3/4">
                        <img
                          src={item.cover_image || "/placeholder.jpg"}
                          alt={item.book_title}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(event) => {
                            event.currentTarget.src =
                              "https://via.placeholder.com/300x400?text=No+Image";
                          }}
                        />
                      </div>
                      <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow">
                        <ThunderboltOutlined />
                        Flash
                      </div>
                      {discount > 0 ? (
                        <div className="absolute right-3 top-3 rounded-full bg-amber-300 px-2.5 py-1 text-xs font-black text-red-700 shadow">
                          -{discount}%
                        </div>
                      ) : null}
                      {item.sold_out ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <span className="rounded-full bg-white px-4 py-2 text-sm font-black uppercase text-red-600">
                            Hết hàng
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="p-4">
                      <h3 className="min-h-12 text-sm font-extrabold leading-6 text-gray-900 line-clamp-2">
                        {item.book_title}
                      </h3>

                      <div className="mt-3 flex items-end gap-2">
                        <span className="text-xl font-black text-red-600">
                          {formatPrice(item.flash_sale_price)}
                        </span>
                        {discount > 0 ? (
                          <span className="text-sm text-gray-400 line-through">
                            {formatPrice(item.original_price)}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4">
                        <div className="mb-2 flex justify-between text-xs font-semibold">
                          <span className="text-red-600">
                            Còn {item.remaining_stock} suất
                          </span>
                          <span className="text-gray-500">
                            Đã bán {item.sold_quantity}
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-linear-to-r from-red-600 to-orange-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs font-semibold text-gray-500">
                          Giới hạn {item.max_per_user} sản phẩm/người
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleBuyClick(item)}
                        disabled={disabled}
                        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black uppercase transition ${
                          item.sold_out || item.is_purchased
                            ? "cursor-not-allowed bg-gray-100 text-gray-400"
                            : "bg-red-600 text-white shadow-md shadow-red-100 hover:bg-red-700 hover:shadow-lg"
                        }`}
                      >
                        <ShoppingOutlined />
                        {reservingId === item.flash_sale_item_id
                          ? "Đang xử lý..."
                          : item.is_purchased
                            ? "Bạn đã mua"
                            : item.sold_out
                              ? "Hết hàng"
                              : "Mua ngay"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
