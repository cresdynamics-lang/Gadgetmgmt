// Loads the shop price list without touching staff accounts. Safe to re-run: it only adds missing products.
import { PrismaClient } from "@prisma/client";

import { seedPriceList } from "../prisma/price-list";

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!shop) throw new Error("No active branch found. Run the main seed first.");
  const result = await seedPriceList(prisma, shop.id);
  console.log(`${shop.name}: added ${result.created} of ${result.total} price-list products.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
