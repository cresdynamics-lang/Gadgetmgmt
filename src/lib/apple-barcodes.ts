/**
 * Apple does not publish a public UPC/GTIN catalogue. Identity for a scan comes from:
 * - Model number (A-number) on the device / SIM tray / USB-C port — Apple Support 108044 / 109525
 * - Marketing part number (MPN) on the sealed box and in Settings → About, e.g. MG8G4ZA/A
 * - Retail GTIN (EAN-13 / UPC-A / GS1 AI 01) on the box, stored on Product.gtin after the first receive
 * - Serial on the box Code 128, often prefixed with S (the S is not part of the serial)
 *
 * New and Ex-UK of the same model share these codes. Staff mark the condition when receiving.
 * Ex-UK units are often scanned by IMEI or A-number because the retail box is missing.
 */

export type AppleDeviceCategory = "iPhone" | "iPad" | "Mac" | "AirPods" | "Apple Watch" | "Apple accessories";

export type AppleDeviceIdentity = {
  group: string;
  category: AppleDeviceCategory;
  name: string;
  websiteProductId?: string;
  websiteVariantKey?: string;
  modelNumber?: string;
  matchedBy: "model" | "mpn" | "gtin";
};

type CatalogRow = {
  group: string;
  category: AppleDeviceCategory;
  websiteProductId?: string;
  websiteVariantKey?: string;
};

function row(group: string, category: AppleDeviceCategory, extra: Partial<CatalogRow> = {}): CatalogRow {
  return { group, category, ...extra };
}

/** Official Apple A-numbers → shop listing group. Same codes for New and Ex-UK. */
const appleModelCatalog: Record<string, CatalogRow> = {};

function addModels(codes: string[], identity: CatalogRow) {
  for (const code of codes) appleModelCatalog[code.toUpperCase()] = identity;
}

addModels(["A3257", "A3525", "A3527", "A3526"], row("iPhone 17 Pro Max", "iPhone"));
addModels(["A3256", "A3522", "A3524", "A3523"], row("iPhone 17 Pro", "iPhone"));
addModels(["A3258", "A3519", "A3521", "A3520"], row("iPhone 17", "iPhone"));
addModels(["A3575", "A3635", "A3634"], row("iPhone 17e", "iPhone"));
addModels(["A3260", "A3516", "A3518", "A3517"], row("iPhone Air", "iPhone"));
addModels(["A3084", "A3295", "A3297", "A3296"], row("iPhone 16 Pro Max", "iPhone"));
addModels(["A3083", "A3292", "A3294", "A3293"], row("iPhone 16 Pro", "iPhone"));
addModels(["A3082", "A3289", "A3291", "A3290"], row("iPhone 16 Plus", "iPhone"));
addModels(["A3081", "A3286", "A3288", "A3287"], row("iPhone 16", "iPhone"));
addModels(["A3212", "A3408", "A3410", "A3409"], row("iPhone 16e", "iPhone"));
addModels(["A2849", "A3105", "A3108", "A3106"], row("iPhone 15 Pro Max", "iPhone"));
addModels(["A2848", "A3101", "A3104", "A3102"], row("iPhone 15 Pro", "iPhone"));
addModels(["A2847", "A3093", "A3096", "A3094"], row("iPhone 15 Plus", "iPhone"));
addModels(["A2846", "A3089", "A3092", "A3090"], row("iPhone 15", "iPhone"));
addModels(["A2651", "A2893", "A2896", "A2895", "A2894"], row("iPhone 14 Pro Max", "iPhone"));
addModels(["A2650", "A2889", "A2892", "A2891", "A2890"], row("iPhone 14 Pro", "iPhone"));
addModels(["A2632", "A2885", "A2888", "A2887", "A2886"], row("iPhone 14 Plus", "iPhone"));
addModels(["A2649", "A2881", "A2884", "A2883", "A2882"], row("iPhone 14", "iPhone"));
addModels(["A2595", "A2782", "A2784", "A2785", "A2783"], row("iPhone SE (3rd gen)", "iPhone"));
addModels(["A2484", "A2641", "A2644", "A2645", "A2643"], row("iPhone 13 Pro Max", "iPhone"));
addModels(["A2483", "A2636", "A2639", "A2640", "A2638"], row("iPhone 13 Pro", "iPhone"));
addModels(["A2482", "A2631", "A2634", "A2635", "A2633"], row("iPhone 13", "iPhone"));
addModels(["A2481", "A2626", "A2629", "A2630", "A2628"], row("iPhone 13 mini", "iPhone"));
addModels(["A2342", "A2410", "A2412", "A2411"], row("iPhone 12 Pro Max", "iPhone"));
addModels(["A2341", "A2406", "A2408", "A2407"], row("iPhone 12 Pro", "iPhone"));
addModels(["A2172", "A2402", "A2404", "A2403"], row("iPhone 12", "iPhone"));
addModels(["A2176", "A2398", "A2400", "A2399"], row("iPhone 12 mini", "iPhone"));
addModels(["A2160", "A2217", "A2215"], row("iPhone 11 Pro", "iPhone"));
addModels(["A2161", "A2220", "A2218"], row("iPhone 11 Pro Max", "iPhone"));
addModels(["A2111", "A2223", "A2221"], row("iPhone 11", "iPhone"));

