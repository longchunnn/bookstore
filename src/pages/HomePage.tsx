import { useCallback, useEffect, useMemo, useState } from "react";
import { RightOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { fetchCatalog } from "../features/books/booksSlice";
import { fetchActiveCampaign } from "../features/flashSale/flashSaleSlice";

import { type BookCardData } from "../components/common/BookCard";
import VoucherCard, {
  type VoucherCardData,
} from "../components/common/VoucherCard";
import VoucherListModal, {
  type DbPromotion,
} from "../components/common/VoucherListModal";

import HomeBanner from "../components/layouts/HomeBanner";
import BookSlider from "../components/common/BookSlider";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import {
  claimVoucher as claimVoucherAction,
  type VoucherWalletItem,
} from "../features/voucher/voucherSlice";
import { toast } from "react-toastify";

type DbBook = {
  id: string;
  title: string;
  author_name: string;
  original_price: number;
  selling_price: number;
  category_name: string;
  cover_image: string;
  sold_count: number;
  rental_count: number;
};

type DbReview = {
  id: string;
  book_id: string;
  rating: number;
  is_approved: number;
};

type RatingStats = {
  average: number;
  count: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function toValidFutureTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  if (timestamp < Date.now()) return null;
  return timestamp;
}

function toVoucherCardData(promotion: DbPromotion): VoucherCardData {
  return {
    id: promotion.id,
    title:
      promotion.voucher_type === "freeship"
        ? "Giảm 100% phí vận chuyển"
        : promotion.title,
    subtitle:
      promotion.voucher_type === "freeship"
        ? "Áp dụng cho phí ship tiêu chuẩn"
        : promotion.subtitle,
    code: promotion.code,
    discount_percent: promotion.discount_percent,
    applies_to_categories: promotion.applies_to_categories,
    voucher_type: promotion.voucher_type,
  };
}

function mapBook(book: DbBook, ratingStats?: RatingStats): BookCardData {
  return {
    id: String(book.id),
    title: book.title,
    author: book.author_name,
    categoryName: book.category_name,
    price: formatCurrency(book.selling_price),
    unitPrice: book.selling_price,
    oldPrice:
      book.original_price > book.selling_price
        ? formatCurrency(book.original_price)
        : undefined,
    coverSrc: book.cover_image,
    rating: ratingStats?.average,
    ratingCount: ratingStats?.count,
  };
}

export function SectionHeader({
  title,
  to,
  onClick,
}: {
  title: string;
  to?: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg md:text-xl font-bold text-teal-800 hover:text-teal-700">
        {title}
      </h2>
      {to ? (
        <Link
          to={to}
          className="text-sm text-teal-800 hover:text-teal-700 font-semibold inline-flex items-center gap-1"
        >
          Xem tất cả <RightOutlined className="text-xs" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="text-sm text-teal-800 hover:text-teal-700 font-semibold inline-flex items-center gap-1"
        >
          Xem tất cả <RightOutlined className="text-xs" />
        </button>
      )}
    </div>
  );
}

export default function HomePage() {
  const dispatch = useAppDispatch();
  const books = useAppSelector((state) => state.books.books as DbBook[]);
  const promotions = useAppSelector(
    (state) => state.books.promotions as DbPromotion[],
  );
  const claimedVouchers = useAppSelector(
    (state) => state.voucher.claimedVouchers as VoucherWalletItem[],
  );
  const claimedVoucherIdSet = useMemo(
    () => new Set(claimedVouchers.map((item) => String(item.id))),
    [claimedVouchers],
  );
  const reviews = useAppSelector((state) => state.books.reviews as DbReview[]);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [expiredCampaignKey, setExpiredCampaignKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    void dispatch(fetchCatalog());
    void dispatch(fetchActiveCampaign());
  }, [dispatch]);

  const flashSaleState = useAppSelector((state) => state.flashSale);
  const activeCampaign = flashSaleState.activeCampaign;

  const campaignKey = useMemo(
    () =>
      activeCampaign
        ? `${activeCampaign.id}-${activeCampaign.ends_at ?? ""}`
        : "",
    [activeCampaign],
  );

  const handleFlashSaleExpired = useCallback(() => {
    if (campaignKey) {
      setExpiredCampaignKey(campaignKey);
    }
  }, [campaignKey]);

  const loading = useAppSelector((state) => state.books.loading);
  const error = useAppSelector((state) => state.books.error);

  const ratingMap = useMemo(() => {
    const approved = reviews.filter(
      (review) => Number(review.is_approved) === 1,
    );
    const bucket = new Map<string, { sum: number; count: number }>();

    approved.forEach((review) => {
      const key = String(review.book_id);
      const current = bucket.get(key) || { sum: 0, count: 0 };
      bucket.set(key, {
        sum: current.sum + review.rating,
        count: current.count + 1,
      });
    });

    const result = new Map<string, RatingStats>();
    bucket.forEach((value, key) => {
      result.set(key, {
        average: Number((value.sum / value.count).toFixed(1)),
        count: value.count,
      });
    });

    return result;
  }, [reviews]);

  const bestSellers = useMemo(
    () =>
      [...books]
        .sort((left, right) => right.sold_count - left.sold_count)
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const hasFlashSaleUiExpired = Boolean(
    campaignKey && expiredCampaignKey === campaignKey,
  );

  const isFlashSaleActive = Boolean(
    activeCampaign && flashSaleState.items.length && !hasFlashSaleUiExpired,
  );
  const flashSaleBooks = useMemo(
    () =>
      flashSaleState.items
        .map((item) => {
          const book = books.find((b) => String(b.id) === item.book_id);
          if (!book) return null;
          return {
            id: String(book.id),
            title: book.title,
            author: book.author_name,
            categoryName: book.category_name,
            price: formatCurrency(item.flash_price),
            unitPrice: item.flash_price,
            oldPrice: formatCurrency(book.selling_price),
            coverSrc: book.cover_image,
            rating: ratingMap.get(String(book.id))?.average,
            ratingCount: ratingMap.get(String(book.id))?.count,
            flashMeta: item.sold_out
              ? "Đã hết hàng"
              : `Còn lại ${item.flash_stock} suất • Đã bán ${item.sold_quantity}`,
          };
        })
        .filter(Boolean) as BookCardData[],
    [flashSaleState.items, books, ratingMap],
  );

  const newArrivals = useMemo(
    () =>
      [...books]
        .sort((left, right) => Number(right.id) - Number(left.id))
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const kidsBooks = useMemo(
    () =>
      books
        .filter((book) => book.category_name === "Thiếu nhi")
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const learningBooks = useMemo(
    () =>
      books
        .filter((book) => book.category_name === "Học tập")
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const classicBooks = useMemo(
    () =>
      books
        .filter((book) => book.category_name === "Tiểu thuyết")
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const scienceBooks = useMemo(
    () =>
      books
        .filter((book) => book.category_name === "Khoa học")
        .slice(0, 6)
        .map((book) => mapBook(book, ratingMap.get(String(book.id)))),
    [books, ratingMap],
  );

  const availablePromotions = useMemo(
    () =>
      promotions
        .filter((promotion) => !claimedVoucherIdSet.has(String(promotion.id)))
        .filter((promotion) => {
          const futureValidTo = toValidFutureTimestamp(promotion.valid_to);
          // Keep vouchers without end date, but drop vouchers already expired.
          return Boolean(futureValidTo) || !promotion.valid_to;
        })
        .sort((left, right) => {
          const leftTime = toValidFutureTimestamp(left.valid_to);
          const rightTime = toValidFutureTimestamp(right.valid_to);

          if (leftTime !== null && rightTime !== null) {
            return leftTime - rightTime;
          }
          if (leftTime !== null) return -1;
          if (rightTime !== null) return 1;
          return String(left.id).localeCompare(String(right.id));
        }),
    [claimedVoucherIdSet, promotions],
  );

  const allVouchers: VoucherCardData[] = useMemo(
    () => availablePromotions.map(toVoucherCardData),
    [availablePromotions],
  );

  const vouchers = useMemo(() => allVouchers.slice(0, 7), [allVouchers]);

  const handleClaimVoucher = (voucher: VoucherCardData) => {
    if (claimedVoucherIdSet.has(String(voucher.id))) {
      return;
    }

    dispatch(
      claimVoucherAction({
        id: voucher.id,
        code: voucher.code,
        title: voucher.title,
        subtitle: voucher.subtitle,
        discount_percent: voucher.discount_percent,
        applies_to_categories: voucher.applies_to_categories,
        voucher_type: voucher.voucher_type || "discount",
      }),
    );

    toast.success("Đã nhận mã giảm giá thành công");
  };

  return (
    <div className="bg-gray-50">
      <Header />
      <HomeBanner
        flashSaleCampaignName={
          isFlashSaleActive ? activeCampaign?.name : undefined
        }
        flashSaleEndsAt={
          isFlashSaleActive ? activeCampaign?.ends_at : undefined
        }
        onFlashSaleExpired={handleFlashSaleExpired}
      />

      {error ? (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 md:px-8">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      ) : null}

      <div className="w-full flex justify-center mt-6 px-4 md:px-8 pb-16">
        <div className="w-full max-w-7xl bg-white border border-gray-100 min-w-0 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-sm text-gray-500">
              Đang tải dữ liệu từ backend...
            </div>
          ) : null}

          {!loading ? (
            <BookSlider
              title={isFlashSaleActive ? "FLASH SALE!!!" : "Sách bán chạy nhất"}
              books={isFlashSaleActive ? flashSaleBooks : bestSellers}
              viewAllTo={
                isFlashSaleActive
                  ? "/search?flash-sale=active"
                  : "/search?sort=sold-desc"
              }
            />
          ) : null}

          {!loading ? (
            <BookSlider
              title="Sách mới về"
              books={newArrivals}
              viewAllTo="/search?sort=newest"
            />
          ) : null}

          {!loading ? (
            <BookSlider
              title="Sách thiếu nhi"
              books={kidsBooks}
              viewAllTo="/search?category=Thiếu+nhi"
            />
          ) : null}

          <section className=" p-4 md:p-5 w-full overflow-hidden">
            <SectionHeader
              title="Ưu đãi & Voucher đặc quyền"
              onClick={() => setIsVoucherModalOpen(true)}
            />
            <div className="mt-4 flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
              {vouchers.map((v) => (
                <VoucherCard
                  key={v.id}
                  data={v}
                  claimed={claimedVoucherIdSet.has(String(v.id))}
                  onClaim={handleClaimVoucher}
                />
              ))}
            </div>
          </section>

          {!loading ? (
            <BookSlider
              title="Sách kỹ năng sống"
              books={learningBooks}
              viewAllTo="/search?category=Học+tập"
            />
          ) : null}

          {!loading ? (
            <BookSlider
              title="Sách văn học kinh điển"
              books={classicBooks}
              viewAllTo="/search?category=Tiểu+thuyết"
            />
          ) : null}

          {!loading ? (
            <BookSlider
              title="Sách khoa học phổ thông"
              books={scienceBooks}
              viewAllTo="/search?category=Khoa+học"
            />
          ) : null}
        </div>
      </div>
      <Footer />

      <VoucherListModal
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        vouchers={allVouchers}
        allPromotions={availablePromotions}
        claimedVoucherIdSet={claimedVoucherIdSet}
        onClaim={handleClaimVoucher}
      />
    </div>
  );
}
