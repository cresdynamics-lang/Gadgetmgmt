import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const ownerName = process.env.INITIAL_OWNER_NAME?.trim() || "GadgetHub Owner";
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  const initialPassword = process.env.INITIAL_OWNER_PASSWORD;

  if (!ownerEmail || !initialPassword || initialPassword.length < 12 || initialPassword.length > 72) {
    throw new Error("Set INITIAL_OWNER_EMAIL and a unique INITIAL_OWNER_PASSWORD of 12 to 72 characters before seeding.");
  }

  const westlands = await prisma.branch.upsert({
    where: { code: "WST" },
    update: {},
    create: {
      name: "Westlands",
      code: "WST",
      address: "Westlands, Nairobi",
      phone: "+254700100200",
      email: "westlands@gadgethub.co.ke",
    },
  });

  await prisma.branch.upsert({
    where: { code: "CBD" },
    update: {},
    create: {
      name: "CBD",
      code: "CBD",
      address: "City Centre, Nairobi",
      phone: "+254700100201",
      email: "cbd@gadgethub.co.ke",
    },
  });

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
        branchId: westlands.id,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        passwordHash,
        role: "OWNER",
        branchId: westlands.id,
      },
    });
  }

  const iphone = await prisma.product.upsert({
    where: { sku: "IPH-15-PRO" },
    update: {},
    create: {
      sku: "IPH-15-PRO",
      name: "iPhone 15 Pro",
      category: "Smartphone",
      brand: "Apple",
      costPrice: 145000,
      sellingPrice: 185000,
      reorderLevel: 8,
      branchId: westlands.id,
    },
  });

  await prisma.inventoryItem.upsert({
    where: {
      branchId_productId: {
        branchId: westlands.id,
        productId: iphone.id,
      },
    },
    update: {},
    create: {
      branchId: westlands.id,
      productId: iphone.id,
      stockOnHand: 12,
      reservedStock: 2,
      reorderLevel: 8,
    },
  });

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
