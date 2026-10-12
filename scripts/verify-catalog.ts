import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCatalog } from "./catalog-csv";

const prisma = new PrismaClient();

async function main() {
  const csvPath = resolve(process.argv[2] ?? "C:/Users/pc/Downloads/Gadget_Hub_Complete_Market_Master.csv");
  const rows = parseCatalog(await readFile(csvPath, "utf8"));
  const sourceById = new Map(rows.map((row) => [row.itemId, row]));
  const itemIds = [...sourceById.keys()];

  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  if (!branches.length) throw new Error("Catalog verification requires at least one active branch.");
  const products = await prisma.product.findMany({
    where: { catalogItemId: { in: itemIds }, branchId: { in: branches.map((branch) => branch.id) } },
    select: { catalogItemId: true, branchId: true, condition: true, sellingPrice: true, marketNewPrice: true, marketExUkPrice: true },
  });
  const expected = itemIds.length * branches.length * 2;
  const keys = new Set(products.map((product) => `${product.catalogItemId}:${product.branchId}:${product.condition}`));
  const validRows = products.filter((product) => {
    const source = product.catalogItemId ? sourceById.get(product.catalogItemId) : undefined;
    const expectedPrice = product.condition === "NEW" ? source?.newPrice : product.condition === "EX_UK" ? source?.exUkPrice : undefined;
    return source !== undefined
      && Number.isInteger(product.sellingPrice)
      && product.sellingPrice === expectedPrice
      && product.marketNewPrice === source.newPrice
      && product.marketExUkPrice === source.exUkPrice;
  });

  console.log(`Source IDs: ${itemIds.length}; active branches: ${branches.length}; expected variants: ${expected}; stored variants: ${products.length}; exact source-price variants: ${validRows.length}.`);
  if (products.length !== expected || keys.size !== expected || validRows.length !== expected) {
    throw new Error("Catalog verification failed: condition variants are missing, duplicated, or differ from source prices.");
  }
}

main().catch((error) => {
  console.error("Catalog verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});