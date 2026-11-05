import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const countSchema = z.object({
  stockOnHand: z.number().int().nonnegative().max(100000),
  reason: z.string().trim().min(3).max(200),
}).strict();

async function guard() {
  const session = await auth();
  if (!session?.user) return { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  if (!canUseCapability(session.user, "inventory")) return { response: denied(session.user, "inventory", "Your role cannot manage inventory.") };
  if (!session.user.branchId) return { response: NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 }) };
  if (!hasPermission(session.user, "inventory.receive")) return { response: denied(session.user, "inventory.receive", "Your permissions cannot correct stock.") };
  return { session, branchId: session.user.branchId };
}

/** Correct the count on hand after a physical stock-take, with the reason on record. */
export async function PATCH(request: Request, context: { params: Promise<{ productId: string }> }) {
  const checked = await guard();
  if ("response" in checked) return checked.response;
  const { session, branchId } = checked;
  const parsed = countSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the counted quantity and a reason of at least 3 letters." }, { status: 400 });
  const { productId } = await context.params;

  const item = await prisma.inventoryItem.findFirst({ where: { productId, branchId }, select: { id: true, stockOnHand: true, reservedStock: true, product: { select: { name: true } } } });
  if (!item) return NextResponse.json({ error: "That product is not stocked at your branch." }, { status: 404 });
  if (parsed.data.stockOnHand < item.reservedStock) return NextResponse.json({ error: `${item.reservedStock} are held for sales awaiting payment, so the count cannot be lower than that.` }, { status: 409 });
  // Phones recorded one by one are corrected on the phone itself, so the count and the records agree.
  const tracked = await prisma.deviceUnit.count({ where: { productId, branchId, status: { in: ["IN_STOCK", "RESERVED"] } } });
  if (tracked && parsed.data.stockOnHand !== tracked) {
    return NextResponse.json({ error: `${tracked} phone${tracked === 1 ? " is" : "s are"} recorded one by one here. Remove a phone received by mistake from Gadgets history instead.` }, { status: 409 });
  }
  const change = parsed.data.stockOnHand - item.stockOnHand;
  if (change === 0) return NextResponse.json({ id: item.id, stockOnHand: item.stockOnHand });

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.inventoryMovement.create({
      data: { branchId, productId, userId: session.user.id, type: "ADJUSTMENT", quantity: change, reference: "STOCK-COUNT", note: parsed.data.reason },
    });
    return transaction.inventoryItem.update({ where: { id: item.id }, data: { stockOnHand: parsed.data.stockOnHand }, select: { id: true, stockOnHand: true, reservedStock: true } });
  });
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "STOCK_ADJUSTED",
    summary: `Counted ${item.product.name}: ${item.stockOnHand} → ${parsed.data.stockOnHand} (${parsed.data.reason})`,
    entityType: "InventoryItem",
    entityId: item.id,
  });
  return NextResponse.json(updated);
}

/** Remove a product set up by mistake. One that has been sold or still has stock stays for the records. */
export async function DELETE(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const checked = await guard();
  if ("response" in checked) return checked.response;
  const { session, branchId } = checked;
  const { productId } = await context.params;
  const product = await prisma.product.findFirst({
    where: { id: productId, branchId },
    select: { id: true, name: true, inventory: { select: { stockOnHand: true, reservedStock: true } }, _count: { select: { saleItems: true, deviceUnits: true } } },
  });
  if (!product) return NextResponse.json({ error: "That product was not found." }, { status: 404 });
  if (product.inventory.some((row) => row.stockOnHand > 0 || row.reservedStock > 0)) {
    return NextResponse.json({ error: `${product.name} still has stock. Count it to 0 first, or keep it.` }, { status: 409 });
  }
  if (product._count.saleItems || product._count.deviceUnits) {
    return NextResponse.json({ error: `${product.name} has sales or phone records, so it stays for the history.` }, { status: 409 });
  }
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.inventoryMovement.deleteMany({ where: { productId } });
      await transaction.inventoryItem.deleteMany({ where: { productId } });
      await transaction.product.delete({ where: { id: productId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: `${product.name} is linked to a Lipa plan or order, so it stays for the history.` }, { status: 409 });
    }
    console.error("Product removal failed", error);
    return NextResponse.json({ error: "The product could not be removed." }, { status: 500 });
  }
  await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "PRODUCT_REMOVED", summary: `Removed product ${product.name}`, entityType: "Product", entityId: productId });
  return NextResponse.json({ ok: true });
}
