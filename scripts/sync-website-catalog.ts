// Links listed website products to this branch, writes the supplied prices, and
// hides other iPad/Mac/AirPods/Watch/accessory SKUs from the public site.
// Does not delete products, stock, sales, or customers.
import { PrismaClient } from "@prisma/client";

import { syncWebsiteCatalog } from "../src/lib/sync-website-catalog";

const prisma = new PrismaClient();

async function main() {
  const shop = await prisma.branch.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!shop) throw new Error("No active branch found. Run the main seed first.");
  const keepPrices = process.argv.includes("--keep-prices");
  const result = await syncWebsiteCatalog(prisma, shop.id, { updatePrices: !keepPrices });
  console.log(
    `${shop.name}: website catalog synced. created ${result.created}, updated ${result.updated}, hidden ${result.hidden} of ${result.listed} listed SKUs.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
