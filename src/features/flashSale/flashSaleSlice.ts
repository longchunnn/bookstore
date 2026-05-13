import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  getActiveFlashSales,
  type FlashSaleActiveCampaign,
  type FlashSaleActiveItem,
} from "../../services/flashSalePurchaseService";

// Re-export types so existing imports still work
export type { FlashSaleActiveCampaign, FlashSaleActiveItem };

// Mapped item type that HomePage consumes
export type FlashSaleItem = {
  id: string;
  campaign_id: string;
  book_id: string;
  flash_price: number;
  flash_stock: number;      // remaining_stock from active API
  total_quantity: number;
  sold_quantity: number;
  purchase_limit: number;
  sold_out: boolean;
};

// Campaign type that HomePage consumes
export type FlashSaleCampaign = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
};

type FlashSaleState = {
  activeCampaign: FlashSaleCampaign | null;
  items: FlashSaleItem[];
  loading: boolean;
  error: string;
};

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Thao tác thất bại.";
}

function mapActiveToItem(item: FlashSaleActiveItem, campaignId: string): FlashSaleItem {
  return {
    id: String(item.flash_sale_item_id),
    campaign_id: campaignId,
    book_id: String(item.book_id),
    flash_price: item.flash_sale_price,
    flash_stock: item.remaining_stock,     // ← dùng remaining_stock (đã trừ sold)
    total_quantity: item.total_quantity,
    sold_quantity: item.sold_quantity,
    purchase_limit: item.max_per_user,
    sold_out: item.sold_out,
  };
}

function mapActiveToCampaign(campaign: FlashSaleActiveCampaign): FlashSaleCampaign {
  return {
    id: String(campaign.campaign_id),
    name: campaign.name,
    starts_at: campaign.starts_at,
    ends_at: campaign.ends_at,
  };
}

export const fetchActiveCampaign = createAsyncThunk<
  { campaign: FlashSaleCampaign | null; items: FlashSaleItem[] },
  void,
  { rejectValue: string }
>("flashSale/fetchActiveCampaign", async (_: void, { rejectWithValue }) => {
  try {
    const activeCampaigns = await getActiveFlashSales();
    if (activeCampaigns.length === 0) {
      return { campaign: null, items: [] };
    }

    const first = activeCampaigns[0];
    const campaign = mapActiveToCampaign(first);
    const items = first.items.map((item) => mapActiveToItem(item, campaign.id));

    return { campaign, items };
  } catch (error) {
    return rejectWithValue(getErrorMessage(error));
  }
});

const initialState: FlashSaleState = {
  activeCampaign: null,
  items: [],
  loading: false,
  error: "",
};

const flashSaleSlice = createSlice({
  name: "flashSale",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchActiveCampaign.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchActiveCampaign.fulfilled, (state, action) => {
        state.loading = false;
        state.activeCampaign = action.payload.campaign;
        state.items = action.payload.items;
      })
      .addCase(fetchActiveCampaign.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Không tải được campaign.";
      });
  },
});

export default flashSaleSlice.reducer;
