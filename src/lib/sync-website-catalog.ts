import type { PrismaClient } from "@prisma/client";

import {
  listingKey,
  websiteCatalogListings,
  websiteCatalogSku,
  type WebsiteCatalogListing,
} from "./website-catalog";

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/["″]/g, "in").replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesListing(
  product: {
    sku: string;
    name: string;
    productGroup: string | null;
    configuration: string | null;
    websiteProductId: string | null;
    websiteVariantKey: string | null;
  },
  listing: WebsiteCatalogListing,
) {
  if (product.websiteProductId === listing.websiteProductId && (product.websiteVariantKey || "base") === listing.websiteVariantKey) {
    return true;
  }
  if (product.sku === websiteCatalogSku(listing)) return true;
  if (normalize(product.name) === normalize(listing.name)) return true;
  const group = normalize(product.productGroup);
  const config = normalize(product.configuration);
  return group === normalize(listing.group) && config === normalize(listing.configuration);
}

const managedCategories = ["iPad", "Mac", "AirPods", "Apple Watch", "Apple accessories"];

export async function syncWebsiteCatalog(prisma: PrismaClient, branchId: string) {
  const existing = await prisma.product.findMany({
    where: { branchId, condition: "NEW" },
    select: {
      id: true,
      sku: true,
      name: true,
      productGroup: true,
      configuration: true,
      websiteProductId: true,
      websiteVariantKey: true,
      category: true,
      showOnWebsite: true,
    },
  });

  const claimed = new Set<string>();
  let created = 0;
  let updated = 0;
  let hidden = 0;

  for (const listing of websiteCatalogListings) {
    const sku = websiteCatalogSku(listing);
    const match = existing.find((product) => !claimed.has(product.id) && matchesListing(product, listing));
    if (match) claimed.add(match.id);

    const product = match
      ? await prisma.product.update({
          where: { id: match.id },
          data: {
            name: listing.name,
            productGroup: listing.group,
            configuration: listing.configuration || null,
            category: listing.category,
            brand: "Apple",
            websiteProductId: listing.websiteProductId,
            websiteVariantKey: listing.websiteVariantKey,
            showOnWebsite: listing.listed !== false,
          },
          select: { id: true },
        })
      : await prisma.product.create({
          data: {
            sku,
            name: listing.name,
            productGroup: listing.group,
            configuration: listing.configuration || null,
            category: listing.category,
            brand: "Apple",
            condition: "NEW",
            costPrice: 0,
            sellingPrice: 0,
            websiteProductId: listing.websiteProductId,
            websiteVariantKey: listing.websiteVariantKey,
            showOnWebsite: listing.listed !== false,
            branchId,
          },
          select: { id: true },
        });

    if (match) updated += 1;
    else created += 1;

    await prisma.inventoryItem.upsert({
      where: { branchId_productId: { branchId, productId: product.id } },
      update: {},
      create: { branchId, productId: product.id, stockOnHand: 0 },
    });
  }

  const listed = new Set(websiteCatalogListings.map(listingKey));
  const extras = existing.filter((product) => {
    if (claimed.has(product.id)) return false;
    if (!managedCategories.includes(product.category)) return false;
    const key = product.websiteProductId ? `${product.websiteProductId}::${product.websiteVariantKey || "base"}` : "";
    if (key && listed.has(key)) return false;
    return true;
  });

  if (extras.length) {
    const result = await prisma.product.updateMany({
      where: { id: { in: extras.map((product) => product.id) }, showOnWebsite: true },
      data: { showOnWebsite: false },
    });
    hidden = result.count;
  }

  return { created, updated, hidden, listed: websiteCatalogListings.length };
}
