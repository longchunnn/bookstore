import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircleOutlined } from "@ant-design/icons";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import ShippingAddressSection from "../components/common/ShippingAddressSection";
import {
  getDistrictsByProvinceCode,
  getProvinces,
  getWardsByDistrictCode,
  type AdministrativeOption,
} from "../utils/vnAdministrative";
import { getAccessToken } from "../services/axiosClient";
import { createOrder } from "../services/ordersService";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  clearCheckoutSession as clearCheckoutSessionAction,
  removeCartItems,
  type CheckoutSession,
} from "../features/cart/cartSlice";
import {
  setSavedAddresses,
  setSelectedAddressId,
} from "../features/session/sessionSlice";
import { type VoucherWalletItem } from "../features/voucher/voucherSlice";
import type { CartItem } from "../features/cart/cartSlice";
import { parseJwtPayload } from "../utils/jwt";

type ShippingMethod = "standard" | "express";
type PaymentMethod = "cod" | "prepaid";

type SavedAddress = {
  id: string;
  isDefault?: boolean;
  fullName: string;
  phone: string;
  addressLine: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  wardCode: string;
  wardName: string;
  postalCode: string;
};

type AddressForm = Omit<SavedAddress, "id">;
type ShippingField =
  | "shippingFullName"
  | "shippingPhone"
  | "shippingAddressLine"
  | "shippingProvince"
  | "shippingDistrict"
  | "shippingWard";

const ORDER_UPDATED_EVENT = "bookstore:order:updated";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMinOrderFromSubtitle(subtitle: string): number | null {
  if (!subtitle) return null;

  const compact = subtitle.toLowerCase().replace(/\s+/g, "");
  const kMatch = compact.match(/(\d+)k/);
  if (kMatch) {
    return Number(kMatch[1]) * 1000;
  }

  const plainMatch = compact.match(/(\d{4,})/);
  if (plainMatch) {
    return Number(plainMatch[1]);
  }

  return null;
}

function getVoucherPrimaryCategory(voucher: VoucherWalletItem): string | null {
  const categories = Array.isArray(voucher.applies_to_categories)
    ? voucher.applies_to_categories.filter((category) => category !== "ALL")
    : [];

  return categories.length > 0 ? categories[0] : null;
}

