import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { seedPriceList } from "./price-list";

const prisma = new PrismaClient();

const appleCatalogue = [
  { sku: "IPH-15-PRO", name: "iPhone 15 Pro", category: "iPhone", costPrice: 145000, sellingPrice: 185000, stockOnHand: 12, reorderLevel: 8 },
  { sku: "IPH-15", name: "iPhone 15", category: "iPhone", costPrice: 115000, sellingPrice: 148000, stockOnHand: 10, reorderLevel: 6 },
  { sku: "IPH-16", name: "iPhone 16", category: "iPhone", costPrice: 128000, sellingPrice: 164000, stockOnHand: 8, reorderLevel: 5 },
  { sku: "IPH-16-PRO", name: "iPhone 16 Pro", category: "iPhone", costPrice: 155000, sellingPrice: 198000, stockOnHand: 6, reorderLevel: 4 },
  { sku: "IPH-16-PRO-MAX", name: "iPhone 16 Pro Max", category: "iPhone", costPrice: 175000, sellingPrice: 228000, stockOnHand: 5, reorderLevel: 3 },
  { sku: "IPAD-AIR-M2", name: "iPad Air M2", category: "iPad", costPrice: 95000, sellingPrice: 125000, stockOnHand: 4, reorderLevel: 2 },
  { sku: "MBA-M3-13", name: "MacBook Air 13 M3", category: "Mac", costPrice: 165000, sellingPrice: 215000, stockOnHand: 3, reorderLevel: 2 },
  { sku: "AW-S10", name: "Apple Watch Series 10", category: "Apple Watch", costPrice: 52000, sellingPrice: 68000, stockOnHand: 9, reorderLevel: 4 },
  { sku: "APP-PRO-2", name: "AirPods Pro 2", category: "AirPods", costPrice: 28000, sellingPrice: 30000, stockOnHand: 15, reorderLevel: 6 },
];

async function main() {
  const ownerName = process.env.INITIAL_OWNER_NAME?.trim() || "GadgetHub Owner";
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  const initialPassword = process.env.INITIAL_OWNER_PASSWORD;

  if (!ownerEmail || !initialPassword || initialPassword.length < 12 || initialPassword.length > 72) {
    throw new Error("Set INITIAL_OWNER_EMAIL and a unique INITIAL_OWNER_PASSWORD of 12 to 72 characters before seeding.");
  }

  // The business trades from a single location. Older databases used the WST code for it.
  const legacyBranch = await prisma.branch.findUnique({ where: { code: "WST" }, select: { id: true } });
  const shop = legacyBranch
    ? await prisma.branch.update({
      where: { id: legacyBranch.id },
      data: { name: "Norwich Union Hse", code: "NUH", address: "Norwich Union Hse, Nairobi", email: null },
    })
    : await prisma.branch.upsert({
      where: { code: "NUH" },
      update: { name: "Norwich Union Hse", address: "Norwich Union Hse, Nairobi" },
      create: {
        name: "Norwich Union Hse",
        code: "NUH",
        address: "Norwich Union Hse, Nairobi",
        phone: "+254700100200",
      },
    });
  await prisma.branch.updateMany({ where: { code: "CBD" }, data: { isActive: false } });

  const passwordHash = await bcrypt.hash(initialPassword, 12);

  const ownerWithEmail = await prisma.user.findUnique({ where: { email: ownerEmail } });
  const existingOwner = ownerWithEmail ?? await prisma.user.findFirst({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
  });

  if (existingOwner) {
    await prisma.user.update({
      where: { id: existingOwner.id },
      data: {
        name: ownerName,
        email: ownerEmail,
        passwordHash,
        role: "OWNER",
        status: "ACTIVE",
        branchId: shop.id,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        passwordHash,
        role: "OWNER",
        branchId: shop.id,
      },
    });
  }

  // Demo stock for local development. Set SEED_DEMO_CATALOGUE=false on a live shop.
  if (process.env.SEED_DEMO_CATALOGUE !== "false") {
    for (const item of appleCatalogue) {
      const product = await prisma.product.upsert({
        where: { sku: item.sku },
        update: {
          name: item.name,
          category: item.category,
          brand: "Apple",
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          reorderLevel: item.reorderLevel,
          branchId: shop.id,
        },
        create: {
          sku: item.sku,
          name: item.name,
          category: item.category,
          brand: "Apple",
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          reorderLevel: item.reorderLevel,
          branchId: shop.id,
        },
      });

      await prisma.inventoryItem.upsert({
        where: { branchId_productId: { branchId: shop.id, productId: product.id } },
        update: { stockOnHand: item.stockOnHand, reorderLevel: item.reorderLevel },
        create: {
          branchId: shop.id,
          productId: product.id,
          stockOnHand: item.stockOnHand,
          reservedStock: item.sku === "IPH-15-PRO" ? 2 : 0,
          reorderLevel: item.reorderLevel,
        },
      });
    }
  }

  for (const branch of [shop]) {
    await prisma.creditPolicy.upsert({
      where: { branchId: branch.id },
      update: { minimumDepositPercent: 40 },
      create: { branchId: branch.id, minimumDepositPercent: 40 },
    });
  }

  const prices = await seedPriceList(prisma, shop.id);
  console.log(`Price list: ${prices.created} new of ${prices.total} products.`);

  console.log("Database seed completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
