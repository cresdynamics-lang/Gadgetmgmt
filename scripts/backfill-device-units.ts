// Creates per-phone records for Ex-UK and trade-in phones that were received before per-phone
// tracking. Each of those phones already has its own product with the IMEI on it.
// Safe to run more than once: products that already have a phone record are skipped.
// New stock is left alone: its products are models, so which phones are still on the shelf is unknown.
import { PrismaClient } from "@prisma/client";

import { batteryPercent, deviceIdentifiers } from "../src/lib/device-units";

const prisma = new PrismaClient();

function note(notes: string | null, pattern: RegExp) {
  return notes?.match(pattern)?.[1]?.trim() || null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { imei: { not: null }, condition: { in: ["EX_UK", "TRADE_IN"] }, deviceUnits: { none: {} } },
    select: {
      id: true, branchId: true, imei: true, condition: true, colour: true, configuration: true, mpn: true, catalogNotes: true, costPrice: true, createdAt: true,
      inventory: { select: { stockOnHand: true, reservedStock: true } },
      tradeInRecord: { select: { id: true, color: true, storage: true, batteryHealth: true, sellerName: true, sellerPhone: true, assessedById: true, createdAt: true } },
      movements: { where: { type: "RECEIPT" }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true, userId: true, vendorName: true, sourceKind: true, sourceName: true, sourcePhone: true, reference: true } },
      saleItems: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, saleId: true, sale: { select: { cashierId: true, createdAt: true, status: true } } } },
    },
  });

  let inStock = 0, sold = 0, skipped = 0;
  for (const product of products) {
    const onHand = product.inventory.reduce((sum, row) => sum + row.stockOnHand, 0);
    const sale = product.saleItems[0];
    const receipt = product.movements[0];
    const receivedById = receipt?.userId ?? product.tradeInRecord?.assessedById ?? sale?.sale.cashierId;
    const status = onHand > 0 ? "IN_STOCK" : sale && sale.sale.status !== "VOIDED" ? "SOLD" : null;
    if (!status || !receivedById) { skipped += 1; continue; }

    const codes = deviceIdentifiers({ imei: product.imei, serial: note(product.catalogNotes, /Sr#\s*([A-Z0-9]{8,20})/i) });
    const storage = product.tradeInRecord?.storage || product.configuration?.split("·")[0]?.trim() || null;
    await prisma.deviceUnit.create({
      data: {
        branchId: product.branchId,
        productId: product.id,
        ...codes,
        condition: product.condition,
        colour: product.colour || product.tradeInRecord?.color || null,
        storage: storage && /\d\s*(GB|TB)/i.test(storage) ? storage : null,
        mpn: product.mpn,
        batteryHealth: product.tradeInRecord?.batteryHealth ?? batteryPercent(note(product.catalogNotes, /Battery\s*(\d{1,3})\s*%/i)),
        fmi: note(product.catalogNotes, /FMI\s*(On|Off)/i),
        sim: note(product.catalogNotes, /SIM\s*(Unlocked|Locked)/i),
        osVersion: note(product.catalogNotes, /Version\s*([\d.]+)/i),
        costPrice: product.costPrice,
        status,
        sourceKind: receipt?.sourceKind ?? (product.condition === "TRADE_IN" ? "TRADE_IN" : "VENDOR"),
        vendorName: receipt?.vendorName ?? null,
        sourceName: receipt?.sourceName ?? product.tradeInRecord?.sellerName ?? null,
        sourcePhone: receipt?.sourcePhone ?? product.tradeInRecord?.sellerPhone ?? null,
        reference: receipt?.reference ?? null,
        receivedAt: receipt?.createdAt ?? product.tradeInRecord?.createdAt ?? product.createdAt,
        receivedById,
        tradeInId: product.tradeInRecord?.id ?? null,
        ...(status === "SOLD" && sale ? { saleId: sale.saleId, saleItemId: sale.id, soldById: sale.sale.cashierId, soldAt: sale.sale.createdAt } : {}),
      },
    });
    if (status === "IN_STOCK") inStock += 1; else sold += 1;
  }
  console.log(`Phone records created: ${inStock} in stock, ${sold} sold. Skipped ${skipped} with no stock and no sale.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
