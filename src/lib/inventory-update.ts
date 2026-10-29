import { websiteCatalogSku } from "./website-catalog";

export type WebsiteUpdateOffer = {
  productIds: string[];
  sku: string;
  sellingPrice: number;
  showOnWebsite: boolean;
  available: number;
  stockOnHand: number;
  colour: string | null;
};

export type WebsiteUpdateRow = {
  key: string;
  websiteProductId: string | null;
  websiteVariantKey: string | null;
  name: string;
  group: string;
  option: string;
  category: string;
  new: WebsiteUpdateOffer | null;
  exUk: WebsiteUpdateOffer | null;
};

export type GroupableProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  condition: string;
  colour: string | null;
  configuration: string | null;
  productGroup: string | null;
  sellingPrice: number;
  showOnWebsite: boolean;
  websiteProductId: string | null;
  websiteVariantKey: string | null;
  stockOnHand: number;
  reservedStock: number;
};

function availableQty(stockOnHand: number, reservedStock: number) {
  return Math.max(0, stockOnHand - reservedStock);
}

function listingKeyFor(product: GroupableProduct) {
  if (product.websiteProductId) {
    return `${product.websiteProductId}::${product.websiteVariantKey || "base"}`;
  }
  return `id:${product.id}`;
}

function mergeOffer(current: WebsiteUpdateOffer | null, product: GroupableProduct): WebsiteUpdateOffer {
  const available = availableQty(product.stockOnHand, product.reservedStock);
  if (!current) {
    return {
      productIds: [product.id],
      sku: product.sku,
      sellingPrice: product.sellingPrice,
      showOnWebsite: product.showOnWebsite,
      available,
      stockOnHand: product.stockOnHand,
      colour: product.colour,
    };
  }
  return {
    productIds: current.productIds.includes(product.id) ? current.productIds : [...current.productIds, product.id],
    sku: current.sku,
    sellingPrice: current.sellingPrice,
    showOnWebsite: current.showOnWebsite || product.showOnWebsite,
    available: current.available + available,
    stockOnHand: current.stockOnHand + product.stockOnHand,
    colour: current.colour || product.colour,
  };
}

export function groupWebsiteUpdateRows(products: GroupableProduct[]): WebsiteUpdateRow[] {
  const rows = new Map<string, WebsiteUpdateRow>();

  for (const product of products) {
    if (product.condition === "TRADE_IN") continue;
    const key = listingKeyFor(product);
    const option = product.configuration || product.colour || "Single price";
    const existing = rows.get(key) ?? {
      key,
      websiteProductId: product.websiteProductId,
      websiteVariantKey: product.websiteProductId ? product.websiteVariantKey || "base" : null,
      name: product.name,
      group: product.productGroup || product.category,
      option,
      category: product.category,
      new: null,
      exUk: null,
    };

    if (product.condition === "EX_UK") {
      existing.exUk = mergeOffer(existing.exUk, product);
      if (!existing.new) {
        existing.name = product.name;
        existing.option = option;
      }
    } else {
      existing.new = mergeOffer(existing.new, product);
      existing.name = product.name;
      existing.option = option;
    }
    rows.set(key, existing);
  }

  return [...rows.values()].sort((a, b) => {
    const mapped = Number(Boolean(b.websiteProductId)) - Number(Boolean(a.websiteProductId));
    if (mapped) return mapped;
    return a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.option.localeCompare(b.option);
  });
}

export function siblingSku(sourceSku: string, condition: "NEW" | "EX_UK") {
  const sku = sourceSku.trim().toUpperCase();
  if (condition === "EX_UK") {
    if (/-EX-UK$/.test(sku)) return sku.slice(0, 64);
    if (/-NEW$/.test(sku)) return sku.replace(/-NEW$/, "-EX-UK").slice(0, 64);
    return `${sku}-EX-UK`.slice(0, 64);
  }
  if (/-NEW$/.test(sku)) return sku.slice(0, 64);
  if (/-EX-UK$/.test(sku)) return sku.replace(/-EX-UK$/, "-NEW").slice(0, 64);
  return `${sku}-NEW`.slice(0, 64);
}

export function catalogSiblingSku(
  websiteProductId: string | null | undefined,
  websiteVariantKey: string | null | undefined,
  sourceSku: string,
  condition: "NEW" | "EX_UK",
) {
  if (websiteProductId) {
    return websiteCatalogSku(
      {
        group: "",
        category: "iPad",
        name: "",
        configuration: "",
        websiteProductId,
        websiteVariantKey: websiteVariantKey || "base",
        priceKes: 1,
      },
      condition,
    );
  }
  return siblingSku(sourceSku, condition);
}
