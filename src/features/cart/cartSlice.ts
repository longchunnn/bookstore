import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type CartItem = {
  id: string;
  title: string;
  author?: string;
  categoryName?: string;
  coverSrc?: string;
  unitPrice: number;
  quantity: number;
};

export type CheckoutSession = {
  items: CartItem[];
  selectedDiscountId: string | null;
  selectedFreeShipId: string | null;
};

export type CartState = {
  items: CartItem[];
  checkoutSession: CheckoutSession | null;
};

const initialState: CartState = {
  items: [],
  checkoutSession: null,
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    setCartItems(state, action: PayloadAction<CartItem[]>) {
      state.items = action.payload;
    },
    addToCart(
      state,
      action: PayloadAction<{
        item: Omit<CartItem, "quantity">;
        quantity?: number;
      }>,
    ) {
      const quantity = Math.max(1, action.payload.quantity ?? 1);
      const existing = state.items.find(
        (cartItem) => cartItem.id === action.payload.item.id,
      );

      if (existing) {
        state.items = state.items.map((cartItem) =>
          cartItem.id === action.payload.item.id
            ? { ...cartItem, quantity: cartItem.quantity + quantity }
            : cartItem,
        );
        return;
      }

      state.items = [...state.items, { ...action.payload.item, quantity }];
    },
    updateCartQuantity(
      state,
      action: PayloadAction<{ id: string; quantity: number }>,
    ) {
      state.items =
        action.payload.quantity <= 0
          ? state.items.filter((item) => item.id !== action.payload.id)
          : state.items.map((item) =>
              item.id === action.payload.id
                ? { ...item, quantity: action.payload.quantity }
                : item,
            );
    },
    removeFromCart(state, action: PayloadAction<string>) {
      state.items = state.items.filter((item) => item.id !== action.payload);
    },
    removeCartItems(state, action: PayloadAction<string[]>) {
      const idsToRemove = new Set(action.payload);
      state.items = state.items.filter((item) => !idsToRemove.has(item.id));
    },
    clearCart(state) {
      state.items = [];
    },
    setCheckoutSession(state, action: PayloadAction<CheckoutSession>) {
      state.checkoutSession = action.payload;
    },
    clearCheckoutSession(state) {
      state.checkoutSession = null;
    },
  },
});

export const {
  setCartItems,
  addToCart: addCartItem,
  updateCartQuantity: updateCartItemQuantity,
  removeFromCart,
  removeCartItems,
  clearCart,
  setCheckoutSession,
  clearCheckoutSession,
} = cartSlice.actions;

export default cartSlice.reducer;
