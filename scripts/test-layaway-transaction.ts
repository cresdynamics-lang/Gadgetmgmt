import { Prisma, PrismaClient } from "@prisma/client";
import { createLayawayOrder, fulfillLayawayOrder, recordLayawayPayment } from "../src/lib/layaway";

const prisma = new PrismaClient();
const rollbackMarker = "ROLLBACK_LAYAWAY_SMOKE_TEST";

async function main() {
  try {
    await prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      const owner = await transaction.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } });
      const customer = branch
        ? await transaction.customer.findFirst({ where: { branchId: branch.id, status: "ACTIVE" }, select: { id: true } })
        : null;
      const product = branch
        ? await transaction.product.findFirst({
            where: { branchId: branch.id, inventory: { some: { branchId: branch.id, stockOnHand: { gt: 0 } } } },
            select: { id: true, sellingPrice: true, inventory: { where: { branchId: branch.id }, select: { stockOnHand: true, reservedStock: true } } },
            orderBy: { sellingPrice: "asc" },
          })
        : null;
      if (!branch || !owner || !customer || !product) {
        throw new Error("Layaway smoke test requires an active branch, owner, customer, and product with stock.");
      }

      const inventoryBefore = product.inventory[0];
      const initialPayment = Math.max(1, Math.floor(product.sellingPrice / 2));
      const order = await createLayawayOrder(transaction, {
        branchId: branch.id,
        customerId: customer.id,
        productId: product.id,
        createdById: owner.id,
        quantity: 1,
        initialAmount: initialPayment,
        method: "CASH",
        reference: "LAYAWAY-SMOKE-INITIAL",
      });
      const inventoryAfterReserve = await transaction.inventoryItem.findUniqueOrThrow({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
        select: { stockOnHand: true, reservedStock: true },
      });
      if (inventoryAfterReserve.stockOnHand !== inventoryBefore.stockOnHand || inventoryAfterReserve.reservedStock !== inventoryBefore.reservedStock + 1) {
        throw new Error("Layaway creation must reserve stock without decrementing physical stock.");
      }

      const paymentResult = await recordLayawayPayment(transaction, {
        orderId: order.id,
        branchId: branch.id,
        userId: owner.id,
        amount: order.balance,
        method: "MPESA",
        reference: "LAYAWAY-SMOKE-FINAL",
      });
      if (paymentResult.balance !== 0 || paymentResult.status !== "READY_FOR_PICKUP") {
        throw new Error("Final installment must move a fully paid order to ready for pickup.");
      }

      const sale = await fulfillLayawayOrder(transaction, { orderId: order.id, branchId: branch.id, userId: owner.id });
      const [inventoryAfterPickup, movementCount, paymentCount, savedOrder] = await Promise.all([
        transaction.inventoryItem.findUniqueOrThrow({ where: { branchId_productId: { branchId: branch.id, productId: product.id } }, select: { stockOnHand: true, reservedStock: true } }),
        transaction.inventoryMovement.count({ where: { layawayOrderId: order.id } }),
        transaction.layawayPayment.count({ where: { layawayOrderId: order.id } }),
        transaction.layawayOrder.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, balance: true } }),
      ]);
      if (
        inventoryAfterPickup.stockOnHand !== inventoryBefore.stockOnHand - 1
        || inventoryAfterPickup.reservedStock !== inventoryBefore.reservedStock
        || movementCount !== 2
        || paymentCount !== 2
        || savedOrder.status !== "FULFILLED"
        || savedOrder.balance !== 0
        || sale.total !== order.totalAmount
      ) {
        throw new Error("Layaway fulfillment did not persist expected sale, inventory, payment, and order state.");
      }
      throw new Error(rollbackMarker);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
  }

  console.log("Layaway transaction smoke test passed; reservation, installments, pickup sale, and ledger were verified and rolled back.");
}

main()
  .catch((error) => {
    console.error("Layaway transaction smoke test failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());