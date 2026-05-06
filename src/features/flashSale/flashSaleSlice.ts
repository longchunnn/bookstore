import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  getActiveCampaigns,
  getCampaignItems,
  type FlashSaleCampaign,
  type FlashSaleItem,
} from "../../services/flashSaleService";

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

export const fetchActiveCampaign = createAsyncThunk<
  { campaign: FlashSaleCampaign | null; items: FlashSaleItem[] },
  void,
  { rejectValue: string }
>("flashSale/fetchActiveCampaign", async (_: void, { rejectWithValue }) => {
  try {
    const campaigns = await getActiveCampaigns();
    if (campaigns.length === 0) {
      return { campaign: null, items: [] };
    }

    const campaign = campaigns[0];
    const items = await getCampaignItems(campaign.id);

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
