import {
  isAppleModelNumber,
  isAppleMpn,
  lookupAppleIdentity,
  normalizeGtin,
  productMatchesAppleIdentity,
  type AppleDeviceIdentity,
} from "@/lib/apple-barcodes";
import { parseDeviceScan, scanLookupCode } from "@/lib/device-scan";

export type ScanKind = "imei" | "sku" | "gtin" | "mpn" | "model" | "serial" | "unknown";

export type ScanPayload = {
  code: string;
  kind: ScanKind;
};

export type ScanMatchReason = "imei" | "gtin" | "mpn" | "sku" | "name" | "catalog" | "websiteId" | "skuContains" | "nameContains";

export type ScanableProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  condition: string;
  colour: string | null;
  imei: string | null;
  gtin?: string | null;
  mpn?: string | null;
  productGroup?: string | null;
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
  const extracted = scanLookupCode(raw);
  if (extracted.kind !== "unknown") return { code: extracted.code, kind: extracted.kind };

  let code = normalizeScanCode(raw);
  if (!code) return { code: "", kind: "unknown" };

  code = code.replace(/^\][A-Za-z0-9]{2}/, "");
  const ai01 = code.match(/^\(?01\)?(\d{14})/);
  if (ai01?.[1]) return { code: ai01[1], kind: "gtin" };
  if (/^\d{15}$/.test(code)) return { code, kind: "imei" };
  if (isAppleModelNumber(code)) return { code: code.toUpperCase(), kind: "model" };
  if (isAppleMpn(code)) return { code: code.toUpperCase(), kind: "mpn" };
  if (/^S[A-Z0-9]{8,12}$/i.test(code)) return { code: code.slice(1).toUpperCase(), kind: "serial" };
  if (/^\d{8}$|^\d{12,14}$/.test(code)) return { code, kind: "gtin" };
  return { code, kind: "sku" };
}

export function preferStorageHits<T extends ScanableProduct>(hits: ScanHit<T>[], storage?: string | null) {
  const compact = compactScanText(storage || "");
  if (!compact || !hits.length) return hits;
  const filtered = hits.filter((hit) => compactScanText(`${hit.product.name} ${hit.product.sku}`).includes(compact));
  return filtered;
}

function rank(reason: ScanMatchReason) {
  if (reason === "imei") return 0;
  if (reason === "gtin") return 1;
  if (reason === "mpn") return 2;
  if (reason === "sku") return 3;
  if (reason === "name") return 4;
  if (reason === "catalog") return 5;
  if (reason === "websiteId") return 6;
  if (reason === "skuContains") return 7;
  return 8;
}

function sortHits<T extends ScanableProduct>(hits: ScanHit<T>[]) {
  return hits.sort((a, b) => rank(a.reason) - rank(b.reason) || a.product.name.localeCompare(b.product.name) || a.product.sku.localeCompare(b.product.sku));
}

export function filterHitsByCondition<T extends ScanableProduct>(hits: ScanHit<T>[], condition?: string | null) {
  if (!condition) return hits;
  return hits.filter((hit) => hit.product.condition === condition);
}

export function matchScanProducts<T extends ScanableProduct>(
  raw: string,
  products: T[],
  options: { condition?: string | null; identity?: AppleDeviceIdentity | null } = {},
): ScanHit<T>[] {
  const parsed = parseScanPayload(raw);
  const device = parseDeviceScan(raw);
  const code = parsed.code;
  if (!code && !device.modelNumber && !device.name) return [];
  const upper = (code || device.modelNumber || device.imei).toUpperCase();
  const needle = compactScanText(code || device.name);
  const gtin = parsed.kind === "gtin" ? normalizeGtin(code) : "";
  const identity = options.identity ?? lookupAppleIdentity([raw, device.modelNumber, device.mpn, device.name].filter(Boolean).join(" "));
  const exact: ScanHit<T>[] = [];
  const seen = new Set<string>();

  function push(product: T, reason: ScanMatchReason) {
    if (options.condition && product.condition !== options.condition) return;
    if (seen.has(product.id)) return;
    seen.add(product.id);
    exact.push({ product, reason });
  }

  for (const product of products) {
    const sku = product.sku.trim().toUpperCase();
    const skuCompact = compactScanText(product.sku);
    const nameCompact = compactScanText(product.name);
    const imei = (product.imei || "").replace(/\s+/g, "");
    const websiteId = (product.websiteProductId || "").trim().toUpperCase();
    const listing = websiteId ? `${websiteId}::${(product.websiteVariantKey || "base").trim().toUpperCase()}` : "";
    const productGtin = product.gtin ? normalizeGtin(product.gtin) : "";
    const productMpn = (product.mpn || "").trim().toUpperCase();

    if (imei && (imei === code || imei === upper)) {
      push(product, "imei");
      continue;
    }
    if (gtin && productGtin && productGtin === gtin) {
      push(product, "gtin");
      continue;
    }
    if (parsed.kind === "mpn" && productMpn && productMpn === upper) {
      push(product, "mpn");
      continue;
    }
    if (sku === upper || (needle.length >= 4 && skuCompact === needle)) {
      push(product, "sku");
      continue;
    }
    if (needle.length >= 4 && nameCompact === needle) {
      push(product, "name");
      continue;
    }
    if (websiteId && (websiteId === upper || listing === upper || compactScanText(websiteId) === needle || compactScanText(listing) === needle)) {
      push(product, "websiteId");
    }
  }

  if (identity) {
    for (const product of products) {
      if (productMatchesAppleIdentity(product, identity, options.condition || undefined)) {
        push(product, "catalog");
      }
    }
  }

  if (exact.length) return preferStorageHits(sortHits(exact), device.storage);
  if (parsed.kind === "imei" && !identity) return [];
  if (needle.length < 4 && !identity) return [];

  const contains: ScanHit<T>[] = [];
  for (const product of products) {
    if (options.condition && product.condition !== options.condition) continue;
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
  return preferStorageHits(sortHits(contains), device.storage);
}