addModels(["A3063", "A3064", "A3065"], row("AirPods Pro 3", "AirPods", { websiteProductId: "airpods-pro-3", websiteVariantKey: "base" }));
addModels(["A3047", "A3048", "A3049", "A2931", "A2699", "A2698"], row("AirPods Pro 2", "AirPods", { websiteProductId: "airpods-pro-2", websiteVariantKey: "base" }));
addModels(["A3056", "A3055", "A3057"], row("AirPods 4 ANC", "AirPods", { websiteProductId: "airpods-4-anc", websiteVariantKey: "base" }));
addModels(["A3053", "A3050", "A3054"], row("AirPods 4", "AirPods", { websiteProductId: "airpods-4", websiteVariantKey: "base" }));
addModels(["A2565", "A2564"], row("AirPods (3rd gen)", "AirPods", { websiteProductId: "airpods-3", websiteVariantKey: "base" }));
addModels(["A3454"], row("AirPods Max 2026 USB-C", "AirPods", { websiteProductId: "airpods-max-2", websiteVariantKey: "base" }));
addModels(["A3184", "A2096"], row("AirPods Max", "AirPods"));

/**
 * Retail GTINs (EAN-13 / UPC-A) are not published by Apple. After a staff member
 * confirms the product on first receive, the scanned GTIN is stored on Product.gtin
 * and later scans match that stored code.
 */
const appleGtinCatalog: Record<string, CatalogRow> = {};

export function normalizeGtin(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 12 || digits.length === 13 || digits.length === 14) {
    return digits.padStart(14, "0");
  }
  return "";
}

/** Apple marketing part number printed on the box, e.g. MG8G4ZA/A or MRY63LL/A. */
export function isAppleMpn(raw: string) {
  return /^[A-Z]{1,2}[A-Z0-9]{3,6}([A-Z]{1,2})?\/A$/i.test(String(raw || "").trim());
}

export function isAppleModelNumber(raw: string) {
  return /^A\d{4}$/i.test(String(raw || "").trim());
}

/** Box barcodes of serials often prepend S, which Apple says is not part of the serial. */
export function appleSerialFromScan(raw: string) {
  const code = String(raw || "").trim().toUpperCase().replace(/^S(?=[A-Z0-9]{8,12}$)/, "");
  if (/^[A-Z0-9]{8,12}$/.test(code) && !/^\d+$/.test(code) && !isAppleModelNumber(code) && !isAppleMpn(raw)) {
    return code;
  }
  return "";
}

export function suggestedConditionFromMpn(mpn: string): "NEW" | "EX_UK" | null {
  const letter = mpn.trim().toUpperCase()[0];
  if (letter === "F") return "EX_UK";
  if (letter === "M") return "NEW";
  return null;
}

