import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, type ProductCondition } from "@prisma/client";

const prisma = new PrismaClient();

type CatalogRow = {
  category: string;
  itemId: string;
  group: string;
  product: string;
  configuration: string;
  newPrice: number;
  exUkPrice: number;
  notes: string;
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("Catalog CSV contains an unclosed quoted field.");
  cells.push(value);
  return cells;
}

function parseCatalog(text: string): CatalogRow[] {
  const [headerLine, ...lines] = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  const headers = parseCsvLine(headerLine);
  const index = (name: string) => {
    const position = headers.indexOf(name);
    if (position < 0) throw new Error(`Catalog CSV is missing the required column: ${name}`);
    return position;
  };
  const columns = {
    category: index("Category"),
    itemId: index("Item ID"),
    group: index("Group"),
    product: index("Product"),
    configuration: index("Configuration / Spec"),
    newPrice: index("Price NEW (KES)"),
    exUkPrice: index("Price EX-UK (KES)"),
    notes: index("Notes"),
  };
  const ids = new Set<string>();

  return lines.map((line, lineIndex) => {
    const cells = parseCsvLine(line);
    const get = (position: number) => cells[position]?.trim() ?? "";
    const itemId = get(columns.itemId);
    const newPriceText = get(columns.newPrice);
    const exUkPriceText = get(columns.exUkPrice);
    if (!itemId || ids.has(itemId)) throw new Error(`Catalog item ID is empty or duplicated on CSV row ${lineIndex + 2}.`);
    ids.add(itemId);
    if (!/^\d+$/.test(newPriceText) || !/^\d+$/.test(exUkPriceText)) {
      throw new Error(`Catalog prices must be whole KES integers on CSV row ${lineIndex + 2}.`);
    }

    return {
      category: get(columns.category),
      itemId,
      group: get(columns.group),
      product: get(columns.product),
      configuration: get(columns.configuration),
      newPrice: Number(newPriceText),
      exUkPrice: Number(exUkPriceText),
      notes: get(columns.notes),
    };
  });
}

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
        const product = await prisma.$transaction(async (transaction) => {
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

          const existingInventory = await transaction.inventoryItem.findUnique({
            where: { branchId_productId: { branchId: branch.id, productId: savedProduct.id } },
            select: { id: true },
          });
          if (existingInventory) {
            if (requestedStock > 0) {
              const receiptExists = await transaction.inventoryMovement.findFirst({
                where: { branchId: branch.id, productId: savedProduct.id, type: "RECEIPT", reference },
                select: { id: true },
              });
              if (!receiptExists) {
                await transaction.inventoryItem.update({ where: { id: existingInventory.id }, data: { stockOnHand: { increment: requestedStock } } });
                await transaction.inventoryMovement.create({
                  data: { branchId: branch.id, productId: savedProduct.id, userId: owner!.id, type: "RECEIPT", quantity: requestedStock, reference, note: "Catalog import opening stock" },
                });
              }
            }
          } else {
            await transaction.inventoryItem.create({
              data: { branchId: branch.id, productId: savedProduct.id, stockOnHand: requestedStock },
            });
            if (requestedStock > 0) {
              await transaction.inventoryMovement.create({
                data: { branchId: branch.id, productId: savedProduct.id, userId: owner!.id, type: "RECEIPT", quantity: requestedStock, reference, note: "Catalog import opening stock" },
              });
            }
          }
          return savedProduct;
        });
        if (product.id) variantCount += 1;
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