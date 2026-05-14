import type { SavedAddress } from "../features/session/sessionSlice";

function getDefaultAddress(
  addresses: SavedAddress[],
  selectedAddressId?: string | null,
): SavedAddress | null {
  if (!addresses.length) return null;
  return (
    addresses.find((address) => selectedAddressId && address.id === selectedAddressId) ??
    addresses.find((address) => address.isDefault) ??
    null
  );
}

export function getDefaultShippingAddress(
  addresses: SavedAddress[],
  selectedAddressId?: string | null,
): SavedAddress | null {
  const address = getDefaultAddress(addresses, selectedAddressId);
  if (!address) return null;

  const hasRequiredAddress = Boolean(
    address.addressLine?.trim() &&
      address.provinceName?.trim() &&
      address.districtName?.trim() &&
      address.wardName?.trim(),
  );

  return hasRequiredAddress ? address : null;
}

export function formatShippingAddress(address: SavedAddress): string {
  return [
    address.fullName ? `Người nhận: ${address.fullName}` : "",
    address.phone ? `SĐT: ${address.phone}` : "",
    [
      address.addressLine,
      address.wardName,
      address.districtName,
      address.provinceName,
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" - ");
}
