import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CreditCardOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  cancelFlashSaleReservation,
  getReservationStatus,
} from "../services/flashSalePurchaseService";
import type { FlashSaleReservationStatus } from "../services/flashSalePurchaseService";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";

export default function FlashSaleCountdownPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<FlashSaleReservationStatus | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300); // Default 5 mins
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

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

  const handleCancelReservation = async () => {
    if (!reservationId || status?.status !== "PENDING") {
      navigate("/flash-sale");
      return;
    }

    try {
      setCancelling(true);
      await cancelFlashSaleReservation(reservationId);
      setStatus((current) =>
        current ? { ...current, status: "CANCELLED", remaining_seconds: 0 } : current,
      );
      setTimeLeft(0);
      navigate("/flash-sale");
    } catch (error) {
      console.error("Lỗi khi hủy reservation", error);
      toast.error("Không hủy được lượt mua. Vui lòng thử lại trước khi rời trang.");
    } finally {
      setCancelling(false);
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center px-4 py-10 md:px-8">
        <section className="w-full overflow-hidden rounded-2xl border border-red-100 bg-white shadow-xl">
          <div className="grid lg:grid-cols-[0.9fr,1.1fr]">
            <div className="bg-linear-to-br from-red-600 via-orange-500 to-amber-400 p-8 text-white md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-white/25">
                <ThunderboltOutlined />
                Flash Sale
              </div>
              <h1 className="mt-5 text-3xl font-black uppercase tracking-wide md:text-4xl">
                Giữ chỗ thanh toán
              </h1>
              <p className="mt-3 max-w-md text-sm font-medium text-red-50">
                Suất Flash Sale đã được giữ tạm thời. Hoàn tất thanh toán trước khi đồng hồ kết thúc để xác nhận đơn hàng.
              </p>

              <div className="mt-8 rounded-2xl bg-white/15 p-5 text-center ring-1 ring-white/25">
                <div className="text-xs font-bold uppercase tracking-wide text-red-50">
                  Thời gian còn lại
                </div>
                <div className="mt-2 font-mono text-6xl font-black tracking-wider md:text-7xl">
                  {formatTime(timeLeft)}
                </div>
              </div>
            </div>

            <div className="p-6 md:p-8">
        {status?.status === "EXPIRED" || status?.status === "CANCELLED" ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl text-red-600">
              <CloseCircleOutlined />
            </div>
            <h2 className="mt-5 text-2xl font-black text-gray-900">
              Đơn hàng đã hủy
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Bạn đã quá hạn thanh toán. Sản phẩm đã được trả lại kho Flash Sale.
            </p>
            <button
              onClick={() => navigate("/flash-sale")}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700"
            >
              <ArrowLeftOutlined />
              Quay lại Flash Sale
            </button>
          </>
        ) : status?.status === "SUCCESS" ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">
              <CheckCircleOutlined />
            </div>
            <h2 className="mt-5 text-2xl font-black text-gray-900">
              Thanh toán thành công!
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Cảm ơn bạn đã mua hàng. Đơn hàng đang được xử lý.
            </p>
            <button
              onClick={() => navigate("/account")}
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-800"
            >
              Xem đơn hàng
            </button>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-3xl text-orange-600">
              <ClockCircleOutlined />
            </div>
            <h2 className="mt-5 text-2xl font-black text-gray-900">
              Giữ hàng thành công!
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Vui lòng hoàn tất thanh toán VNPay trong thời gian đếm ngược. Nếu
              hết hạn, sản phẩm sẽ được nhường cho người khác.
            </p>

            <div className="mt-6 rounded-2xl border border-orange-100 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-orange-600">
                  <CreditCardOutlined />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-gray-900">
                    Thanh toán qua VNPay
                  </div>
                  <div className="mt-1 text-xs leading-5 text-gray-600">
                    Sau khi thanh toán thành công, hệ thống sẽ tự xác nhận đơn Flash Sale của bạn.
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handlePayNow}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black uppercase text-white shadow-md shadow-red-100 transition hover:bg-red-700"
            >
              <CreditCardOutlined />
              Tiếp tục đến VNPay
            </button>
            <button
              onClick={() => void handleCancelReservation()}
              disabled={cancelling}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? "Đang hủy..." : "Từ bỏ lượt mua"}
            </button>
          </>
        )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
