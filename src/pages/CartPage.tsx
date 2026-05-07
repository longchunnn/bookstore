import { useMemo, useState } from "react";
import {
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import { type VoucherWalletItem } from "../features/voucher/voucherSlice";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  removeFromCart as removeCartItem,
  setCheckoutSession,
  type CartItem,
  updateCartItemQuantity,
} from "../features/cart/cartSlice";
import { normalizeText } from "../utils/textNormalize";

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

type VoucherRule =
  | { type: "min-order"; value: number }
  | { type: "single-category"; value: string }
  | { type: "all" };

function getVoucherPrimaryCategory(voucher: VoucherWalletItem): string | null {
  const categories = Array.isArray(voucher.applies_to_categories)
    ? voucher.applies_to_categories.filter((category) => category !== "ALL")
    : [];

  return categories.length > 0 ? categories[0] : null;
}

function getVoucherRule(voucher: VoucherWalletItem): VoucherRule {
  const minOrder = parseMinOrderFromSubtitle(voucher.subtitle);
  if (minOrder) {
    return { type: "min-order", value: minOrder };
  }

  const primaryCategory = getVoucherPrimaryCategory(voucher);
  if (primaryCategory) {
    return { type: "single-category", value: primaryCategory };
  }

  return { type: "all" };
}

function getEligibleSubtotalForVoucher(
  voucher: VoucherWalletItem,
  selectedItems: CartItem[],
  subtotal: number,
): number {
  const rule = getVoucherRule(voucher);

  if (rule.type === "single-category") {
    return selectedItems
      .filter((item) => item.categoryName === rule.value)
      .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }

  if (rule.type === "min-order") {
    return subtotal >= rule.value ? subtotal : 0;
  }

  return subtotal;
}

