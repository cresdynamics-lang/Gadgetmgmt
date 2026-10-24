import type { PrismaClient, ProductCondition } from "@prisma/client";

/**
 * Shop price list (Victor Gadgets Hub, 24 Oct 2026). Selling prices in KES.
 * Seeding only creates missing products, so prices edited in the app are never overwritten.
 * Buying (cost) prices were not supplied and start at 0 for the owner to fill in.
 */
// `sku` points an entry at a product that already exists under an older code.
type PriceEntry = { group: string; category: string; condition: ProductCondition; configuration: string; price: number; sku?: string };

const k = (thousands: number) => thousands * 1000;

export const priceList: PriceEntry[] = [
  // iPhone 17, new
  { group: "iPhone 17", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(124) },
  { group: "iPhone 17 Pro", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(158) },
  { group: "iPhone 17 Pro", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(185) },
  { group: "iPhone 17 Pro Max", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(170) },
  { group: "iPhone 17 Pro Max", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(195) },

  // Ex-UK iPhones
  { group: "iPhone 11", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(24) },
  { group: "iPhone 11", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(28) },
  { group: "iPhone 11 Pro", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(32) },
  { group: "iPhone 11 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(35) },
  { group: "iPhone 11 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(32) },
  { group: "iPhone 11 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(37) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(33) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(35) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(40) },
  { group: "iPhone 12 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(42) },
  { group: "iPhone 12 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(47) },
  { group: "iPhone 12 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(46) },
  { group: "iPhone 12 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(50) },
  { group: "iPhone 13", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(43) },

  // iPad Pro M5, new
  { group: "iPad Pro 11\" M5", category: "iPad", condition: "NEW", configuration: "256GB · 5G", price: k(165) },
  { group: "iPad Pro 11\" M5", category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(157) },
  { group: "iPad Pro 11\" M5", category: "iPad", condition: "NEW", configuration: "512GB · 5G", price: k(215) },
  { group: "iPad Pro 13\" M5", category: "iPad", condition: "NEW", configuration: "256GB · 5G", price: k(180) },
  { group: "iPad Pro 13\" M5", category: "iPad", condition: "NEW", configuration: "512GB · 5G", price: k(215) },
  { group: "iPad Pro 13\" M5", category: "iPad", condition: "NEW", configuration: "1TB · 5G", price: k(258) },

  // Apple Watch, new
  { group: "Apple Watch Series 12", category: "Apple Watch", condition: "NEW", configuration: "46mm", price: k(67) },
  { group: "Apple Watch Series 12", category: "Apple Watch", condition: "NEW", configuration: "42mm", price: k(60) },
  { group: "Apple Watch Series 11", category: "Apple Watch", condition: "NEW", configuration: "46mm", price: k(55) },
  { group: "Apple Watch Series 11", category: "Apple Watch", condition: "NEW", configuration: "42mm", price: k(50) },
  { group: "Apple Watch SE 3", category: "Apple Watch", condition: "NEW", configuration: "44mm", price: k(43) },
  { group: "Apple Watch SE 3", category: "Apple Watch", condition: "NEW", configuration: "41mm", price: k(38) },

  // AirPods, new
  { group: "AirPods Pro 3", category: "AirPods", condition: "NEW", configuration: "", price: k(35) },
  { group: "AirPods Pro 2", category: "AirPods", condition: "NEW", configuration: "", price: k(30), sku: "APP-PRO-2" },
  { group: "AirPods 4 ANC", category: "AirPods", condition: "NEW", configuration: "", price: k(31) },
  { group: "AirPods 4", category: "AirPods", condition: "NEW", configuration: "", price: k(22) },
  { group: "AirPods (3rd gen)", category: "AirPods", condition: "NEW", configuration: "", price: k(21) },
];

export function priceListSku(entry: PriceEntry) {
  if (entry.sku) return entry.sku;
  const base = `${entry.group}-${entry.configuration}`.toUpperCase().replace(/"/g, "IN").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${entry.condition === "EX_UK" ? "EXUK" : "NEW"}-${base}`;
}

export function priceListName(entry: PriceEntry) {
  return [entry.group, entry.configuration.replace(" · ", " "), entry.condition === "EX_UK" ? "(Ex-UK)" : ""].filter(Boolean).join(" ");
}

/** Create any missing price-list products and their stock rows. Existing prices are left as edited. */
export async function seedPriceList(prisma: PrismaClient, branchId: string) {
  let created = 0;
  for (const entry of priceList) {
    const sku = priceListSku(entry);
    const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    const product = existing ?? await prisma.product.create({
      data: {
        sku,
        name: priceListName(entry),
        productGroup: entry.group,
        configuration: entry.configuration || null,
        category: entry.category,
        brand: "Apple",
        condition: entry.condition,
        costPrice: 0,
        sellingPrice: entry.price,
        branchId,
      },
      select: { id: true },
    });
    if (!existing) created += 1;
    await prisma.inventoryItem.upsert({
      where: { branchId_productId: { branchId, productId: product.id } },
      update: {},
      create: { branchId, productId: product.id, stockOnHand: 0 },
    });
  }
  return { created, total: priceList.length };
}