function getEligibleSubtotalForVoucher(
  voucher: VoucherWalletItem,
  selectedItems: CartItem[],
  subtotal: number,
): number {
  const minOrder = parseMinOrderFromSubtitle(voucher.subtitle);
  if (minOrder) {
    return subtotal >= minOrder ? subtotal : 0;
  }

  const primaryCategory = getVoucherPrimaryCategory(voucher);
  if (primaryCategory) {
    return selectedItems
      .filter((item) => item.categoryName === primaryCategory)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  return subtotal;
}

function getPreferredAddress(addresses: SavedAddress[]): SavedAddress | null {
  if (addresses.length === 0) return null;
  return addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
}

function findNameByCode(options: AdministrativeOption[], code: string): string {
  const safeCode = String(code || "").trim();
  if (!safeCode) return "";
  return options.find((item) => item.code === safeCode)?.name ?? "";
}

export default function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const claimedVouchers = useAppSelector(
    (state) => state.voucher.claimedVouchers as VoucherWalletItem[],
  );

  const [shippingMethod, setShippingMethod] =
    useState<ShippingMethod>("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const checkoutSession = useAppSelector(
    (state) => state.cart.checkoutSession as CheckoutSession | null,
  );

  const items = useMemo(() => checkoutSession?.items ?? [], [checkoutSession]);
  const selectedDiscountId = checkoutSession?.selectedDiscountId ?? null;
  const selectedFreeShipId = checkoutSession?.selectedFreeShipId ?? null;

  const savedAddresses = useAppSelector(
    (state) => state.session.savedAddresses as SavedAddress[],
  );
  const selectedAddressId = useAppSelector(
    (state) => state.session.selectedAddressId,
  );
  const [form, setForm] = useState<AddressForm>({
    fullName: "",
    phone: "",
    addressLine: "",
    provinceCode: "",
    provinceName: "",
    districtCode: "",
    districtName: "",
    wardCode: "",
    wardName: "",
    postalCode: "",
  });
  const [addressError, setAddressError] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const [provinces, setProvinces] = useState<AdministrativeOption[]>([]);
  const [districts, setDistricts] = useState<AdministrativeOption[]>([]);
  const [wards, setWards] = useState<AdministrativeOption[]>([]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const result = await getProvinces();
        if (!disposed) setProvinces(result);
      } catch {
        if (!disposed) setProvinces([]);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let timer: any;
    if (showSuccessModal && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (showSuccessModal && countdown === 0) {
      navigate("/account");
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showSuccessModal, countdown, navigate]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const result = form.provinceCode
          ? await getDistrictsByProvinceCode(form.provinceCode)
          : [];
        if (!disposed) setDistricts(result);
      } catch {
        if (!disposed) setDistricts([]);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [form.provinceCode]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const result = form.districtCode
          ? await getWardsByDistrictCode(form.districtCode)
          : [];
        if (!disposed) setWards(result);
      } catch {
        if (!disposed) setWards([]);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [form.districtCode]);

  useEffect(() => {
    if (selectedAddressId) return;
    if (savedAddresses.length === 0) return;
    dispatch(
      setSelectedAddressId(getPreferredAddress(savedAddresses)?.id ?? null),
    );
  }, [dispatch, savedAddresses, selectedAddressId]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [items],
  );

  const selectedDiscountVoucher = useMemo(
    () =>
      claimedVouchers.find(
        (voucher) =>
          voucher.voucher_type === "discount" &&
          voucher.id === selectedDiscountId,
      ) ?? null,
    [claimedVouchers, selectedDiscountId],
  );

  const selectedFreeShipVoucher = useMemo(
    () =>
      claimedVouchers.find(
        (voucher) =>
          voucher.voucher_type === "freeship" &&
          voucher.id === selectedFreeShipId,
      ) ?? null,
    [claimedVouchers, selectedFreeShipId],
  );

  const eligibleDiscountSubtotal = useMemo(() => {
    if (!selectedDiscountVoucher) return 0;
    return getEligibleSubtotalForVoucher(
      selectedDiscountVoucher,
      items,
      subtotal,
    );
  }, [selectedDiscountVoucher, items, subtotal]);

  const discountAmount = selectedDiscountVoucher
    ? Math.min(
      eligibleDiscountSubtotal,
      Math.round(
        (eligibleDiscountSubtotal *
          selectedDiscountVoucher.discount_percent) /
        100,
      ),
    )
    : 0;

  const baseShippingFee = shippingMethod === "standard" ? 15000 : 30000;
  const shippingDiscount = selectedFreeShipVoucher
    ? Math.min(15000, baseShippingFee)
    : 0;
  const shippingFee = Math.max(0, baseShippingFee - shippingDiscount);
  const total = Math.max(0, subtotal - discountAmount + shippingFee);

  const selectedAddress = useMemo(
    () =>
      savedAddresses.find((address) => address.id === selectedAddressId) ??
      null,
    [savedAddresses, selectedAddressId],
  );

  const handleDeleteAddress = (addressId: string) => {
    const next = savedAddresses.filter((address) => address.id !== addressId);
    dispatch(setSavedAddresses(next));

    if (selectedAddressId === addressId) {
      dispatch(setSelectedAddressId(getPreferredAddress(next)?.id ?? null));
    }
  };

  const handleSelectSavedAddress = (addressId: string) => {
    const nextSavedAddresses = savedAddresses.map((address) => ({
      ...address,
      isDefault: address.id === addressId,
    }));
    const nextSelected = nextSavedAddresses.find(
      (address) => address.id === addressId,
    );
    if (!nextSelected) return;

    dispatch(setSavedAddresses(nextSavedAddresses));
    dispatch(setSelectedAddressId(nextSelected.id));
    setAddressError("");
    setForm({
      fullName: nextSelected.fullName,
      phone: nextSelected.phone,
      addressLine: nextSelected.addressLine,
      provinceCode: nextSelected.provinceCode,
      provinceName: nextSelected.provinceName,
      districtCode: nextSelected.districtCode,
      districtName: nextSelected.districtName,
      wardCode: nextSelected.wardCode,
      wardName: nextSelected.wardName,
      postalCode: nextSelected.postalCode,
    });
  };

  const handleFormFieldChange = (field: keyof AddressForm, value: string) => {
    setForm((prev) => {
      if (field === "provinceCode") {
        return {
          ...prev,
          provinceCode: value,
          provinceName: findNameByCode(provinces, value),
          districtCode: "",
          districtName: "",
          wardCode: "",
          wardName: "",
        };
      }

      if (field === "districtCode") {
        return {
          ...prev,
          districtCode: value,
          districtName: findNameByCode(districts, value),
          wardCode: "",
          wardName: "",
        };
      }

      if (field === "wardCode") {
        return {
          ...prev,
          wardCode: value,
          wardName: findNameByCode(wards, value),
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleShippingFieldChange = (field: ShippingField, value: string) => {
    if (field === "shippingFullName") {
      handleFormFieldChange("fullName", value);
      return;
    }

    if (field === "shippingPhone") {
      handleFormFieldChange("phone", value);
      return;
    }

    if (field === "shippingWard") {
      handleFormFieldChange("wardCode", value);
      return;
    }

    handleFormFieldChange("addressLine", value);
  };

  const handleCompleteOrder = async () => {
    if (!selectedAddress && !form.fullName.trim()) {
      setAddressError(
        "Vui lòng chọn địa chỉ đã lưu hoặc nhập địa chỉ giao hàng.",
      );
      return;
    }

    const token = getAccessToken();
    const payload = token ? parseJwtPayload(token) : null;
    const userId = String(payload?.user_id ?? payload?.sub ?? "").trim();

    if (!userId) {
      setAddressError("Vui lòng đăng nhập lại để tạo đơn hàng.");
      return;
    }

    const shippingAddress = selectedAddress
      ? [
        selectedAddress.addressLine,
        selectedAddress.wardName,
        selectedAddress.districtName,
        selectedAddress.provinceName,
      ]
        .filter(Boolean)
        .join(", ")
      : [
        form.addressLine,
        findNameByCode(wards, form.wardCode),
        findNameByCode(districts, form.districtCode),
        findNameByCode(provinces, form.provinceCode),
      ]
        .filter(Boolean)
        .join(", ");

    const orderPayload = {
      user_id: userId,
      userId,
      promotion_id: selectedDiscountId ?? selectedFreeShipId ?? null,
      promotionId: selectedDiscountId ?? selectedFreeShipId ?? null,
      order_date: new Date().toISOString(),
      orderDate: new Date().toISOString(),
      total_amount: total,
      totalAmount: total,
      shipping_address: shippingAddress,
      shippingAddress,
      payment_method: paymentMethod === "cod" ? "COD" : "VNPay",
      paymentMethod: paymentMethod === "cod" ? "COD" : "VNPay",
      order_status: "Đang xử lý",
      orderStatus: "Đang xử lý",
      items: items.map((item) => ({
        book_id: item.id,
        bookId: item.id,
        title: item.title,
        unit_price: item.unitPrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    };

    try {
      const newOrder = await createOrder(orderPayload);
      window.dispatchEvent(new Event(ORDER_UPDATED_EVENT));

      if (newOrder.payment_url) {
        window.location.href = newOrder.payment_url;
        return;
      }
    } catch {
      setAddressError("Không thể lưu đơn hàng vào backend. Vui lòng thử lại.");
      return;
    }

    setAddressError("");
    setShowSuccessModal(true);

    const purchasedItemIds = items.map(item => item.id);
    dispatch(removeCartItems(purchasedItemIds));
    dispatch(clearCheckoutSessionAction());
  };

  if (items.length === 0 && !showSuccessModal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 py-12">
          <div className="border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-gray-700">Không có sản phẩm để thanh toán.</p>
            <Link
              to="/cart"
              className="mt-4 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Quay lại giỏ hàng
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-teal-900">
                1. Địa chỉ giao hàng
              </h2>
            </div>

            <ShippingAddressSection
              form={{
                shippingFullName: form.fullName,
                shippingPhone: form.phone,
                shippingAddressLine: form.addressLine,
                shippingProvince: form.provinceCode,
                shippingDistrict: form.districtCode,
                shippingWard: form.wardCode,
              }}
              formErrors={{}}
              isProfileSaved={false}
              savedAddresses={savedAddresses}
              selectedAddressId={selectedAddressId}
              provinces={provinces}
              districts={districts}
              wards={wards}
              onAddNewAddress={() => {
                setAddressError("");
                setForm({
                  fullName: "",
                  phone: "",
                  addressLine: "",
                  provinceCode: "",
                  provinceName: "",
                  districtCode: "",
                  districtName: "",
                  wardCode: "",
                  wardName: "",
                  postalCode: "",
                });
              }}
              onSelectSavedAddress={handleSelectSavedAddress}
              onDeleteSavedAddress={handleDeleteAddress}
              onFormFieldChange={handleShippingFieldChange}
              onShippingProvinceChange={(provinceCode) =>
                handleFormFieldChange("provinceCode", provinceCode)
              }
              onShippingDistrictChange={(districtCode) =>
                handleFormFieldChange("districtCode", districtCode)
              }
              isAddressFormVisible={true}
              showHeader={false}
              showAddButton={false}
              showDeleteButton={false}
              showAddressForm={false}
            />

            <p className="mt-2 text-xs text-gray-500">
              Số điện thoại hợp lệ: 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.
            </p>
            {addressError ? (
              <p className="mt-2 text-sm text-rose-600">{addressError}</p>
            ) : null}
          </div>

          <div className="bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-4 text-xl font-bold text-teal-900">
              2. Phương thức vận chuyển
            </h2>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-teal-200">
                <input
                  type="radio"
                  name="shipping"
                  checked={shippingMethod === "standard"}
                  onChange={() => setShippingMethod("standard")}
                  className="mt-1 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm text-gray-700">
                  <strong>Giao hàng tiêu chuẩn</strong>
                  <br />
                  3-5 ngày làm việc - 15.000đ
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-teal-200">
                <input
                  type="radio"
                  name="shipping"
                  checked={shippingMethod === "express"}
                  onChange={() => setShippingMethod("express")}
                  className="mt-1 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm text-gray-700">
                  <strong>Giao hàng hỏa tốc</strong>
                  <br />
                  Giao trong ngày - 30.000đ
                </span>
              </label>
            </div>
          </div>

          <div className="bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="mb-4 text-xl font-bold text-teal-900">
              3. Thông tin thanh toán
            </h2>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-teal-200">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === "cod"}
                  onChange={() => setPaymentMethod("cod")}
                  className="mt-1 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm text-gray-700">
                  <strong>Thanh toán khi nhận hàng</strong>
                  <br />
                  Thanh toán bằng tiền mặt khi nhận đơn.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-teal-200">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === "prepaid"}
                  onChange={() => setPaymentMethod("prepaid")}
                  className="mt-1 h-4 w-4 accent-teal-700"
                />
                <span className="text-sm text-gray-700">
                  <strong>Thanh toán trước</strong>
                  <br />
                  Chuyển khoản hoặc ví điện tử.
                </span>
              </label>
            </div>
          </div>
        </section>

        <aside className="h-fit bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Tóm tắt đơn hàng</h2>

          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 border-b border-gray-100 pb-3"
              >
                <img
                  src={
                    item.coverSrc || "https://picsum.photos/200/280?grayscale"
                  }
                  alt={item.title}
                  className="h-14 w-12 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500">SL: {item.quantity}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
            <div className="flex items-center justify-between text-gray-600">
              <span>Tạm tính</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <span>Giảm giá</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <span>Vận chuyển</span>
              <span>{formatCurrency(shippingFee)}</span>
            </div>
            {shippingDiscount > 0 ? (
              <div className="flex items-center justify-between text-gray-600">
                <span>Giảm phí ship</span>
                <span>-{formatCurrency(shippingDiscount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-base font-bold text-gray-900">
              <span>Tổng cộng</span>
              <span className="text-orange-700">{formatCurrency(total)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompleteOrder}
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-amber-800 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Hoàn tất thanh toán
          </button>

          <button
            type="button"
            onClick={() => navigate("/cart")}
            className="mt-3 w-full text-center text-sm font-medium text-gray-500 hover:text-teal-700"
          >
            Quay lại giỏ hàng
          </button>
        </aside>
      </main>

      <Footer />

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-8 text-center shadow-2xl transition-all animate-in fade-in zoom-in duration-300">
            <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircleOutlined className="text-4xl" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-gray-900">
              Đặt hàng thành công!
            </h3>
            <p className="mb-8 text-gray-600">
              Cảm ơn bạn đã tin tưởng lựa chọn Sách Xanh. Đơn hàng của bạn đang được xử lý và sẽ sớm được giao đến bạn.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/account")}
                className="w-full rounded-xl bg-teal-700 py-3 font-semibold text-white transition-colors hover:bg-teal-800"
              >
                Theo dõi đơn hàng
              </button>
              <button
                onClick={() => navigate("/")}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Tiếp tục mua sắm
              </button>
            </div>
            <p className="mt-6 text-xs text-gray-400">
              Tự động chuyển hướng sau {countdown} giây...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
