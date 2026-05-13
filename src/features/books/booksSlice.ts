import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { type ApiBook } from "../../utils/apiMappers";
import { getBookById, getBooks } from "../../services/booksService";
import { getVouchers } from "../../services/vouchersService";
import { getBookReviews } from "../../services/reviewsService";

type DbPromotion = {
  id: string;
  title: string;
  subtitle: string;
  code: string;
  discount_percent: number;
  max_discount_amount?: number;
  min_order_value?: number;
  usage_limit?: number;
  used_count?: number;
  status?: number;
  applies_to_categories?: string[];
  voucher_type?: "discount" | "freeship";
  valid_from?: string;
  valid_to?: string;
  created_at?: string;
  updated_at?: string;
};

type DbReview = {
  id: string;
  book_id: string;
  rating: number;
  is_approved: number;
  created_at?: string;
  comment?: string;
  user_name?: string;
};

export type BooksState = {
  books: ApiBook[];
  promotions: DbPromotion[];
  reviews: DbReview[];
  currentBook: ApiBook | null;
  currentBookReviews: DbReview[];
  loading: boolean;
  detailLoading: boolean;
  error: string;
  detailError: string;
};

export const fetchCatalog = createAsyncThunk("books/fetchCatalog", async () => {
  const [booksResponse, vouchersResponse] = await Promise.all([
    getBooks(),
    getVouchers().catch(() => []),
  ]);

  return {
    books: Array.isArray(booksResponse) ? booksResponse : [],
    promotions: Array.isArray(vouchersResponse)
      ? vouchersResponse.map((v) => ({
          id: v.promotionId,
          title: v.title || "",
          subtitle: v.description || "",
          code: v.code,
          discount_percent: v.discountPercent,
          max_discount_amount: v.maxDiscountAmount,
          min_order_value: v.minOrderValue,
          usage_limit: v.usageLimit,
          used_count: v.usedCount,
          status: v.status,
          applies_to_categories: v.applicableCategories,
          voucher_type: "discount" as const,
          valid_from: v.startDate,
          valid_to: v.endDate,
          created_at: v.createdAt,
          updated_at: v.updatedAt,
        }))
      : [],
    reviews: [],
  };
});

export const fetchBookDetail = createAsyncThunk(
  "books/fetchBookDetail",
  async (bookId: string) => {
    const [bookResponse, booksResponse] = await Promise.all([
      getBookById(bookId),
      getBooks(),
    ]);
    const reviewResponse = await getBookReviews(bookId).catch(() => []);

    return {
      book: bookResponse,
      books: Array.isArray(booksResponse) ? booksResponse : [],
      reviews: reviewResponse,
    };
  },
);

const initialState: BooksState = {
  books: [],
  promotions: [],
  reviews: [],
  currentBook: null,
  currentBookReviews: [],
  loading: false,
  detailLoading: false,
  error: "",
  detailError: "",
};

const booksSlice = createSlice({
  name: "books",
  initialState,
  reducers: {
    clearCurrentBook(state) {
      state.currentBook = null;
      state.currentBookReviews = [];
      state.detailError = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCatalog.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchCatalog.fulfilled, (state, action) => {
        state.loading = false;
        state.books = action.payload.books;
        state.promotions = action.payload.promotions;
        state.reviews = action.payload.reviews;
      })
      .addCase(fetchCatalog.rejected, (state) => {
        state.loading = false;
        state.error =
          "Không tải được dữ liệu từ backend. Vui lòng kiểm tra Spring Boot API.";
      })
      .addCase(fetchBookDetail.pending, (state) => {
        state.detailLoading = true;
        state.detailError = "";
      })
      .addCase(fetchBookDetail.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentBook = action.payload.book;
        state.books = action.payload.books;
        state.currentBookReviews = action.payload.reviews;
      })
      .addCase(fetchBookDetail.rejected, (state) => {
        state.detailLoading = false;
        state.detailError =
          "Không tải được thông tin sách từ backend. Vui lòng thử lại.";
      });
  },
});

export const { clearCurrentBook } = booksSlice.actions;
export default booksSlice.reducer;
