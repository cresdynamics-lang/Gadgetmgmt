export type ScannableDevice = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
};

export type ScannableProduct = {
  id: string;
  sku: string;
  name: string;
  available: number;
  devices?: readonly ScannableDevice[];
};

export type SaleScanCode = {
  raw?: string | null;
  imei?: string | null;
  imei2?: string | null;
  serialNumber?: string | null;
  productCode?: string | null;
};

export type SaleScanMatch =
  | { status: "device"; productId: string; identifier: string }
  | { status: "sku"; productId: string }
  | { status: "unavailable"; name: string }
  | { status: "unknown" };

function compact(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

function sameIdentifier(left: string | null | undefined, right: string) {
  if (!left) return false;
  return compact(left) === compact(right);
}

export function matchSaleScan(products: readonly ScannableProduct[], code: SaleScanCode): SaleScanMatch {
  const identifiers = [code.imei, code.imei2, code.serialNumber, code.raw].filter((value): value is string => Boolean(value?.trim()));
  for (const identifier of identifiers) {
    const product = products.find((item) => item.devices?.some((device) =>
      sameIdentifier(device.imei, identifier)
      || sameIdentifier(device.imei2, identifier)
      || sameIdentifier(device.serialNumber, identifier)));
    if (!product) continue;
    if (product.available < 1) return { status: "unavailable", name: product.name };
    return { status: "device", productId: product.id, identifier: identifier.trim() };
  }

  const skuCandidates = [code.productCode, code.raw].filter((value): value is string => Boolean(value?.trim()));
  for (const candidate of skuCandidates) {
    const needle = candidate.trim().toLowerCase();
    const product = products.find((item) => item.sku.toLowerCase() === needle);
    if (!product) continue;
    if (product.available < 1) return { status: "unavailable", name: product.name };
    return { status: "sku", productId: product.id };
  }

  return { status: "unknown" };
}
