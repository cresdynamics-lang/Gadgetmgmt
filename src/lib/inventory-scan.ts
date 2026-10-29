export type ScanKind = "imei" | "sku" | "gtin" | "unknown";

export type ScanPayload = {
  code: string;
  kind: ScanKind;
};

export type ScanMatchReason = "imei" | "sku" | "websiteId" | "skuContains";

export type ScanableProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  condition: string;
  colour: string | null;
  imei: string | null;
  websiteProductId: string | null;
  websiteVariantKey: string | null;
};

export type ScanHit<T extends ScanableProduct = ScanableProduct> = {
  product: T;
  reason: ScanMatchReason;
};

const GS1_FNC1 = /[\u001d\u001e]/g;

export function normalizeScanCode(raw: string) {
  return String(raw || "")
    .replace(GS1_FNC1, "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "");
}

export function parseScanPayload(raw: string): ScanPayload {
  let code = normalizeScanCode(raw);
  if (!code) return { code: "", kind: "unknown" };

  code = code.replace(/^\][A-Za-z0-9]{2}/, "");
  const ai01 = code.match(/^\(?01\)?(\d{14})/);
  if (ai01?.[1]) return { code: ai01[1], kind: "gtin" };
  if (/^\d{15}$/.test(code)) return { code, kind: "imei" };
  if (/^\d{8}$|^\d{12,14}$/.test(code)) return { code, kind: "gtin" };
  return { code, kind: "sku" };
}

function rank(reason: ScanMatchReason) {
  if (reason === "imei") return 0;
  if (reason === "sku") return 1;
  if (reason === "websiteId") return 2;
  return 3;
}

export function matchScanProducts<T extends ScanableProduct>(raw: string, products: T[]): ScanHit<T>[] {
  const { code } = parseScanPayload(raw);
  if (!code) return [];
  const upper = code.toUpperCase();
  const hits: ScanHit<T>[] = [];

  for (const product of products) {
    const sku = product.sku.trim().toUpperCase();
    const imei = (product.imei || "").replace(/\s+/g, "");
    const websiteId = (product.websiteProductId || "").trim().toUpperCase();
    const listing = websiteId ? `${websiteId}::${(product.websiteVariantKey || "base").trim().toUpperCase()}` : "";

    if (imei && imei === code) {
      hits.push({ product, reason: "imei" });
      continue;
    }
    if (sku === upper) {
      hits.push({ product, reason: "sku" });
      continue;
    }
    if (websiteId && (websiteId === upper || listing === upper)) {
      hits.push({ product, reason: "websiteId" });
    }
  }

  if (hits.length) {
    return hits.sort((a, b) => rank(a.reason) - rank(b.reason) || a.product.name.localeCompare(b.product.name));
  }

  if (upper.length < 4) return [];
  for (const product of products) {
    if (product.sku.toUpperCase().includes(upper)) {
      hits.push({ product, reason: "skuContains" });
    }
  }
  return hits.sort((a, b) => a.product.sku.length - b.product.sku.length || a.product.name.localeCompare(b.product.name));
}
