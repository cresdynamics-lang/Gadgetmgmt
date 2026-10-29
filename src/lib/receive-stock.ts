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
};

export async function receiveProductStock(prisma: PrismaClient, input: ReceiveInput) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.inventoryItem.findUnique({
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
          },
        },
        branch: { select: { name: true } },
      },
    });
    if (!existing) return null;

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
      product: existing.product,
      branchName: existing.branch.name,
      receivedBy: input.userName || "Staff member",
      reference: input.reference || null,
      note: input.note || null,
      movement,
    };
  });
}
