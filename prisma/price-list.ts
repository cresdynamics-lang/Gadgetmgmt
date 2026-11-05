import type { PrismaClient, ProductCondition } from "@prisma/client";

/**
 * Current shop price list. Selling prices in KES.
 * Re-running updates these products to this list. Other products, including trade-ins, are left alone.
 * Buying prices are not in the list and are not changed.
 */
// `sku` keeps a product that was first created under an older code.
type PriceEntry = { group: string; category: string; condition: ProductCondition; configuration: string; price: number; sku?: string };

const k = (thousands: number) => thousands * 1000;

export const priceList: PriceEntry[] = [
  // iPhone, new
  { group: "iPhone Duo", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(395) },
  { group: "iPhone Duo", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(435) },
  { group: "iPhone Duo", category: "iPhone", condition: "NEW", configuration: "1TB", price: k(485) },
  { group: "iPhone 18 Pro Max", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(218) },
  { group: "iPhone 18 Pro Max", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(245) },
  { group: "iPhone 18 Pro Max", category: "iPhone", condition: "NEW", configuration: "1TB", price: k(320) },
  { group: "iPhone 18 Pro", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(185) },
  { group: "iPhone 18 Pro", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(230) },
  { group: "iPhone 17 Pro Max", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(167) },
  { group: "iPhone 17 Pro Max", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(195) },
  { group: "iPhone 17 Pro", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(158) },
  { group: "iPhone 17 Pro", category: "iPhone", condition: "NEW", configuration: "512GB", price: k(185) },
  { group: "iPhone 17", category: "iPhone", condition: "NEW", configuration: "256GB", price: k(120) },

  // iPhone, Ex-UK
  { group: "iPhone 16 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(110) },
  { group: "iPhone 16 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "512GB", price: k(125) },
  { group: "iPhone 16 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(95) },
  { group: "iPhone 16 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(105) },
  { group: "iPhone 16", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(80) },
  { group: "iPhone 16", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(87) },
  { group: "iPhone 15 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(90) },
  { group: "iPhone 15 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "512GB", price: k(98) },
  { group: "iPhone 15 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(75) },
  { group: "iPhone 15 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(80) },
  { group: "iPhone 15", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(63) },
  { group: "iPhone 15", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(70) },
  { group: "iPhone 14 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(72) },
  { group: "iPhone 14 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(77) },
  { group: "iPhone 14 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(62) },
  { group: "iPhone 14 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(67) },
  { group: "iPhone 14 Plus", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(60) },
  { group: "iPhone 14 Plus", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(67) },
  { group: "iPhone 14", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(48) },
  { group: "iPhone 14", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(57) },
  { group: "iPhone 13 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(61) },
  { group: "iPhone 13 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(66) },
  { group: "iPhone 13 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(52) },
  { group: "iPhone 13 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(57) },
  { group: "iPhone 13", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(43) },
  { group: "iPhone 13", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(48) },
  { group: "iPhone 12 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(46) },
  { group: "iPhone 12 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(50) },
  { group: "iPhone 12 Pro", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(42) },
  { group: "iPhone 12 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(47) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(33) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(35) },
  { group: "iPhone 12", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(40) },
  { group: "iPhone 11 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(32) },
  { group: "iPhone 11 Pro Max", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(37) },
  { group: "iPhone 11 Pro", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(32) },
  { group: "iPhone 11 Pro", category: "iPhone", condition: "EX_UK", configuration: "256GB", price: k(35) },
  { group: "iPhone 11", category: "iPhone", condition: "EX_UK", configuration: "64GB", price: k(24) },
  { group: "iPhone 11", category: "iPhone", condition: "EX_UK", configuration: "128GB", price: k(28) },

  // iPad, new. Cellular rows keep the older 5G SKU so the same product is updated.
  { group: "iPad (A16)", category: "iPad", condition: "NEW", configuration: "128GB · Wi-Fi", price: k(64) },
  { group: "iPad (A16)", category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(83) },
  { group: "iPad (A16)", category: "iPad", condition: "NEW", configuration: "128GB · Cellular", price: k(80) },
  { group: "iPad (A16)", category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(130) },
  { group: "iPad mini (A17 Pro)", category: "iPad", condition: "NEW", configuration: "128GB · Wi-Fi", price: k(88) },
  { group: "iPad mini (A17 Pro)", category: "iPad", condition: "NEW", configuration: "128GB · Cellular", price: k(107) },
  { group: "iPad mini (A17 Pro)", category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(138) },
  { group: 'iPad Air 11" M4', category: "iPad", condition: "NEW", configuration: "128GB · Wi-Fi", price: k(105) },
  { group: 'iPad Air 11" M4', category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(128) },
  { group: 'iPad Air 11" M4', category: "iPad", condition: "NEW", configuration: "128GB · Cellular", price: k(121) },
  { group: 'iPad Air 11" M4', category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(152) },
  { group: 'iPad Air 13" M4', category: "iPad", condition: "NEW", configuration: "128GB · Wi-Fi", price: k(130) },
  { group: 'iPad Air 13" M4', category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(145) },
  { group: 'iPad Air 13" M4', category: "iPad", condition: "NEW", configuration: "128GB · Cellular", price: k(138) },
  { group: 'iPad Air 13" M4', category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(165) },
  { group: 'iPad Pro 11" M5', category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(165) },
  { group: 'iPad Pro 11" M5', category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(188), sku: "NEW-IPAD-PRO-11IN-M5-256GB-5G" },
  { group: 'iPad Pro 11" M5', category: "iPad", condition: "NEW", configuration: "512GB · Cellular", price: k(218), sku: "NEW-IPAD-PRO-11IN-M5-512GB-5G" },
  { group: 'iPad Pro 13" M5', category: "iPad", condition: "NEW", configuration: "256GB · Wi-Fi", price: k(185) },
  { group: 'iPad Pro 13" M5', category: "iPad", condition: "NEW", configuration: "256GB · Cellular", price: k(195), sku: "NEW-IPAD-PRO-13IN-M5-256GB-5G" },
  { group: 'iPad Pro 13" M5', category: "iPad", condition: "NEW", configuration: "512GB · Cellular", price: k(223), sku: "NEW-IPAD-PRO-13IN-M5-512GB-5G" },
  { group: 'iPad Pro 13" M5', category: "iPad", condition: "NEW", configuration: "1TB · Cellular", price: k(258), sku: "NEW-IPAD-PRO-13IN-M5-1TB-5G" },

  // Mac, new
  { group: 'MacBook Neo 13"', category: "Mac", condition: "NEW", configuration: "8GB · 256GB", price: k(100) },
  { group: 'MacBook Neo 13"', category: "Mac", condition: "NEW", configuration: "8GB · 512GB", price: k(120) },
  { group: 'MacBook Air 13" M5', category: "Mac", condition: "NEW", configuration: "16GB · 512GB", price: k(188) },
  { group: 'MacBook Air 13" M5', category: "Mac", condition: "NEW", configuration: "16GB · 1TB", price: k(235) },
  { group: 'MacBook Air 15" M5', category: "Mac", condition: "NEW", configuration: "16GB · 512GB", price: k(230) },
  { group: 'MacBook Air 15" M5', category: "Mac", condition: "NEW", configuration: "24GB · 1TB", price: k(310) },
  { group: 'MacBook Pro 14" M5', category: "Mac", condition: "NEW", configuration: "16GB · 512GB", price: k(275) },
  { group: 'MacBook Pro 14" M5', category: "Mac", condition: "NEW", configuration: "16GB · 1TB", price: k(285) },
  { group: 'MacBook Pro 14" M5', category: "Mac", condition: "NEW", configuration: "24GB · 1TB", price: k(325) },
  { group: 'MacBook Pro 16" M5 Pro', category: "Mac", condition: "NEW", configuration: "36GB · 1TB", price: k(480) },

  // Apple Watch, new. The 40mm SE keeps the earlier 41mm SKU.
  { group: "Apple Watch SE 3", category: "Apple Watch", condition: "NEW", configuration: "40mm · Aluminum, GPS", price: k(38), sku: "NEW-APPLE-WATCH-SE-3-41MM" },
  { group: "Apple Watch SE 3", category: "Apple Watch", condition: "NEW", configuration: "44mm · Aluminum, GPS", price: k(43), sku: "NEW-APPLE-WATCH-SE-3-44MM" },
  { group: "Apple Watch Series 11", category: "Apple Watch", condition: "NEW", configuration: "42mm · Aluminum, GPS", price: k(50), sku: "NEW-APPLE-WATCH-SERIES-11-42MM" },
  { group: "Apple Watch Series 11", category: "Apple Watch", condition: "NEW", configuration: "46mm · Aluminum, GPS", price: k(55), sku: "NEW-APPLE-WATCH-SERIES-11-46MM" },
  { group: "Apple Watch Series 12", category: "Apple Watch", condition: "NEW", configuration: "42mm · Aluminum, GPS", price: k(60), sku: "NEW-APPLE-WATCH-SERIES-12-42MM" },
  { group: "Apple Watch Series 12", category: "Apple Watch", condition: "NEW", configuration: "46mm · Aluminum, GPS", price: k(67), sku: "NEW-APPLE-WATCH-SERIES-12-46MM" },
  { group: "Apple Watch Ultra 2", category: "Apple Watch", condition: "NEW", configuration: "Titanium · GPS + Cellular", price: k(90) },
  { group: "Apple Watch Ultra 3", category: "Apple Watch", condition: "NEW", configuration: "Titanium · GPS + Cellular", price: k(98) },
  { group: "Apple Watch Ultra 4", category: "Apple Watch", condition: "NEW", configuration: "Titanium · GPS + Cellular", price: k(120) },

  // AirPods and accessories, new
  { group: "AirPods (3rd generation)", category: "AirPods", condition: "NEW", configuration: "", price: k(21), sku: "NEW-AIRPODS-3RD-GEN" },
  { group: "AirPods 4", category: "AirPods", condition: "NEW", configuration: "", price: k(22), sku: "NEW-AIRPODS-4" },
  { group: "AirPods 4 with Active Noise Cancellation", category: "AirPods", condition: "NEW", configuration: "", price: k(28), sku: "NEW-AIRPODS-4-ANC" },
  { group: "AirPods Pro 2", category: "AirPods", condition: "NEW", configuration: "", price: k(28), sku: "APP-PRO-2" },
  { group: "AirPods Pro 3", category: "AirPods", condition: "NEW", configuration: "", price: k(33), sku: "NEW-AIRPODS-PRO-3" },
  { group: "Magic Mouse (USB-C)", category: "Apple accessories", condition: "NEW", configuration: "White", price: k(17) },
  { group: "Apple Pencil (USB-C)", category: "Apple accessories", condition: "NEW", configuration: "", price: k(18) },
  { group: "Apple Pencil (2nd generation)", category: "Apple accessories", condition: "NEW", configuration: "", price: k(18) },
  { group: "Apple Pencil Pro", category: "Apple accessories", condition: "NEW", configuration: "", price: k(20) },
  { group: "Magic Keyboard Folio", category: "Apple accessories", condition: "NEW", configuration: "", price: k(38) },
  { group: 'Magic Keyboard for iPad Air 11"', category: "Apple accessories", condition: "NEW", configuration: "", price: k(48) },
  { group: 'Magic Keyboard for iPad Air 13"', category: "Apple accessories", condition: "NEW", configuration: "", price: k(50) },
  { group: 'Magic Keyboard for iPad Pro 11"', category: "Apple accessories", condition: "NEW", configuration: "", price: k(54) },
  { group: 'Magic Keyboard for iPad Pro 13"', category: "Apple accessories", condition: "NEW", configuration: "", price: k(57) },
];

export function priceListSku(entry: PriceEntry) {
  if (entry.sku) return entry.sku;
  const base = `${entry.group}-${entry.configuration}`.toUpperCase().replace(/"/g, "IN").replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${entry.condition === "EX_UK" ? "EXUK" : "NEW"}-${base}`.slice(0, 64);
}

export function priceListName(entry: PriceEntry) {
  return [entry.group, entry.configuration.replaceAll(" · ", " "), entry.condition === "EX_UK" ? "(Ex-UK)" : ""].filter(Boolean).join(" ");
}

/** Create missing price-list products and set every listed selling price to this sheet. */
export async function seedPriceList(prisma: PrismaClient, branchId: string) {
  let created = 0;
  let updated = 0;
  for (const entry of priceList) {
    const sku = priceListSku(entry);
    const name = priceListName(entry);
    const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: {
            name,
            productGroup: entry.group,
            configuration: entry.configuration || null,
            category: entry.category,
            condition: entry.condition,
            sellingPrice: entry.price,
          },
          select: { id: true },
        })
      : await prisma.product.create({
          data: {
            sku,
            name,
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
    if (existing) updated += 1;
    else created += 1;
    await prisma.inventoryItem.upsert({
      where: { branchId_productId: { branchId, productId: product.id } },
      update: {},
      create: { branchId, productId: product.id, stockOnHand: 0 },
    });
  }
  return { created, updated, total: priceList.length };
}
