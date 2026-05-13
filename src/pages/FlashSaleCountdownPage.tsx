import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getReservationStatus,
} from "../services/flashSalePurchaseService";
import type { FlashSaleReservationStatus } from "../services/flashSalePurchaseService";

export default function FlashSaleCountdownPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<FlashSaleReservationStatus | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300); // Default 5 mins
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reservationId) {
      navigate("/");
      return;
    }

    const checkStatus = async () => {
      try {
        const data = await getReservationStatus(reservationId);
        setStatus(data);
        setTimeLeft(Math.max(0, data.remaining_seconds));
        setLoading(false);

        // If status is SUCCESS, redirect to orders
        if (data.status === "SUCCESS") {
          navigate("/account"); // Assuming there's an orders tab
        } else if (data.status === "EXPIRED" || data.status === "CANCELLED") {
          // Stay on page to show expired message
        } else if (data.status === "PENDING" && data.payment_url) {
          // If we somehow ended up here instead of going straight to payment url
          // Show the payment button below
        }
      } catch (error) {
        console.error("Lỗi khi lấy trạng thái reservation", error);
        navigate("/");
      }
    };

    checkStatus();
  }, [reservationId, navigate]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft <= 0 || !status || status.status !== "PENDING") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Update status to expired
          setStatus((s) => (s ? { ...s, status: "EXPIRED" } : s));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, status]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handlePayNow = () => {
    if (status?.payment_url) {
      window.location.href = status.payment_url;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center border-t-4 border-red-500">
        {status?.status === "EXPIRED" || status?.status === "CANCELLED" ? (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Đơn hàng đã hủy
            </h2>
            <p className="text-gray-600 mb-6">
              Bạn đã quá hạn thanh toán. Sản phẩm đã được trả lại kho Flash Sale.
            </p>
            <button
              onClick={() => navigate("/flash-sale")}
              className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 font-medium transition-colors"
            >
              Quay lại Flash Sale
            </button>
          </>
        ) : status?.status === "SUCCESS" ? (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Thanh toán thành công!
            </h2>
            <p className="text-gray-600 mb-6">
              Cảm ơn bạn đã mua hàng. Đơn hàng đang được xử lý.
            </p>
            <button
              onClick={() => navigate("/account")}
              className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 font-medium transition-colors"
            >
              Xem đơn hàng
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-orange-100 mb-4">
              <svg
                className="h-8 w-8 text-orange-600 animate-pulse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Giữ hàng thành công!
            </h2>
            <p className="text-gray-600 mb-6">
              Vui lòng hoàn tất thanh toán VNPay trong thời gian đếm ngược. Nếu
              hết hạn, sản phẩm sẽ được nhường cho người khác.
            </p>

            <div className="text-5xl font-mono font-bold text-red-600 tracking-wider mb-8">
              {formatTime(timeLeft)}
            </div>

            <button
              onClick={handlePayNow}
              className="w-full bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 font-medium transition-colors mb-3"
            >
              Tiếp tục đến VNPay
            </button>
            <button
              onClick={() => navigate("/flash-sale")}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              Từ bỏ lượt mua
            </button>
          </>
        )}
      </div>
    </div>
  );
}
