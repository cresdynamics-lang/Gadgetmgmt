import { randomBytes } from "node:crypto";
import { Prisma, type TenderMethod } from "@prisma/client";

type Transaction = Prisma.TransactionClient;

export type CreateLayawayInput = {
  branchId: string;
  customerId: string;
  productId: string;
  createdById: string;
  quantity: number;
  initialAmount: number;
  method: TenderMethod;
  reference?: string;
};

export async function createLayawayOrder(transaction: Transaction, input: CreateLayawayInput) {
  const [customer, product] = await Promise.all([
    transaction.customer.findFirst({
      where: { id: input.customerId, branchId: input.branchId, status: "ACTIVE" },
      select: { id: true },
    }),
    transaction.product.findFirst({
      where: { id: input.productId, branchId: input.branchId },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        costPrice: true,
        inventory: { where: { branchId: input.branchId }, select: { id: true, stockOnHand: true, reservedStock: true } },
      },
    }),
  ]);
  if (!customer) throw new Error("CUSTOMER_UNAVAILABLE");
  if (!product) throw new Error("PRODUCT_UNAVAILABLE");
  const inventory = product.inventory[0];
  if (!inventory || inventory.stockOnHand - inventory.reservedStock < input.quantity) throw new Error("INSUFFICIENT_STOCK");

  const totalAmount = product.sellingPrice * input.quantity;
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 1 || totalAmount > 2_147_483_647) throw new Error("TOTAL_OUT_OF_RANGE");
  if (input.initialAmount > totalAmount) throw new Error("INITIAL_PAYMENT_EXCEEDS_TOTAL");

  const reserved = await transaction.inventoryItem.updateMany({
    where: {
      id: inventory.id,
      branchId: input.branchId,
      stockOnHand: { gte: inventory.reservedStock + input.quantity },
      reservedStock: inventory.reservedStock,
    },
    data: { reservedStock: { increment: input.quantity } },
  });
  if (reserved.count !== 1) throw new Error("INSUFFICIENT_STOCK");

  const order = await transaction.layawayOrder.create({
    data: {
      branchId: input.branchId,
      customerId: customer.id,
      productId: product.id,
      createdById: input.createdById,
      productName: product.name,
      productSku: product.sku,
      quantity: input.quantity,
      unitPrice: product.sellingPrice,
      unitCost: product.costPrice,
      totalAmount,
      amountPaid: input.initialAmount,
      balance: totalAmount - input.initialAmount,
      status: input.initialAmount === totalAmount ? "READY_FOR_PICKUP" : "ACTIVE",
      payments: {
        create: {
          receivedById: input.createdById,
          amount: input.initialAmount,
          method: input.method,
          reference: input.reference || null,
        },
      },
    },
    include: { customer: { select: { name: true, phone: true } }, payments: true },
  });

  await transaction.inventoryMovement.create({
    data: {
      branchId: input.branchId,
      productId: product.id,
      userId: input.createdById,
      layawayOrderId: order.id,
      type: "RESERVATION",
      quantity: input.quantity,
      reference: `LAYAWAY-${order.id}`,
      note: "Stock reserved for layaway order",
    },
  });
  return order;
}

export async function recordLayawayPayment(
  transaction: Transaction,
  input: { orderId: string; branchId: string; userId: string; amount: number; method: TenderMethod; reference?: string },
) {
  const order = await transaction.layawayOrder.findFirst({
    where: { id: input.orderId, branchId: input.branchId },
    select: { id: true, balance: true, status: true },
  });
  if (!order || order.status !== "ACTIVE") throw new Error("ORDER_NOT_ACTIVE");
  if (input.amount > order.balance) throw new Error("PAYMENT_EXCEEDS_BALANCE");

  const nextBalance = order.balance - input.amount;
  const updated = await transaction.layawayOrder.updateMany({
    where: { id: order.id, branchId: input.branchId, balance: order.balance, status: "ACTIVE" },
    data: {
      balance: { decrement: input.amount },
      amountPaid: { increment: input.amount },
      status: nextBalance === 0 ? "READY_FOR_PICKUP" : "ACTIVE",
    },
  });
  if (updated.count !== 1) throw new Error("ORDER_CHANGED");

  const payment = await transaction.layawayPayment.create({
    data: {
      layawayOrderId: order.id,
      receivedById: input.userId,
      amount: input.amount,
      method: input.method,
      reference: input.reference || null,
    },
  });
  return { payment, balance: nextBalance, status: nextBalance === 0 ? "READY_FOR_PICKUP" as const : "ACTIVE" as const };
}

export async function fulfillLayawayOrder(
  transaction: Transaction,
  input: { orderId: string; branchId: string; userId: string },
) {
  const order = await transaction.layawayOrder.findFirst({
    where: { id: input.orderId, branchId: input.branchId },
    include: { product: { select: { id: true } }, payments: { orderBy: { createdAt: "asc" } } },
  });
  if (!order || order.status !== "READY_FOR_PICKUP" || order.balance !== 0) throw new Error("ORDER_NOT_READY");
  if (order.payments.reduce((sum, payment) => sum + payment.amount, 0) !== order.totalAmount) throw new Error("PAYMENT_LEDGER_MISMATCH");

  const inventory = await transaction.inventoryItem.updateMany({
    where: { branchId: input.branchId, productId: order.productId, stockOnHand: { gte: order.quantity }, reservedStock: { gte: order.quantity } },
    data: { stockOnHand: { decrement: order.quantity }, reservedStock: { decrement: order.quantity } },
  });
  if (inventory.count !== 1) throw new Error("RESERVATION_UNAVAILABLE");

  const datePart = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const invoiceNumber = `GH-LAY-${datePart}-${randomBytes(8).toString("hex").toUpperCase()}`;
  const sale = await transaction.sale.create({
    data: {
      invoiceNumber,
      layawayOrderId: order.id,
      branchId: input.branchId,
      cashierId: input.userId,
      customerId: order.customerId,
      total: order.totalAmount,
      paidAmount: order.totalAmount,
      paymentMethod: "LAYAWAY",
      status: "PAID",
      saleItems: {
        create: [{
          productId: order.productId,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          unitCost: order.unitCost,
          total: order.totalAmount,
        }],
      },
      payments: {
        create: order.payments.map((payment) => ({
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
        })),
      },
    },
    include: { payments: true },
  });

  await transaction.inventoryMovement.create({
    data: {
      branchId: input.branchId,
      productId: order.productId,
      userId: input.userId,
      saleId: sale.id,
      layawayOrderId: order.id,
      type: "SALE",
      quantity: -order.quantity,
      reference: invoiceNumber,
      note: "Layaway collected by customer",
    },
  });
  await transaction.layawayOrder.update({ where: { id: order.id }, data: { status: "FULFILLED", fulfilledAt: new Date() } });
  return sale;
}