export default function CartPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const items = useAppSelector((state) => state.cart.items as CartItem[]);
  const claimedVouchers = useAppSelector(
    (state) => state.voucher.claimedVouchers as VoucherWalletItem[],
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string> | null>(
    null,
  );
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(
    null,
  );
  const [selectedFreeShipId, setSelectedFreeShipId] = useState<string | null>(
    null,
  );

  const [showAllDiscountVouchers, setShowAllDiscountVouchers] = useState(false);

  const itemIdSet = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items],
  );

  const effectiveSelectedItemIds = useMemo(() => {
    if (items.length === 0) return new Set<string>();

    const baseSet =
      selectedItemIds === null ? new Set(items.map((i) => i.id)) : selectedItemIds;

    return new Set(Array.from(baseSet).filter((id) => itemIdSet.has(id)));
  }, [itemIdSet, items, selectedItemIds]);

  const keyword = useMemo(
    () => normalizeText(searchParams.get("q") ?? ""),
    [searchParams],
  );

  const filteredItems = useMemo(() => {
    if (!keyword) return items;

    return items.filter((item) => {
      const haystack = normalizeText(`${item.title} ${item.author ?? ""}`);
      return haystack.includes(keyword);
    });
  }, [items, keyword]);

  const selectedItems = useMemo(
    () => items.filter((item) => effectiveSelectedItemIds.has(item.id)),
    [effectiveSelectedItemIds, items],
  );

  const filteredSelectedCount = useMemo(
    () =>
      filteredItems.filter((item) => effectiveSelectedItemIds.has(item.id))
        .length,
    [effectiveSelectedItemIds, filteredItems],
  );

  const subtotal = useMemo(
    () =>
      selectedItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      ),
    [selectedItems],
  );

  const shippingFeeBeforeVoucher = selectedItems.length > 0 ? 15000 : 0;

  const discountVouchers = useMemo(
    () =>
      claimedVouchers.filter((voucher) => voucher.voucher_type === "discount"),
    [claimedVouchers],
  );

  const freeShipVouchers = useMemo(
    () =>
      claimedVouchers.filter((voucher) => voucher.voucher_type === "freeship"),
    [claimedVouchers],
  );

  const availableDiscountVouchers = useMemo(
    () =>
      discountVouchers.filter(
        (voucher) =>
          getEligibleSubtotalForVoucher(voucher, selectedItems, subtotal) > 0,
      ),
    [discountVouchers, selectedItems, subtotal],
  );

  const discountVoucherOptions = useMemo(() => {
    const computeDiscount = (voucher: VoucherWalletItem): number => {
      const eligible = getEligibleSubtotalForVoucher(
        voucher,
        selectedItems,
        subtotal,
      );
      if (eligible <= 0) return 0;
      return Math.min(
        eligible,
        Math.round((eligible * voucher.discount_percent) / 100),
      );
    };

    return availableDiscountVouchers
      .map((voucher) => ({
        voucher,
        discountAmount: computeDiscount(voucher),
      }))
      .sort((a, b) => {
        if (b.discountAmount !== a.discountAmount) {
          return b.discountAmount - a.discountAmount;
        }
        return a.voucher.code.localeCompare(b.voucher.code);
      });
  }, [availableDiscountVouchers, selectedItems, subtotal]);

  const availableFreeShipVouchers = useMemo(
    () => freeShipVouchers,
    [freeShipVouchers],
  );

  const effectiveSelectedDiscountId =
    selectedDiscountId &&
    availableDiscountVouchers.some(
      (voucher) => voucher.id === selectedDiscountId,
    )
      ? selectedDiscountId
      : null;

  const effectiveSelectedFreeShipId =
    selectedFreeShipId &&
    availableFreeShipVouchers.some(
      (voucher) => voucher.id === selectedFreeShipId,
    )
      ? selectedFreeShipId
      : null;

  const selectedDiscountVoucher = useMemo(
    () =>
      effectiveSelectedDiscountId
        ? availableDiscountVouchers.find(
            (voucher) => voucher.id === effectiveSelectedDiscountId,
          )
        : undefined,
    [availableDiscountVouchers, effectiveSelectedDiscountId],
  );

  const selectedFreeShipVoucher = useMemo(
    () =>
      effectiveSelectedFreeShipId
        ? availableFreeShipVouchers.find(
            (voucher) => voucher.id === effectiveSelectedFreeShipId,
          )
        : undefined,
    [availableFreeShipVouchers, effectiveSelectedFreeShipId],
  );

  const eligibleDiscountSubtotal = useMemo(() => {
    if (!selectedDiscountVoucher) return 0;
    return getEligibleSubtotalForVoucher(
      selectedDiscountVoucher,
      selectedItems,
      subtotal,
    );
  }, [selectedDiscountVoucher, selectedItems, subtotal]);

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

  const shippingDiscount = selectedFreeShipVoucher
    ? Math.min(15000, shippingFeeBeforeVoucher)
    : 0;
  const shippingFee = shippingFeeBeforeVoucher - shippingDiscount;
  const total = Math.max(0, subtotal - discountAmount + shippingFee);

  const allFilteredSelected =
    filteredItems.length > 0 && filteredSelectedCount === filteredItems.length;

  const handleToggleItem = (id: string, checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next =
        prev === null ? new Set(items.map((i) => i.id)) : new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleToggleAllFiltered = (checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next =
        prev === null ? new Set(items.map((i) => i.id)) : new Set(prev);

      filteredItems.forEach((item) => {
        if (checked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      });

      return next;
    });
  };

  const handleProceedCheckout = () => {
    if (selectedItems.length === 0) return;

    dispatch(
      setCheckoutSession({
        items: selectedItems,
        selectedDiscountId: effectiveSelectedDiscountId,
        selectedFreeShipId: effectiveSelectedFreeShipId,
      }),
    );

    navigate("/checkout");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className=" bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h1 className="text-2xl font-bold text-teal-800">
              Giỏ hàng của bạn
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Đã chọn {selectedItems.length}/{items.length} sản phẩm
            </p>

            {items.length > 0 ? (
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800">
                <span className="relative inline-flex h-4 w-4 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(event) =>
                      handleToggleAllFiltered(event.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <span className="h-4 w-4 rounded-sm border border-black bg-white" />
                  <CheckOutlined className="pointer-events-none absolute text-[10px] text-teal-700 opacity-0 transition-opacity peer-checked:opacity-100" />
                </span>
                Chọn tất cả sản phẩm đang hiển thị ({filteredItems.length})
              </label>
            ) : null}

            {items.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <p className="text-gray-600">Giỏ hàng của bạn đang trống.</p>
                <Link
                  to="/"
                  className="mt-4 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Tiếp tục mua sắm
                </Link>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                <p className="text-gray-600">
                  Không có sản phẩm nào khớp từ khóa tìm trong giỏ hàng.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    className={`grid gap-4 rounded-lg border-b px-3 pb-5 pt-3 sm:grid-cols-[96px_1fr] ${
                      effectiveSelectedItemIds.has(item.id)
                        ? "border-teal-200 bg-teal-50/40"
                        : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3 pl-1">
                      <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={effectiveSelectedItemIds.has(item.id)}
                          onChange={(event) =>
                            handleToggleItem(item.id, event.target.checked)
                          }
                          className="peer sr-only"
                        />
                        <span className="h-4 w-4 rounded-sm border border-black bg-white" />
                        <CheckOutlined className="pointer-events-none absolute text-[10px] text-teal-700 opacity-0 transition-opacity peer-checked:opacity-100" />
                      </label>
                      <img
                        src={
                          item.coverSrc ||
                          "https://picsum.photos/200/280?grayscale"
                        }
                        alt={item.title}
                        className="h-28 w-24 rounded-md object-cover"
                      />
                    </div>

                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-gray-900">
                            {item.title}
                          </h2>
                          {item.author ? (
                            <p className="mt-1 text-sm text-gray-500">
                              {item.author}
                            </p>
                          ) : null}
                        </div>
                        <p className="font-semibold text-teal-800">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200">
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(
                                updateCartItemQuantity({
                                  id: item.id,
                                  quantity: item.quantity - 1,
                                }),
                              )
                            }
                            className="h-9 w-9 text-gray-700 hover:bg-gray-50"
                          >
                            -
                          </button>
                          <span className="flex h-9 w-10 items-center justify-center border-x border-gray-200 text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              dispatch(
                                updateCartItemQuantity({
                                  id: item.id,
                                  quantity: item.quantity + 1,
                                }),
                              )
                            }
                            className="h-9 w-9 text-gray-700 hover:bg-gray-50"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => dispatch(removeCartItem(item.id))}
                          className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
                        >
                          <DeleteOutlined />
                          Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="h-fit  border border-teal-100  p-6 shadow-md">
            <h2 className="text-lg font-bold text-orange-900">
              Tóm tắt đơn hàng
            </h2>

            <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-sm font-semibold text-rose-700">Mã giảm giá</p>
              {discountVouchers.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">
                  Bạn chưa nhận mã giảm giá nào.
                </p>
              ) : availableDiscountVouchers.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">
                  Không có mã giảm giá phù hợp cho sản phẩm đã chọn.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {(showAllDiscountVouchers
                    ? discountVoucherOptions
                    : (() => {
                        const top = discountVoucherOptions.slice(0, 5);
                        if (!effectiveSelectedDiscountId) return top;
                        if (
                          top.some(
                            (item) => item.voucher.id === effectiveSelectedDiscountId,
                          )
                        ) {
                          return top;
                        }
                        const selected = discountVoucherOptions.find(
                          (item) => item.voucher.id === effectiveSelectedDiscountId,
                        );
                        return selected ? [...top, selected] : top;
                      })()
                  ).map(({ voucher, discountAmount }) => (
                    <label
                      key={voucher.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-white/80"
                    >
                      <input
                        type="radio"
                        name="discount-voucher"
                        checked={effectiveSelectedDiscountId === voucher.id}
                        onChange={() => setSelectedDiscountId(voucher.id)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-rose-600 ring-rose-200 focus:ring-2"
                      />
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="min-w-0">
                          <strong>{voucher.code}</strong> - {voucher.title}
                        </span>
                        <span className="shrink-0 font-semibold text-rose-700">
                          -{formatCurrency(discountAmount)}
                        </span>
                      </span>
                    </label>
                  ))}

                  {discountVoucherOptions.length > 5 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAllDiscountVouchers((current) => !current)
                      }
                      aria-label={
                        showAllDiscountVouchers
                          ? "Thu gọn danh sách mã giảm giá"
                          : "Xem tất cả mã giảm giá"
                      }
                      className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-white/80 text-rose-700 hover:bg-white"
                    >
                      {showAllDiscountVouchers ? (
                        <UpOutlined />
                      ) : (
                        <DownOutlined />
                      )}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setSelectedDiscountId(null)}
                    className="text-xs font-medium text-gray-500 hover:text-rose-700"
                  >
                    Bỏ chọn mã giảm giá
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-sm font-semibold text-emerald-700">
                Mã freeship
              </p>
              {freeShipVouchers.length === 0 ? (
                <p className="mt-2 text-xs text-gray-500">
                  Bạn chưa nhận mã freeship nào.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {availableFreeShipVouchers.map((voucher) => (
                    <label
                      key={voucher.id}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-white/80"
                    >
                      <input
                        type="radio"
                        name="freeship-voucher"
                        checked={effectiveSelectedFreeShipId === voucher.id}
                        onChange={() => setSelectedFreeShipId(voucher.id)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600 ring-emerald-200 focus:ring-2"
                      />
                      <span>
                        <strong>{voucher.code}</strong> - Giảm 100% phí vận
                        chuyển
                      </span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedFreeShipId(null)}
                    className="text-xs font-medium text-gray-500 hover:text-emerald-700"
                  >
                    Bỏ chọn mã freeship
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-3 rounded-lg border border-white/70 bg-white/80 p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>Tạm tính</span>
                <span className="font-medium text-gray-800">
                  {formatCurrency(subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Giảm giá</span>
                <span className="font-medium text-rose-600">
                  -{formatCurrency(discountAmount)}
                </span>
              </div>
              {selectedDiscountVoucher ? (
                <div className="flex items-center justify-between text-gray-600">
                  <span>Tổng tiền đủ điều kiện mã</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(eligibleDiscountSubtotal)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-gray-600">
                <span>Vận chuyển</span>
                <span className="font-medium text-gray-800">
                  {shippingFee === 0 ? "Miễn phí" : formatCurrency(shippingFee)}
                </span>
              </div>
              {shippingDiscount > 0 ? (
                <div className="flex items-center justify-between text-gray-600">
                  <span>Giảm phí ship</span>
                  <span className="font-medium text-emerald-600">
                    -{formatCurrency(shippingDiscount)}
                  </span>
                </div>
              ) : null}
              <div className="border-t border-orange-100 pt-3">
                <div className="flex items-center justify-between text-base font-bold text-gray-900">
                  <span>Tổng cộng</span>
                  <span className="text-xl text-orange-700">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleProceedCheckout}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-amber-800 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-orange-600 hover:to-amber-600 hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
              disabled={selectedItems.length === 0}
            >
              Tiến hành thanh toán
            </button>

            <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50/70 p-3 text-xs text-teal-800">
              Mua thêm để được freeship cho đơn từ 500.000đ.
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
