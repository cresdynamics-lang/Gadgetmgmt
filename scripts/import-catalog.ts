import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, PrismaClient, type ProductCondition } from "@prisma/client";
import { parseCatalog } from "./catalog-csv";

const prisma = new PrismaClient();

async function main() {
  const csvPath = resolve(process.argv[2] ?? "C:/Users/pc/Downloads/Gadget_Hub_Complete_Market_Master.csv");
  const dryRun = process.argv[3] === "--dry-run";
  const requestedStock = Number(process.env.CATALOG_OPENING_STOCK ?? "0");
  if (!Number.isInteger(requestedStock) || requestedStock < 0 || requestedStock > 100000) {
    throw new Error("CATALOG_OPENING_STOCK must be an integer from 0 to 100000.");
  }

  const rows = parseCatalog(await readFile(csvPath, "utf8"));
  if (dryRun) {
    const categories = [...new Set(rows.map((row) => row.category))].sort();
    console.log(`Validated ${rows.length} unique source items as ${rows.length * 2} condition variants across ${categories.length} categories.`);
    console.log(`Categories: ${categories.join(", ")}`);
    return;
  }

  const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, code: true } });
  if (!branches.length) throw new Error("Create at least one active branch before importing the catalog.");

  const owner = requestedStock > 0
    ? await prisma.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } })
    : null;
  if (requestedStock > 0 && !owner) throw new Error("An active owner account is required to audit opening stock receipts.");

  let variantCount = 0;
  for (const branch of branches) {
    for (const row of rows) {
      const variants: { condition: ProductCondition; suffix: string; label: string; price: number }[] = [
        { condition: "NEW", suffix: "NEW", label: "Brand New", price: row.newPrice },
        { condition: "EX_UK", suffix: "EXUK", label: "Ex-UK Grade A", price: row.exUkPrice },
      ];

      for (const variant of variants) {
        const sku = `${row.itemId}-${variant.suffix}-${branch.code}`;
        const name = `${row.product} ${row.configuration} (${variant.label})`.trim();
        const reference = `CATALOG-OPENING-${row.itemId}-${variant.suffix}-${branch.code}`;
        let imported = false;
        for (let attempt = 0; attempt < 3 && !imported; attempt += 1) {
          try {
            await prisma.$transaction(async (transaction) => {
              const savedProduct = await transaction.product.upsert({
            where: { sku },
            update: {
              catalogItemId: row.itemId,
              productGroup: row.group,
              configuration: row.configuration,
              catalogNotes: row.notes || null,
              condition: variant.condition,
              marketNewPrice: row.newPrice,
              marketExUkPrice: row.exUkPrice,
              name,
              category: row.category,
              brand: "Apple",
              sellingPrice: variant.price,
            },
            create: {
              sku,
              catalogItemId: row.itemId,
              productGroup: row.group,
              configuration: row.configuration,
              catalogNotes: row.notes || null,
              condition: variant.condition,
              marketNewPrice: row.newPrice,
              marketExUkPrice: row.exUkPrice,
              name,
              category: row.category,
              brand: "Apple",
              costPrice: 0,
              sellingPrice: variant.price,
              branchId: branch.id,
            },
            select: { id: true },
              });

              const inventory = await transaction.inventoryItem.upsert({
                where: { branchId_productId: { branchId: branch.id, productId: savedProduct.id } },
                update: {},
                create: { branchId: branch.id, productId: savedProduct.id, stockOnHand: 0 },
                select: { id: true },
              });
              if (requestedStock > 0) {
                const receiptExists = await transaction.inventoryMovement.findUnique({ where: { idempotencyKey: reference }, select: { id: true } });
                if (!receiptExists) {
                  await transaction.inventoryMovement.create({
                    data: { branchId: branch.id, productId: savedProduct.id, userId: owner!.id, type: "RECEIPT", quantity: requestedStock, reference, idempotencyKey: reference, note: "Catalog import opening stock" },
                  });
                  await transaction.inventoryItem.update({ where: { id: inventory.id }, data: { stockOnHand: { increment: requestedStock } } });
                }
              }
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
            imported = true;
          } catch (error) {
            const retryable = error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
            if (requestedStock > 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
              const receipt = await prisma.inventoryMovement.findUnique({ where: { idempotencyKey: reference }, select: { id: true } });
              if (receipt) imported = true;
            }
            if (!imported && (!retryable || attempt === 2)) throw error;
          }
        }
        if (!imported) throw new Error(`Could not safely import catalog variant ${sku}.`);
        variantCount += 1;
      }
    }
  }

  console.log(`Imported ${rows.length} source items as ${variantCount} condition variants across ${branches.length} active branches. Opening stock per variant: ${requestedStock}.`);
  console.log("Catalog market prices were imported as retail prices; purchase costs remain 0 until verified supplier costs are entered.");
}

main().catch((error) => {
  console.error("Catalog import failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});