function toIdentity(catalog: CatalogRow, matchedBy: AppleDeviceIdentity["matchedBy"], modelNumber?: string): AppleDeviceIdentity {
  return {
    group: catalog.group,
    category: catalog.category,
    name: catalog.group,
    websiteProductId: catalog.websiteProductId,
    websiteVariantKey: catalog.websiteVariantKey,
    modelNumber,
    matchedBy,
  };
}

export function lookupAppleIdentity(raw: string): AppleDeviceIdentity | null {
  const original = String(raw || "").trim();
  const code = original.toUpperCase().replace(/\s+/g, "");
  if (!code) return null;

  const model = code.match(/A\d{4}/)?.[0];
  if (model && appleModelCatalog[model]) return toIdentity(appleModelCatalog[model], "model", model);

  const named = appleModelKey(original);
  if (named) {
    for (const [modelNumber, catalog] of Object.entries(appleModelCatalog)) {
      if (appleModelKey(catalog.group) === named) return toIdentity(catalog, "model", modelNumber);
    }
  }

  const gtin = normalizeGtin(code);
  if (gtin && appleGtinCatalog[gtin]) return toIdentity(appleGtinCatalog[gtin], "gtin");

  const mpn = original.toUpperCase().match(/\b([A-Z]{1,2}[A-Z0-9]{3,6}(?:[A-Z]{1,2})?\/A)\b/)?.[1] || "";
  if (mpn && isAppleMpn(mpn)) {
    return {
      group: "Apple device",
      category: "iPhone",
      name: `Apple part ${mpn}`,
      matchedBy: "mpn",
    };
  }
  return null;
}

const IPHONE_MODEL = /iphone(?:\s+se(?:\s*\((?:2nd|3rd)\s*gen\))?|\s+air|\s+\d+[a-z]?(?:\s+pro\s+max|\s+pro|\s+plus|\s+mini|e)?)/i;
const siblingSuffix = /^(pro max|pro|plus|mini|air|anc|usb-c|max)\b/i;

export function appleModelKey(label: string) {
  const n = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const found = n.match(IPHONE_MODEL);
  return found ? found[0].replace(/\s+/g, " ").trim() : "";
}

export function nameMatchesAppleGroup(name: string, group: string) {
  const n = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const g = String(group || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || !g) return false;
  const nameKey = appleModelKey(n);
  const groupKey = appleModelKey(g);
  if (nameKey && groupKey) return nameKey === groupKey;
  if (n === g) return true;
  if (!n.startsWith(`${g} `) && !n.startsWith(`${g}(`) && !n.startsWith(`${g} (`)) return false;
  const rest = n.slice(g.length).replace(/^[\s(\-]+/, "");
  if (siblingSuffix.test(rest) && !siblingSuffix.test(g.split(" ").slice(-2).join(" ")) && !siblingSuffix.test(g.split(" ").pop() || "")) return false;
  return true;
}

export type CatalogMatchable = {
  name: string;
  category: string;
  condition: string;
  productGroup?: string | null;
  websiteProductId?: string | null;
  websiteVariantKey?: string | null;
};

export function productMatchesAppleIdentity<T extends CatalogMatchable>(product: T, identity: AppleDeviceIdentity, condition?: string) {
  if (condition && product.condition !== condition) return false;
  if (identity.websiteProductId && product.websiteProductId === identity.websiteProductId) {
    if (!identity.websiteVariantKey || product.websiteVariantKey === identity.websiteVariantKey) return true;
  }
  if (product.productGroup && product.productGroup === identity.group) return true;
  return nameMatchesAppleGroup(product.name, identity.group) && (!product.category || product.category === identity.category || identity.category === "iPhone");
}

export function appleCatalogHint(identity: AppleDeviceIdentity | null) {
  if (!identity) return null;
  return {
    group: identity.group,
    category: identity.category,
    name: identity.name,
    websiteProductId: identity.websiteProductId ?? null,
    websiteVariantKey: identity.websiteVariantKey ?? null,
    modelNumber: identity.modelNumber ?? null,
    matchedBy: identity.matchedBy,
  };
}
