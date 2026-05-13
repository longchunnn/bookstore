import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import type {
  FlashSaleActiveCampaign,
  FlashSaleActiveItem,
} from "../services/flashSalePurchaseService";
import {
  getActiveFlashSales,
  reserveFlashSale,
  connectStockSSE,
} from "../services/flashSalePurchaseService";
import { useAppSelector } from "../app/hooks";

export default function FlashSalePage() {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.session);

  const [campaigns, setCampaigns] = useState<FlashSaleActiveCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<number | null>(null);

  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FlashSaleActiveItem | null>(null);
  const [address, setAddress] = useState((user as { address?: string })?.address || "");
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer for modal
  useEffect(() => {
    if (showAddressModal) {
      setCountdown(300);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            setShowAddressModal(false);
            toast.warning("Hết thời gian! Vui lòng thử lại.");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [showAddressModal]);

  const formatCountdown = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  // Load campaigns
  useEffect(() => {
    void fetchCampaigns();
  }, []);

  // SSE Realtime Stock Updates
  useEffect(() => {
    const sse = connectStockSSE((data) => {
      setCampaigns((prev) => {
        return prev.map((camp) => ({
          ...camp,
          items: camp.items.map((item) => {
            if (item.flash_sale_item_id === data.flash_sale_item_id) {
              return {
                ...item,
                remaining_stock: data.remaining_stock,
                sold_out: data.sold_out,
              };
            }
            return item;
          }),
        }));
      });
    });

    return () => {
      sse.close();
    };
  }, []);

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

  const handleBuyClick = (item: FlashSaleActiveItem) => {
    if (!user) {
      toast.warning("Vui lòng đăng nhập để mua hàng");
      navigate("/login");
      return;
    }
    setSelectedItem(item);
    setShowAddressModal(true);
  };

  const confirmPurchase = async () => {
    if (!selectedItem) return;
    if (!address.trim()) {
      toast.warning("Vui lòng nhập địa chỉ nhận hàng");
      return;
    }

    try {
      setReservingId(selectedItem.flash_sale_item_id);
      const response = await reserveFlashSale(
        selectedItem.flash_sale_item_id,
        1, // Default buy 1 quantity for flash sale
        address
      );

      toast.success("Giữ chỗ thành công! Đang chuyển hướng thanh toán...");
      setShowAddressModal(false);

      // Redirect to VNPay
      if (response.payment_url) {
        window.location.href = response.payment_url;
      } else {
        // Fallback to countdown page if no payment URL (should not happen)
        navigate(`/flash-sale/countdown/${response.reservation_id}`);
      }
    } catch (error: unknown) {
      console.error(error);
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || "Có lỗi xảy ra";
      toast.error(msg);
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
    return Math.round(((original - flash) / original) * 100);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <img
          src="https://cdn-icons-png.flaticon.com/512/743/743131.png"
          alt="No flash sale"
          className="w-32 h-32 mx-auto mb-4 opacity-50"
        />
        <h2 className="text-2xl font-bold text-gray-700">
          Chưa có chương trình Flash Sale nào
        </h2>
        <p className="text-gray-500 mt-2">Vui lòng quay lại sau nhé!</p>
        <Link
          to="/"
          className="mt-6 inline-block px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="mb-4">
          <Link to="/" className="inline-flex items-center text-red-600 hover:text-red-800 font-medium transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Quay về trang chủ
          </Link>
        </div>

        <div className="flex items-center mb-8 bg-linear-to-r from-red-600 to-orange-500 p-6 rounded-xl text-white shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 mr-4 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div>
            <h1 className="text-3xl font-bold uppercase italic tracking-wider">
              Flash Sale
            </h1>
            <p className="text-red-100 mt-1">
              Ưu đãi sách cực hot – nhanh tay trước khi hết hàng
            </p>
          </div>
        </div>

        {campaigns.map((campaign) => (
          <div key={campaign.campaign_id} className="mb-12">
            <div className="flex justify-between items-end mb-4 border-b-2 border-red-500 pb-2">
              <h2 className="text-2xl font-bold text-gray-800">
                {campaign.name}
              </h2>
              <div className="text-sm text-red-600 font-semibold bg-red-100 px-3 py-1 rounded-full">
                Kết thúc: {new Date(campaign.ends_at).toLocaleString("vi-VN")}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {campaign.items.map((item) => {
                const discount = calculateDiscount(
                  item.original_price,
                  item.flash_sale_price
                );
                const progress =
                  (item.sold_quantity / item.total_quantity) * 100;

                return (
                  <div
                    key={item.flash_sale_item_id}
                    className="bg-white rounded-lg shadow hover:shadow-xl transition-shadow duration-300 overflow-hidden relative border border-gray-100 group"
                  >
                    {/* Discount Badge */}
                    {discount > 0 && (
                      <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded z-10">
                        -{discount}%
                      </div>
                    )}

                    <div className="relative overflow-hidden aspect-3/4">
                      <img
                        src={item.cover_image || "/placeholder.jpg"}
                        alt={item.book_title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src =
                            "https://via.placeholder.com/300x400?text=No+Image";
                        }}
                      />
                      {item.sold_out && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
                          <img
                            src="https://cdn-icons-png.flaticon.com/512/10041/10041353.png"
                            alt="Sold out"
                            className="w-24 h-24 opacity-80"
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold text-gray-800 line-clamp-2 min-h-12 mb-2">
                        {item.book_title}
                      </h3>

                      <div className="flex items-baseline space-x-2 mb-3">
                        <span className="text-xl font-bold text-red-600">
                          {formatPrice(item.flash_sale_price)}
                        </span>
                        {discount > 0 && (
                          <span className="text-sm text-gray-400 line-through">
                            {formatPrice(item.original_price)}
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-red-500 font-medium flex items-center">
                            <span className="relative flex h-2 w-2 mr-1">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            Còn {item.remaining_stock}
                          </span>
                          <span className="text-gray-500">
                            Đã bán {item.sold_quantity}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          ></div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleBuyClick(item)}
                        disabled={
                          item.sold_out || item.is_purchased || reservingId === item.flash_sale_item_id
                        }
                        className={`w-full py-2.5 rounded font-bold transition-colors ${item.sold_out || item.is_purchased
                          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg"
                          }`}
                      >
                        {reservingId === item.flash_sale_item_id
                          ? "Đang xử lý..."
                          : item.is_purchased
                            ? "BẠN ĐÃ MUA"
                            : item.sold_out
                              ? "HẾT HÀNG"
                              : "MUA NGAY"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Address Modal */}
        {showAddressModal && selectedItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(249,115,22,0.14) 40%, rgba(255,255,255,0.55) 100%)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
            onClick={() => setShowAddressModal(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 25px 60px rgba(239,68,68,0.18), 0 8px 24px rgba(0,0,0,0.10)",
                border: "1px solid rgba(255,255,255,0.7)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with gradient */}
              <div
                className="px-6 py-4 flex items-center space-x-3"
                style={{
                  background: "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                }}
              >
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-white text-lg font-bold tracking-wide">Xác nhận mua</h3>
              </div>

              <div className="p-6">
                {/* Product info */}
                <div className="flex space-x-4 mb-6 pb-6 border-b border-gray-200/80">
                  <img
                    src={selectedItem.cover_image || "/placeholder.jpg"}
                    className="w-20 h-28 object-cover rounded-lg shadow-sm"
                    alt=""
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src =
                        "https://via.placeholder.com/300x400?text=No+Image";
                    }}
                  />
                  <div>
                    <h4 className="font-semibold text-gray-800 line-clamp-2">
                      {selectedItem.book_title}
                    </h4>
                    <p className="text-red-600 font-bold mt-1 text-lg">
                      {formatPrice(selectedItem.flash_sale_price)}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Giới hạn mua: {selectedItem.max_per_user} sản phẩm/người
                    </p>
                  </div>
                </div>

                {/* Address input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Địa chỉ nhận hàng (Bắt buộc)
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition-all bg-gray-50/60"
                    placeholder="Nhập địa chỉ nhận hàng của bạn..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  ></textarea>
                </div>

                {/* Info note */}
                <div
                  className="p-3 rounded-lg text-sm mb-6 flex items-start"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,237,213,0.7) 0%, rgba(254,243,199,0.7) 100%)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 shrink-0 text-orange-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-orange-800">
                    Sau khi nhấn xác nhận, bạn sẽ được chuyển đến VNPay để thanh toán.
                    <strong
                      className="block mt-1 text-base"
                      style={{ color: countdown <= 60 ? '#dc2626' : countdown <= 120 ? '#ea580c' : '#9a3412' }}
                    >
                      ⏳ Thời gian còn lại: {formatCountdown(countdown)}
                    </strong>
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowAddressModal(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                    disabled={reservingId !== null}
                  >
                    Hủy
                  </button>
                  <button
                    onClick={confirmPurchase}
                    disabled={reservingId !== null || !address.trim()}
                    className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center transition-all"
                    style={{
                      background: reservingId !== null || !address.trim()
                        ? "#f87171"
                        : "linear-gradient(135deg, #ef4444 0%, #f97316 100%)",
                      boxShadow: reservingId !== null || !address.trim()
                        ? "none"
                        : "0 4px 14px rgba(239,68,68,0.35)",
                    }}
                  >
                    {reservingId !== null ? (
                      <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
                    ) : (
                      "Xác nhận & Thanh toán"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
