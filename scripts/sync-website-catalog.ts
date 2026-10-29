// Links listed website products to this branch and hides other iPad/Mac/AirPods/
// Watch/accessory SKUs from the public site. Prices stay in ops Product.sellingPrice
// and the website overlay — this script does not write prices.
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
  const result = await syncWebsiteCatalog(prisma, shop.id);
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
