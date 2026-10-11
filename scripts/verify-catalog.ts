import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const csvPath = resolve(process.argv[2] ?? "C:/Users/pc/Downloads/Gadget_Hub_Complete_Market_Master.csv");
  const lines = (await readFile(csvPath, "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const itemIds = lines.slice(1).map((line, index) => {
    const match = line.match(/^[^,]*,([^,]*),/);
    const itemId = match?.[1]?.trim();
    if (!itemId || !/^[A-Z]+-[A-Z0-9]+$/.test(itemId)) throw new Error(`Could not read catalog item ID on CSV row ${index + 2}.`);
    return itemId;
  });
  if (new Set(itemIds).size !== itemIds.length) throw new Error("Source CSV contains duplicate item IDs.");

  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  const products = await prisma.product.findMany({
    where: { catalogItemId: { in: itemIds }, branchId: { in: branches.map((branch) => branch.id) } },
    select: { catalogItemId: true, branchId: true, condition: true, sellingPrice: true, marketNewPrice: true, marketExUkPrice: true },
  });
  const expected = itemIds.length * branches.length * 2;
  const validRows = products.filter((product) => Number.isInteger(product.sellingPrice) && product.sellingPrice > 0 && Number.isInteger(product.marketNewPrice) && (product.marketNewPrice ?? 0) > 0 && Number.isInteger(product.marketExUkPrice) && (product.marketExUkPrice ?? 0) > 0);
  const keys = new Set(products.map((product) => `${product.catalogItemId}:${product.branchId}:${product.condition}`));

  console.log(`Source IDs: ${itemIds.length}; active branches: ${branches.length}; expected variants: ${expected}; stored variants: ${products.length}; valid integer-price variants: ${validRows.length}.`);
  if (products.length !== expected || keys.size !== expected || validRows.length !== expected) {
    throw new Error("Catalog verification failed: one or more condition variants are missing or have invalid pricing.");
  }
}

main().catch((error) => {
  console.error("Catalog verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});