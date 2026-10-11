import { randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rollbackMarker = "ROLLBACK_POS_SMOKE_TEST";

async function main() {
  try {
    await prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      const owner = await transaction.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } });
      if (!branch || !owner) throw new Error("Create an active branch and owner before running the POS transaction smoke test.");

      const suffix = randomBytes(4).toString("hex").toUpperCase();
      const customer = await transaction.customer.create({
        data: { name: `POS smoke ${suffix}`, phone: `000${suffix}`, branchId: branch.id },
        select: { id: true },
      });
      const product = await transaction.product.create({
        data: {
          sku: `SMOKE-${suffix}`,
          name: `POS smoke ${suffix}`,
          category: "Test",
          costPrice: 100,
          sellingPrice: 200,
          branchId: branch.id,
          inventory: { create: { branchId: branch.id, stockOnHand: 2 } },
        },
        include: { inventory: { select: { id: true, stockOnHand: true, reservedStock: true } } },
      });
      const inventory = product.inventory[0];
      const decremented = await transaction.inventoryItem.updateMany({
        where: { id: inventory.id, stockOnHand: { gte: inventory.reservedStock + 1 }, reservedStock: inventory.reservedStock },
        data: { stockOnHand: { decrement: 1 } },
      });
      if (decremented.count !== 1) throw new Error("Smoke-test stock decrement failed.");

      const sale = await transaction.sale.create({
        data: {
          invoiceNumber: `GH-TEST-${suffix}`,
          branchId: branch.id,
          cashierId: owner.id,
          customerId: customer.id,
          total: product.sellingPrice,
          paidAmount: 0,
          paymentMethod: "CREDIT",
          status: "PARTIAL",
          saleItems: { create: [{ productId: product.id, quantity: 1, unitPrice: product.sellingPrice, unitCost: product.costPrice, total: product.sellingPrice }] },
        },
        select: { id: true, total: true },
      });
      await transaction.inventoryMovement.create({
        data: { branchId: branch.id, productId: product.id, userId: owner.id, saleId: sale.id, type: "SALE", quantity: -1, reference: `GH-TEST-${suffix}` },
      });
      await transaction.creditPlan.create({
        data: {
          saleId: sale.id,
          branchId: branch.id,
          customerId: customer.id,
          productId: product.id,
          totalAmount: sale.total,
          balance: sale.total,
          installmentCount: 1,
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      const [saleCheck, movementCount, creditCount, inventoryCheck] = await Promise.all([
        transaction.sale.findUnique({ where: { id: sale.id }, include: { saleItems: true } }),
        transaction.inventoryMovement.count({ where: { saleId: sale.id, reference: `GH-TEST-${suffix}` } }),
        transaction.creditPlan.count({ where: { saleId: sale.id, customerId: customer.id, balance: sale.total } }),
        transaction.inventoryItem.findUnique({ where: { id: inventory.id }, select: { stockOnHand: true } }),
      ]);
      if (saleCheck?.saleItems.length !== 1 || movementCount !== 1 || creditCount !== 1 || inventoryCheck?.stockOnHand !== 1) {
        throw new Error("POS smoke-test transaction did not persist all expected writes inside the transaction.");
      }

      throw new Error(rollbackMarker);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
  }

  console.log("POS transaction smoke test passed; sale, stock decrement, ledger movement, and credit plan were verified and rolled back.");
}

main().catch((error) => {
  console.error("POS transaction smoke test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});