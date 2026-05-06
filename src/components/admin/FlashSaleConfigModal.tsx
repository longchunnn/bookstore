import { Modal, Button, Input } from "antd";
import { useState } from "react";
import type { ApiBook } from "../../utils/apiMappers";

type ConfigPayload = {
  flash_price: string;
  flash_stock: string;
  purchase_limit: string;
};

interface FlashSaleConfigModalProps {
  isOpen: boolean;
  book: ApiBook | null;
  initialConfig?: ConfigPayload;
  onClose: () => void;
  onSubmit: (config: ConfigPayload) => void;
}

export default function FlashSaleConfigModal({
  isOpen,
  book,
  initialConfig,
  onClose,
  onSubmit,
}: FlashSaleConfigModalProps) {
  const [config, setConfig] = useState<ConfigPayload>({
    flash_price: initialConfig?.flash_price ?? "",
    flash_stock: initialConfig?.flash_stock ?? "50",
    purchase_limit: initialConfig?.purchase_limit ?? "1",
  });

  const getBaseConfig = () =>
    initialConfig || {
      flash_price: "",
      flash_stock: "50",
      purchase_limit: "1",
    };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setConfig(getBaseConfig());
    }
  };

  const handleSubmit = () => {
    const price = Number(config.flash_price || 0);
    const stock = Number(config.flash_stock || 0);
    const limit = Number(config.purchase_limit || 1);

    if (!price || price <= 0) {
      alert("Giá flash sale phải > 0");
      return;
    }
    if (book && price >= book.selling_price) {
      alert("Giá flash sale phải thấp hơn giá bán");
      return;
    }
    if (stock < 1) {
      alert("Số lượng phải >= 1");
      return;
    }
    if (limit < 1) {
      alert("Giới hạn mua phải >= 1");
      return;
    }

    onSubmit(config);
    onClose();
  };

  const currentPrice = Number(config.flash_price || 0);
  const discount = book
    ? Math.round(
        ((book.selling_price - currentPrice) / book.selling_price) * 100,
      )
    : 0;

  return (
    <Modal
      title={`Cấu hình Flash Sale: ${book?.title || ""}`}
      open={isOpen}
      afterOpenChange={handleOpenChange}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          Xác nhận
        </Button>,
      ]}
    >
      <div className="space-y-4">
        {book && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="font-semibold text-gray-900">{book.title}</div>
            <div className="mt-1 text-gray-600">
              Giá hiện tại:{" "}
              {new Intl.NumberFormat("vi-VN", {
                style: "currency",
                currency: "VND",
              }).format(book.selling_price)}{" "}
              • Kho: {book.total_stock}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Giá Flash Sale (VND)
          </label>
          <Input
            type="number"
            value={config.flash_price}
            onChange={(e) =>
              setConfig({ ...config, flash_price: e.target.value })
            }
            placeholder="59000"
            min="0"
          />
          {currentPrice > 0 && book && discount > 0 && (
            <div className="mt-1 text-sm text-green-600">
              ✓ Giảm {discount}% so với giá gốc
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Số lượng Flash Sale
          </label>
          <Input
            type="number"
            value={config.flash_stock}
            onChange={(e) =>
              setConfig({ ...config, flash_stock: e.target.value })
            }
            placeholder="50"
            min="1"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Giới hạn mua mỗi user
          </label>
          <Input
            type="number"
            value={config.purchase_limit}
            onChange={(e) =>
              setConfig({ ...config, purchase_limit: e.target.value })
            }
            placeholder="1"
            min="1"
          />
        </div>
      </div>
    </Modal>
  );
}
