import ImageFrame from "../common/ImageFrame";
import { ShoppingCartOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { getAccessToken } from "../../services/axiosClient";
import { useAppDispatch } from "../../app/hooks";
import { addCartItem } from "../../features/cart/cartSlice";
import { isJwtExpired } from "../../utils/jwt";
import { toast } from "react-toastify";
import type { ReactNode } from "react";

export type BookCardData = {
  id: string;
  title: string;
  author?: string;
  categoryName?: string;
  price: string;
  unitPrice?: number;
  oldPrice?: string;
  coverSrc?: string;
  rating?: number;
  ratingCount?: number;
  flashMeta?: string;
};

type Props = {
  data: BookCardData;
  imageHeightClassName?: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: ReactNode;
  };
};

export default function BookCard({
  data,
  action,
  imageHeightClassName,
}: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const safeRating =
    typeof data.rating === "number"
      ? Math.max(0, Math.min(5, data.rating))
      : null;

  const handleAddToCart = () => {
    const token = getAccessToken();
    if (!token || isJwtExpired(token)) {
      navigate("/login");
      return;
    }

    const fallbackPrice = Number(String(data.price).replace(/[^\d]/g, "")) || 0;
    dispatch(
      addCartItem({
        item: {
          id: data.id,
          title: data.title,
          author: data.author,
          categoryName: data.categoryName,
          coverSrc: data.coverSrc,
          unitPrice: data.unitPrice ?? fallbackPrice,
        },
        quantity: 1,
      }),
    );

    toast.success("Thêm giỏ hàng thành công");
  };

  const handleAction = () => {
    if (action) {
      action.onClick();
      return;
    }
    handleAddToCart();
  };

  const actionLabel = action ? action.label : "Thêm giỏ hàng";
  const actionIcon = action ? (
    (action.icon ?? null)
  ) : (
    <ShoppingCartOutlined className="text-base" />
  );

  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow ${data.flashMeta ? "bg-linear-to-b from-white to-teal-100  " : ""}`}
    >
      <Link to={`/book/${data.id}`}>
        <ImageFrame
          src={data.coverSrc}
          alt={data.title}
          heightClassName={imageHeightClassName ?? "h-56"}
        />
      </Link>
      <div className="p-4">
        <Link to={`/book/${data.id}`}>
          <div
            className="font-semibold text-gray-800 truncate hover:text-teal-700 transition-colors"
            title={data.title}
          >
            {data.title}
          </div>
        </Link>
        {data.author ? (
          <div
            className="text-sm text-gray-500 mt-1 truncate"
            title={data.author}
          >
            {data.author}
          </div>
        ) : null}
        {data.flashMeta ? (
          <div className="mt-2 inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
            {data.flashMeta}
          </div>
        ) : null}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0 flex flex-1 items-end gap-2">
            <span className="truncate text-teal-800 font-bold">
              {data.price}
            </span>
            {data.oldPrice ? (
              <span className="shrink-0 text-gray-400 line-through text-xs">
                {data.oldPrice}
              </span>
            ) : null}
          </div>

          {safeRating !== null ? (
            <div
              className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-500"
              title={`Đánh giá ${safeRating.toFixed(1)}/5`}
            >
              <span>★</span>
              <span className="font-semibold">{safeRating.toFixed(1)}</span>
              {data.ratingCount ? (
                <span className="hidden text-gray-500 sm:inline">
                  ({data.ratingCount})
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleAction}
          disabled={Boolean(action?.disabled)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal-700 bg-white px-4 py-2.5 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {actionIcon}
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
