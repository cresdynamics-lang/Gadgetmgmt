import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { defaultRoleGrants, ROLE_IDS } from "../src/lib/access";

const prisma = new PrismaClient();

async function main() {
  const ownerName = process.env.INITIAL_OWNER_NAME?.trim() || "Administrator";
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase() || "aabere70@gmail.com";
  const initialPassword = process.env.INITIAL_OWNER_PASSWORD;

  if (!ownerEmail || !initialPassword || initialPassword.length < 12 || initialPassword.length > 72) {
    throw new Error("Set INITIAL_OWNER_EMAIL and a unique INITIAL_OWNER_PASSWORD of 12 to 72 characters before seeding.");
  }

  // Seed only NUH for a new shop. Existing branches and stock are never moved.
  const existingBranch = await prisma.branch.findFirst({ orderBy: { createdAt: "asc" } });
  const westlands = existingBranch ?? await prisma.branch.create({
    data: { name: "NUH", code: "NUH", address: process.env.INITIAL_SHOP_ADDRESS || "NUH", phone: process.env.INITIAL_SHOP_PHONE || "", email: ownerEmail },
  });

  const passwordHash = await bcrypt.hash(initialPassword, 12);

  const ownerWithEmail = await prisma.user.findUnique({ where: { email: ownerEmail } });
  const owners = await prisma.user.findMany({ where: { role: "OWNER" } });
  const existingOwner = owners.find(owner => owner.email.toLowerCase() === ownerEmail)
    ?? (owners.length === 1 ? owners[0] : null);
  if (owners.length > 1 && !existingOwner) throw new Error("Administrator account selection is ambiguous.");
  if (ownerWithEmail && ownerWithEmail.id !== existingOwner?.id) throw new Error("The administrator email belongs to another account.");

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

  for (const role of ROLE_IDS) {
    const existingEntitlement = await prisma.roleEntitlement.findUnique({ where: { role }, select: { role: true } });
    if (existingEntitlement) continue;
    const grant = defaultRoleGrants[role];
    await prisma.roleEntitlement.create({
      data: { role, pages: [...grant.pages], capabilities: [...grant.capabilities] },
    });
  }

  const seedDemoStaff = process.env.SEED_DEMO_STAFF
    ? process.env.SEED_DEMO_STAFF === "true"
    : process.env.NODE_ENV !== "production";

  if (seedDemoStaff) {
    const demoStaff = [
      { email: "manager.westlands@gadgethub.test", name: "Westlands Branch Manager", role: "BRANCH_MANAGER" as const },
      { email: "cashier.westlands@gadgethub.test", name: "Westlands Cashier", role: "CASHIER" as const },
      { email: "inventory.westlands@gadgethub.test", name: "Westlands Inventory Lead", role: "INVENTORY_LEAD" as const },
    ];
    for (const member of demoStaff) {
      if (member.email === ownerEmail) continue;
      await prisma.user.upsert({
        where: { email: member.email },
        update: { name: member.name, passwordHash, role: member.role, status: "ACTIVE", branchId: westlands.id },
        create: { name: member.name, email: member.email, passwordHash, role: member.role, branchId: westlands.id },
      });
    }
    console.log("Demo staff accounts are ready for local testing. They share INITIAL_OWNER_PASSWORD and are skipped when NODE_ENV is production.");
  }

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
