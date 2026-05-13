import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { fetchBookDetail } from "../features/books/booksSlice";
import { fetchActiveCampaign } from "../features/flashSale/flashSaleSlice";
import Header from "../components/layouts/Header";
import Footer from "../components/layouts/Footer";
import BookCard, { type BookCardData } from "../components/common/BookCard";
import { getAccessToken } from "../services/axiosClient";
import { createBookReview } from "../services/reviewsService";
import { isJwtExpired } from "../utils/jwt";
import { toast } from "react-toastify";
import { addCartItem } from "../features/cart/cartSlice";
import { type VoucherWalletItem } from "../features/voucher/voucherSlice";

type DbBook = {
  id: string;
  title: string;
  author_name: string;
  original_price: number;
  selling_price: number;
  category_name: string;
  cover_image: string;
  total_stock: number;
  sold_count: number;
  rental_count: number;
  description?: string;
  long_description?: string;
  gallery_images?: string[];
};

type DbReview = {
  id: string;
  book_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  comment: string;
  is_approved: number;
  created_at: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function mapBook(book: DbBook): BookCardData {
  return {
    id: String(book.id),
    title: book.title,
    author: book.author_name,
    price: formatCurrency(book.selling_price),
    unitPrice: book.selling_price,
    oldPrice:
      book.original_price > book.selling_price
        ? formatCurrency(book.original_price)
        : undefined,
    coverSrc: book.cover_image,
  };
}

export default function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const book = useAppSelector(
    (state) => state.books.currentBook as DbBook | null,
  );
  const allBooks = useAppSelector((state) => state.books.books as DbBook[]);
  const reviews = useAppSelector(
    (state) => state.books.currentBookReviews as DbReview[],
  );
  const claimedVouchers = useAppSelector(
    (state) => state.voucher.claimedVouchers as VoucherWalletItem[],
  );
  const [quantity, setQuantity] = useState(1);
  const [galleryState, setGalleryState] = useState<{
    bookId: string;
    index: number;
  }>({ bookId: "", index: 0 });
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const thumbsRef = useRef<HTMLDivElement | null>(null);
  const modalThumbsRef = useRef<HTMLDivElement | null>(null);
  const loading = useAppSelector((state) => state.books.detailLoading);
  const error = useAppSelector((state) => state.books.detailError);
  const flashSaleState = useAppSelector((state) => state.flashSale);
  const [reviewDraft, setReviewDraft] = useState({
    rating: 5,
    comment: "",
  });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    if (!id) return;
    void dispatch(fetchBookDetail(id));
  }, [dispatch, id]);

  useEffect(() => {
    void dispatch(fetchActiveCampaign());
  }, [dispatch]);

  const flashSaleItemForBook = useMemo(() => {
    if (!book) return null;
    return (
      flashSaleState.items.find(
        (item) => String(item.book_id) === String(book.id),
      ) ?? null
    );
  }, [book, flashSaleState.items]);

  const displaySellingPrice = flashSaleItemForBook
    ? flashSaleItemForBook.flash_price
    : (book?.selling_price ?? 0);

  const displayStock = flashSaleItemForBook
    ? flashSaleItemForBook.flash_stock
    : (book?.total_stock ?? 0);

  const galleryImages = useMemo(() => {
    if (!book) return [];
    const fromDb = Array.isArray(book.gallery_images)
      ? book.gallery_images.filter((image) => Boolean(image && image.trim()))
      : [];
    if (fromDb.length > 0) return fromDb;
    return book.cover_image ? [book.cover_image] : [];
  }, [book]);

  const currentBookId = book ? String(book.id) : "";
  const activeImageIndex =
    currentBookId && galleryState.bookId === currentBookId
      ? galleryState.index
      : 0;

  const setActiveImageIndex = useCallback(
    (nextIndex: number | ((prev: number) => number)) => {
      setGalleryState((prevState) => {
        const prevIndex =
          prevState.bookId === currentBookId ? prevState.index : 0;
        const resolvedIndex =
          typeof nextIndex === "function" ? nextIndex(prevIndex) : nextIndex;

        return {
          bookId: currentBookId,
          index: resolvedIndex,
        };
      });
    },
    [currentBookId],
  );

  const showPrevImage = useCallback(() => {
    if (galleryImages.length <= 1) return;
    setActiveImageIndex((prev) =>
      prev === 0 ? galleryImages.length - 1 : prev - 1,
    );
  }, [galleryImages.length, setActiveImageIndex]);

  const showNextImage = useCallback(() => {
    if (galleryImages.length <= 1) return;
    setActiveImageIndex((prev) =>
      prev === galleryImages.length - 1 ? 0 : prev + 1,
    );
  }, [galleryImages.length, setActiveImageIndex]);

  const scrollThumbs = (direction: "left" | "right") => {
    if (!thumbsRef.current) return;
    thumbsRef.current.scrollBy({
      left: direction === "left" ? -220 : 220,
      behavior: "smooth",
    });
  };

  const scrollModalThumbs = (direction: "left" | "right") => {
    if (!modalThumbsRef.current) return;
    modalThumbsRef.current.scrollBy({
      left: direction === "left" ? -180 : 180,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!isGalleryOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGalleryOpen(false);
      } else if (event.key === "ArrowLeft") {
        showPrevImage();
      } else if (event.key === "ArrowRight") {
        showNextImage();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGalleryOpen, showNextImage, showPrevImage]);

  const categoryVouchers = useMemo(
    () =>
      !book
        ? []
        : claimedVouchers.filter(
            (voucher) =>
              voucher.applies_to_categories.includes("ALL") ||
              voucher.applies_to_categories.includes(book.category_name),
          ),
    [book, claimedVouchers],
  );

  const categoryDiscountVouchers = useMemo(
    () =>
      categoryVouchers.filter((voucher) => voucher.voucher_type !== "freeship"),
    [categoryVouchers],
  );

  const categoryFreeShipVouchers = useMemo(
    () =>
      categoryVouchers.filter((voucher) => voucher.voucher_type === "freeship"),
    [categoryVouchers],
  );

  const handleDecrease = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncrease = () => {
    const maxAllowed = Math.max(1, displayStock);
    setQuantity((prev) => Math.min(maxAllowed, prev + 1));
  };

  const handleAddToCart = (): boolean => {
    if (!book) return false;
    const token = getAccessToken();
    if (!token || isJwtExpired(token)) {
      navigate("/login");
      return false;
    }

    dispatch(
      addCartItem({
        item: {
          id: String(book.id),
          title: book.title,
          author: book.author_name,
          categoryName: book.category_name,
          unitPrice: displaySellingPrice,
          coverSrc: book.cover_image,
        },
        quantity,
      }),
    );

    toast.success("Thêm giỏ hàng thành công");
    return true;
  };

  const handleBuyNow = () => {
    const added = handleAddToCart();
    if (!added) return;
    navigate("/cart");
  };

  const handleSubmitReview = async () => {
    if (!book) return;
    const token = getAccessToken();
    if (!token || isJwtExpired(token)) {
      navigate("/login");
      return;
    }

    const comment = reviewDraft.comment.trim();
    if (!comment) {
      toast.error("Vui lòng nhập nội dung bình luận.");
      return;
    }

    if (reviewDraft.rating < 1 || reviewDraft.rating > 5) {
      toast.error("Vui lòng chọn số sao từ 1 đến 5.");
      return;
    }

    try {
      setIsSubmittingReview(true);
      await createBookReview(String(book.id), {
        rating: reviewDraft.rating,
        comment,
      });
      setReviewDraft({ rating: 5, comment: "" });
      toast.success("Đánh giá của bạn đang chờ admin duyệt.");
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : "Không gửi được đánh giá.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return Number((total / reviews.length).toFixed(1));
  }, [reviews]);

  const renderStars = (rating: number) => {
    const safe = Math.max(0, Math.min(5, Math.round(rating)));
    return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
  };

  const relatedBooks = useMemo(() => {
    if (!book) return [];

    return allBooks
      .filter(
        (item) =>
          item.category_name === book.category_name && item.id !== book.id,
      )
      .slice(0, 4)
      .map(mapBook);
  }, [allBooks, book]);

  return (
    <div className="bg-gray-50 min-h-screen">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-600"
        >
          <LeftOutlined /> Quay lại trang chủ
        </Link>

        {loading ? (
          <div className="rounded-xl bg-white p-6 text-gray-500">
            Đang tải chi tiết sách...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        ) : !book ? (
          <div className="rounded-xl bg-white p-6 text-gray-700">
            Không tìm thấy sách.
          </div>
        ) : (
          <>
            <section className="grid gap-8  bg-white p-6 md:grid-cols-[320px_1fr]">
              <div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsGalleryOpen(true)}
                    className="w-full"
                  >
                    <img
                      src={galleryImages[activeImageIndex] || book.cover_image}
                      alt={book.title}
                      className="h-112 w-full rounded-lg object-cover"
                    />
                  </button>

                  {galleryImages.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={showPrevImage}
                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/55"
                      >
                        <LeftOutlined />
                      </button>
                      <button
                        type="button"
                        onClick={showNextImage}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/55"
                      >
                        <RightOutlined />
                      </button>
                    </>
                  ) : null}
                </div>

                {galleryImages.length > 1 ? (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollThumbs("left")}
                      className="shrink-0 rounded-md border border-gray-200 bg-white p-2 text-gray-600 hover:text-teal-700"
                    >
                      <LeftOutlined />
                    </button>

                    <div
                      ref={thumbsRef}
                      className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    >
                      {galleryImages.map((image, index) => (
                        <button
                          key={`${book.id}-thumb-${index}`}
                          type="button"
                          onClick={() => {
                            setActiveImageIndex(index);
                            setIsGalleryOpen(true);
                          }}
                          className={`h-20 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                            index === activeImageIndex
                              ? "border-teal-600"
                              : "border-transparent"
                          }`}
                        >
                          <img
                            src={image}
                            alt={`${book.title} ảnh ${index + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => scrollThumbs("right")}
                      className="shrink-0 rounded-md border border-gray-200 bg-white p-2 text-gray-600 hover:text-teal-700"
                    >
                      <RightOutlined />
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                <h1 className="mt-2 text-3xl font-bold text-gray-900">
                  {book.title}
                </h1>

                <div className="mt-6 flex items-end gap-3">
                  <span className="text-3xl font-bold text-teal-800">
                    {formatCurrency(displaySellingPrice)}
                  </span>
                  {book.original_price > displaySellingPrice ? (
                    <span className="text-lg text-gray-400 line-through">
                      {formatCurrency(book.original_price)}
                    </span>
                  ) : null}
                </div>

                {flashSaleItemForBook && flashSaleState.activeCampaign ? (
                  <div className="mt-3 inline-flex rounded-md bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700">
                    Flash sale dang dien ra:{" "}
                    {flashSaleState.activeCampaign.name}
                  </div>
                ) : null}

                <div className="mt-4 text-sm text-gray-500">
                  Đã bán: {book.sold_count}
                </div>

                <div className="mt-2 text-sm font-medium text-emerald-700">
                  {flashSaleItemForBook
                    ? `Con lai flash sale: ${displayStock} cuon`
                    : `Con lai trong kho: ${displayStock} cuon`}
                </div>

                <div className="mt-6 border-t border-gray-100 pt-5">
                  <p className="text-sm font-semibold text-gray-800">
                    Mã giảm giá hiện có
                  </p>
                  {categoryDiscountVouchers.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">
                      Bạn chưa nhận mã giảm giá phù hợp cho thể loại này ở trang
                      chủ.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categoryDiscountVouchers.map((voucher) => (
                        <span
                          key={voucher.id}
                          className="inline-flex items-center rounded-md bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600"
                        >
                          {voucher.code} - {voucher.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-sm font-semibold text-gray-800">
                    Vận chuyển
                  </p>
                  <p className="mt-2 text-sm text-gray-700">
                    Giao nhanh dự kiến: 2 - 4 ngày • Phí vận chuyển chuẩn:
                    15.000đ
                  </p>
                  {categoryFreeShipVouchers.length > 0 ? (
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Có mã freeship áp dụng:{" "}
                      {categoryFreeShipVouchers.map((v) => v.code).join(", ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      Bạn chưa có mã freeship phù hợp cho sản phẩm này.
                    </p>
                  )}
                </div>

                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-sm font-semibold text-gray-800">
                    Số lượng
                  </p>
                  <div className="mt-2 inline-flex items-center overflow-hidden rounded-lg border border-gray-200">
                    <button
                      type="button"
                      onClick={handleDecrease}
                      className="h-10 w-10 text-lg text-gray-600 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <div className="flex h-10 w-12 items-center justify-center border-x border-gray-200 text-sm font-semibold text-gray-800">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      onClick={handleIncrease}
                      className="h-10 w-10 text-lg text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="text-sm font-semibold text-gray-800">
                    An tâm mua sắm cùng Xanh
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    <li>
                      Hoàn tiền nếu nhận sai sách hoặc sản phẩm hư hỏng do vận
                      chuyển.
                    </li>
                    <li>
                      Đổi trả miễn phí trong 7 ngày theo chính sách của Sách
                      Xanh.
                    </li>
                    <li>Hỗ trợ khách hàng 24/7 qua hotline và chat.</li>
                  </ul>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {flashSaleItemForBook && flashSaleState.activeCampaign ? (
                    <button
                      type="button"
                      onClick={() => navigate("/flash-sale")}
                      className="col-span-1 sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:from-red-700 hover:to-orange-600 shadow-lg animate-pulse"
                    >
                      <span className="text-xl">⚡</span>
                      MUA NGAY FLASH SALE
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleAddToCart}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-teal-700 bg-white px-4 py-3 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50"
                      >
                        <ShoppingCartOutlined />
                        Thêm giỏ hàng
                      </button>
                      <button
                        type="button"
                        onClick={handleBuyNow}
                        className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
                      >
                        Mua ngay
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-8  bg-white p-6">
              <h2 className="text-xl font-bold text-teal-800">Mô tả sách</h2>
              <div className="mt-4 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-gray-800">Tác giả:</span>{" "}
                  {book.author_name}
                </p>
                <p>
                  <span className="font-semibold text-gray-800">Thể loại:</span>{" "}
                  {book.category_name}
                </p>
              </div>
              <div className="mt-4 space-y-4 leading-7 text-gray-700">
                {(
                  book.long_description ||
                  book.description ||
                  "Sách đang được cập nhật mô tả."
                )
                  .split("\n")
                  .filter((line) => line.trim().length > 0)
                  .map((line, index) => (
                    <p key={`${book.id}-desc-${index}`}>{line}</p>
                  ))}
              </div>
            </section>

            <section className="mt-8  bg-white p-6">
              <h2 className="text-xl font-bold text-teal-800">Đánh giá</h2>

              <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
                <span className="text-2xl font-bold text-gray-900">
                  {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
                </span>
                <span className="text-amber-500">
                  {renderStars(averageRating)}
                </span>
                <span>({reviews.length} đánh giá)</span>
              </div>

              <div className="mt-5 border border-gray-200 bg-gray-50 p-4">
                <h3 className="text-base font-bold text-teal-900">
                  Viết đánh giá của bạn
                </h3>
                <div className="mt-3 flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setReviewDraft((current) => ({
                          ...current,
                          rating: star,
                        }))
                      }
                      className={`text-2xl ${
                        star <= reviewDraft.rating
                          ? "text-amber-500"
                          : "text-gray-300"
                      }`}
                      aria-label={`Chọn ${star} sao`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewDraft.comment}
                  onChange={(event) =>
                    setReviewDraft((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  maxLength={2000}
                  rows={4}
                  className="mt-3 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
                  placeholder="Chia sẻ cảm nhận của bạn về cuốn sách..."
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSubmitReview()}
                    disabled={isSubmittingReview}
                    className="bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingReview ? "Đang gửi..." : "Gửi đánh giá"}
                  </button>
                  <p className="text-xs text-gray-500">
                    Bài viết sẽ hiển thị sau khi admin kiểm duyệt.
                  </p>
                </div>
              </div>

              {reviews.length === 0 ? (
                <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  Chưa có đánh giá nào cho sách này.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-gray-800">
                          {review.user_name}
                        </p>
                        <span className="text-amber-500">
                          {renderStars(review.rating)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-700">
                        {review.comment}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        {new Date(review.created_at).toLocaleDateString(
                          "vi-VN",
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {relatedBooks.length > 0 ? (
              <section className="mt-10 rounded-xl bg-white p-6">
                <h2 className="text-xl font-bold text-teal-800">
                  Sách cùng thể loại
                </h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {relatedBooks.map((item) => (
                    <BookCard key={item.id} data={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>

      {isGalleryOpen && galleryImages.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="relative grid w-full max-w-6xl gap-4 rounded-xl bg-white p-4 md:grid-cols-[1fr_220px]">
            <button
              type="button"
              onClick={() => setIsGalleryOpen(false)}
              className="absolute right-3 top-3 rounded-full bg-white p-2 text-gray-700 shadow hover:bg-gray-100"
            >
              <CloseOutlined />
            </button>

            <div className="relative flex items-center justify-center rounded-lg bg-gray-100 p-2">
              <img
                src={galleryImages[activeImageIndex]}
                alt={`${book?.title} xem chi tiết`}
                className="max-h-[80vh] w-auto rounded-md object-contain"
              />

              {galleryImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={showPrevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded bg-black/35 px-3 py-2 text-white hover:bg-black/50"
                  >
                    <LeftOutlined />
                  </button>
                  <button
                    type="button"
                    onClick={showNextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-black/35 px-3 py-2 text-white hover:bg-black/50"
                  >
                    <RightOutlined />
                  </button>
                </>
              ) : null}
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-gray-800">
                {book?.title}
              </p>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => scrollModalThumbs("left")}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-600 hover:text-teal-700"
                >
                  <LeftOutlined />
                </button>
                <button
                  type="button"
                  onClick={() => scrollModalThumbs("right")}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-600 hover:text-teal-700"
                >
                  <RightOutlined />
                </button>
              </div>
              <div
                ref={modalThumbsRef}
                className="flex max-h-[70vh] gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {galleryImages.map((image, index) => (
                  <button
                    key={`${book?.id}-modal-thumb-${index}`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    className={`h-20 w-16 shrink-0 overflow-hidden rounded border-2 ${
                      index === activeImageIndex
                        ? "border-teal-600"
                        : "border-transparent"
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${book?.title} thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Footer />
    </div>
  );
}
