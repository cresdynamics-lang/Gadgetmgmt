export type ScanKind = "imei" | "sku" | "gtin" | "unknown";

export type ScanPayload = {
  code: string;
  kind: ScanKind;
};

export type ScanMatchReason = "imei" | "sku" | "name" | "websiteId" | "skuContains" | "nameContains";

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

/** Letters and digits only, so "iPhone 17" matches NEW-IPHONE-17-256GB. */
export function compactScanText(raw: string) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

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
  if (reason === "name") return 2;
  if (reason === "websiteId") return 3;
  if (reason === "skuContains") return 4;
  return 5;
}

function sortHits<T extends ScanableProduct>(hits: ScanHit<T>[]) {
  return hits.sort((a, b) => rank(a.reason) - rank(b.reason) || a.product.name.localeCompare(b.product.name) || a.product.sku.localeCompare(b.product.sku));
}

export function matchScanProducts<T extends ScanableProduct>(raw: string, products: T[]): ScanHit<T>[] {
  const parsed = parseScanPayload(raw);
  const code = parsed.code;
  if (!code) return [];
  const upper = code.toUpperCase();
  const needle = compactScanText(code);
  const exact: ScanHit<T>[] = [];

  for (const product of products) {
    const sku = product.sku.trim().toUpperCase();
    const skuCompact = compactScanText(product.sku);
    const nameCompact = compactScanText(product.name);
    const imei = (product.imei || "").replace(/\s+/g, "");
    const websiteId = (product.websiteProductId || "").trim().toUpperCase();
    const listing = websiteId ? `${websiteId}::${(product.websiteVariantKey || "base").trim().toUpperCase()}` : "";

    if (imei && imei === code) {
      exact.push({ product, reason: "imei" });
      continue;
    }
    if (sku === upper || (needle.length >= 4 && skuCompact === needle)) {
      exact.push({ product, reason: "sku" });
      continue;
    }
    if (needle.length >= 4 && nameCompact === needle) {
      exact.push({ product, reason: "name" });
      continue;
    }
    if (websiteId && (websiteId === upper || listing === upper || compactScanText(websiteId) === needle || compactScanText(listing) === needle)) {
      exact.push({ product, reason: "websiteId" });
    }
  }

  if (exact.length) return sortHits(exact);
  if (parsed.kind === "imei" || needle.length < 4) return [];

  const contains: ScanHit<T>[] = [];
  for (const product of products) {
    const skuCompact = compactScanText(product.sku);
    const nameCompact = compactScanText(`${product.name} ${product.colour || ""} ${product.brand || ""}`);
    if (skuCompact.includes(needle)) {
      contains.push({ product, reason: "skuContains" });
      continue;
    }
    if (nameCompact.includes(needle)) {
      contains.push({ product, reason: "nameContains" });
    }
  }
  return sortHits(contains);
}
