import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "../pages/HomePage";
import Register from "../pages/Register";
import Login from "../pages/Login";
import SearchPage from "../pages/SearchPage";
import BookDetailPage from "../pages/BookDetailPage";
import CartPage from "../pages/CartPage";
import CheckoutPage from "../pages/CheckoutPage";
import CheckoutOrderPage from "../pages/CheckoutOrderPage";
import VNPayCallbackPage from "../pages/VNPayCallbackPage";
import AccountPage from "../pages/AccountPage.tsx";
import RequireStaff from "../components/guards/RequireStaff";
import RequireAdmin from "../components/guards/RequireAdmin";
import AdminLayout from "../components/layouts/AdminLayout/AdminLayout";
import {
  AdminBooksPage,
  AdminFlashSaleCreatePage,
  AdminFlashSalePage,
  AdminFlashSaleSelectBooksPage,
  AdminStatsPage,
  AdminVouchersPage,
} from "../pages/admin";
import {
  StaffBooksPage,
  StaffChatPage,
  StaffOrdersPage,
  StaffSettingsPage,
} from "../pages/staff";

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search]);

  return null;
}

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/book/:id" element={<BookDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/:id" element={<CheckoutOrderPage />} />
        <Route path="/payment/vnpay-callback" element={<VNPayCallbackPage />} />
        <Route path="/account" element={<AccountPage />} />

        <Route element={<RequireStaff />}>
          <Route path="/staff" element={<Navigate to="/staff/chat" replace />} />
          <Route path="/staff/chat" element={<StaffChatPage />} />
          <Route path="/staff/orders" element={<StaffOrdersPage />} />
          <Route path="/staff/books" element={<StaffBooksPage />} />
          <Route path="/staff/settings" element={<StaffSettingsPage />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="stats" replace />} />
            <Route path="stats" element={<AdminStatsPage />} />
            <Route path="books" element={<AdminBooksPage />} />
            <Route path="vouchers" element={<AdminVouchersPage />} />
            <Route path="flash-sale" element={<AdminFlashSalePage />} />
            <Route
              path="flash-sale/new"
              element={<AdminFlashSaleCreatePage />}
            />
            <Route
              path="flash-sale/new/select"
              element={<AdminFlashSaleSelectBooksPage />}
            />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
