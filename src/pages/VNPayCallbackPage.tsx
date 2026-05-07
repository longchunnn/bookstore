import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  clearCheckoutSession,
  removeCartItems,
} from "../features/cart/cartSlice";

export default function VNPayCallbackPage() {
  const [searchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const checkoutSession = useAppSelector((state) => state.cart.checkoutSession);
  const [isProcessed, setIsProcessed] = useState(false);

  const status = searchParams.get("status") || "unknown";
  const message = searchParams.get("message") || "Không xác định";
  const orderId = searchParams.get("order_id") || "";

  useEffect(() => {
    if (status === "success" && !isProcessed) {
      if (checkoutSession?.items) {
        const itemIds = checkoutSession.items.map((i) => i.id);
        dispatch(removeCartItems(itemIds));
      }
      dispatch(clearCheckoutSession());
      setIsProcessed(true);
    }
  }, [status, dispatch, isProcessed, checkoutSession]);

  const isSuccess = status === "success";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-grow flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center ring-1 ring-gray-100">
          {isSuccess ? (
            <div className="text-emerald-500 mb-6">
              <CheckCircleOutlined style={{ fontSize: "64px" }} />
            </div>
          ) : (
            <div className="text-rose-500 mb-6">
              <CloseCircleOutlined style={{ fontSize: "64px" }} />
            </div>
          )}

          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {isSuccess ? "Thanh toán thành công!" : "Thanh toán thất bại"}
          </h2>
          
          <p className="text-gray-600 mb-6">
            {isSuccess
              ? "Cảm ơn bạn đã mua hàng. Đơn hàng của bạn đã được thanh toán thành công và đang được xử lý."
              : `Rất tiếc, giao dịch của bạn không thể hoàn tất. Lỗi: ${message}`}
          </p>

          {orderId && (
            <div className="bg-gray-50 rounded-lg p-4 mb-8">
              <p className="text-sm text-gray-500 mb-1">Mã đơn hàng</p>
              <p className="font-semibold text-gray-900">#{orderId}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Link
              to="/account"
              className="w-full inline-flex justify-center items-center rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors"
            >
              Xem đơn hàng của tôi
            </Link>
            <Link
              to="/"
              className="w-full inline-flex justify-center items-center rounded-lg bg-white border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Trở về trang chủ
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
