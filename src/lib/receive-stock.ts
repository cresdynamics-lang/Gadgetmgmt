import type { PrismaClient } from "@prisma/client";

type ReceiveInput = {
  branchId: string;
  productId: string;
  userId: string;
  userName: string;
  quantity: number;
  reorderLevel?: number;
  reference?: string | null;
  note?: string | null;
  imei?: string | null;
};

export async function receiveProductStock(prisma: PrismaClient, input: ReceiveInput) {
  return prisma.$transaction(async (transaction) => {
    let existing = await transaction.inventoryItem.findUnique({
      where: { branchId_productId: { branchId: input.branchId, productId: input.productId } },
      select: {
        id: true,
        stockOnHand: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            category: true,
            brand: true,
            condition: true,
            colour: true,
            costPrice: true,
            imei: true,
          },
        },
        branch: { select: { name: true } },
      },
    });

    if (!existing) {
      const product = await transaction.product.findFirst({
        where: { id: input.productId, branchId: input.branchId },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          brand: true,
          condition: true,
          colour: true,
          costPrice: true,
          imei: true,
        },
      });
      const branch = await transaction.branch.findUnique({ where: { id: input.branchId }, select: { name: true } });
      if (!product || !branch) return null;
      const created = await transaction.inventoryItem.create({
        data: {
          branchId: input.branchId,
          productId: product.id,
          stockOnHand: 0,
          reorderLevel: input.reorderLevel ?? 0,
        },
        select: { id: true, stockOnHand: true },
      });
      existing = { id: created.id, stockOnHand: created.stockOnHand, product, branch };
    }

    const imei = (input.imei || "").replace(/\D/g, "");
    if (imei.length === 15 && !existing.product.imei) {
      const taken = await transaction.product.findFirst({ where: { imei }, select: { id: true } });
      if (!taken) {
        await transaction.product.update({ where: { id: existing.product.id }, data: { imei } });
      }
    }

    const updated = await transaction.inventoryItem.update({
      where: { id: existing.id },
      data: {
        stockOnHand: { increment: input.quantity },
        ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
      },
      select: { id: true, stockOnHand: true, reservedStock: true },
    });
    const movement = await transaction.inventoryMovement.create({
      data: {
        branchId: input.branchId,
        productId: input.productId,
        userId: input.userId,
        type: "RECEIPT",
        quantity: input.quantity,
        reference: input.reference || null,
        note: input.note || null,
      },
      select: { id: true, createdAt: true },
    });
    return {
      ...updated,
      previousStock: existing.stockOnHand,
      product: { ...existing.product, imei: existing.product.imei || imei || null },
      branchName: existing.branch.name,
      receivedBy: input.userName || "Staff member",
      reference: input.reference || null,
      note: input.note || null,
      movement,
    };
  });
}
