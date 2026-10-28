import type { PrismaClient } from "@prisma/client";

import {
  WEBSITE_MANAGED_GROUPS,
  isManagedAccessoryId,
  listingKey,
  websiteCatalogListings,
} from "./website-catalog";

export type WebsiteCatalogVariant = {
  key: string;
  priceKes: number;
  inStock: boolean;
  showOnWebsite: boolean;
  available: number;
  sku: string;
  productId: string;
  name: string;
  condition: "NEW" | "EX_UK";
  colour: string | null;
};

export type WebsiteCatalogItem = {
  id: string;
  name: string;
  group: string;
  category: string;
  showOnWebsite: boolean;
  inStock: boolean;
  priceKes: number;
  variants: WebsiteCatalogVariant[];
};

function availableQty(stockOnHand: number, reservedStock: number) {
  return Math.max(0, stockOnHand - reservedStock);
}

export async function buildWebsiteCatalogFeed(prisma: PrismaClient): Promise<{
  source: "gadgetmgmt";
  generatedAt: string;
  managedGroups: string[];
  managedAccessoryPrefixes: string[];
  items: WebsiteCatalogItem[];
}> {
  const products = await prisma.product.findMany({
    where: {
      condition: { in: ["NEW", "EX_UK"] },
      websiteProductId: { not: null },
    },
    include: {
      inventory: { select: { stockOnHand: true, reservedStock: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const byProduct = new Map<string, WebsiteCatalogItem>();
  for (const product of products) {
    const websiteProductId = product.websiteProductId;
    if (!websiteProductId) continue;
    const variantKey = product.websiteVariantKey || "base";
    const available = product.inventory.reduce((sum, row) => sum + availableQty(row.stockOnHand, row.reservedStock), 0);
    const inStock = available > 0;
    const existing = byProduct.get(websiteProductId) ?? {
      id: websiteProductId,
      name: product.productGroup || product.name,
      group: websiteGroupForCategory(product.category),
      category: product.category,
      showOnWebsite: false,
      inStock: false,
      priceKes: product.sellingPrice,
      variants: [],
    };
    existing.variants.push({
      key: variantKey,
      priceKes: product.sellingPrice,
      inStock,
      showOnWebsite: product.showOnWebsite,
      available,
      sku: product.sku,
      productId: product.id,
      name: product.name,
      condition: product.condition === "EX_UK" ? "EX_UK" : "NEW",
      colour: product.colour?.trim() || null,
    });
    byProduct.set(websiteProductId, existing);
  }

  const items = [...byProduct.values()].map((item) => {
    const visible = item.variants.filter((variant) => variant.showOnWebsite);
    const visibleNew = visible.filter((variant) => variant.condition !== "EX_UK");
    const pool = visibleNew.length ? visibleNew : visible;
    const inStock = visibleNew.some((variant) => variant.inStock);
    const priceKes = pool.length ? Math.min(...pool.map((variant) => variant.priceKes)) : item.priceKes;
    return {
      ...item,
      showOnWebsite: pool.length > 0,
      inStock,
      priceKes,
    };
  });

  return {
    source: "gadgetmgmt",
    generatedAt: new Date().toISOString(),
    managedGroups: [...WEBSITE_MANAGED_GROUPS],
    managedAccessoryPrefixes: ["pencil-", "keyboard-", "mouse-"],
    items,
  };
}

function websiteGroupForCategory(category: string) {
  if (category === "iPad") return "iPad";
  if (category === "Mac") return "Mac";
  if (category === "AirPods") return "AirPods";
  if (category === "Apple Watch") return "Watch";
  return "Accessories";
}

export function listedWebsiteKeys() {
  return new Set(websiteCatalogListings.map(listingKey));
}

export { isManagedAccessoryId };
