import { NextResponse } from "next/server";
import { Prisma, type TenderMethod } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { createLayawayOrder } from "@/lib/layaway";
import { prisma } from "@/lib/prisma";

function accessError(role: string) {
  return !canUseCapability(role, "layaway")
    ? NextResponse.json({ error: "Your role cannot access layaway orders." }, { status: 403 })
    : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const forbidden = accessError(session.user.role);
  if (forbidden) return forbidden;
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const [orders, products, customers] = await Promise.all([
    prisma.layawayOrder.findMany({
      where: { branchId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { name: true } },
        payments: { orderBy: { createdAt: "asc" } },
        sale: { select: { invoiceNumber: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.product.findMany({
      where: { branchId, inventory: { some: { branchId } } },
      select: {
        id: true,
        sku: true,
        name: true,
        sellingPrice: true,
        inventory: { where: { branchId }, select: { stockOnHand: true, reservedStock: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({ where: { branchId, status: "ACTIVE" }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    orders,
    products: products.map(({ inventory, ...product }) => ({
      ...product,
      available: Math.max(0, (inventory[0]?.stockOnHand ?? 0) - (inventory[0]?.reservedStock ?? 0)),
    })),
    customers,
  });
}

const createSchema = z.object({
  customerId: z.string().cuid(),
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(1000),
  initialAmount: z.number().int().positive().max(2_000_000_000),
  method: z.enum(["CASH", "MPESA", "CARD"]),
  reference: z.string().trim().max(100).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const forbidden = accessError(session.user.role);
  if (forbidden) return forbidden;
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a customer, an available product, quantity and a valid first payment." }, { status: 400 });

  try {
    const order = await prisma.$transaction(
      (transaction) => createLayawayOrder(transaction, { ...parsed.data, branchId, createdById: session.user.id, method: parsed.data.method as TenderMethod }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_UNAVAILABLE") return NextResponse.json({ error: "Choose an active customer assigned to your branch." }, { status: 400 });
    if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") return NextResponse.json({ error: "That product is unavailable at your branch." }, { status: 400 });
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return NextResponse.json({ error: "There is not enough unreserved stock for that quantity." }, { status: 409 });
    if (error instanceof Error && error.message === "INITIAL_PAYMENT_EXCEEDS_TOTAL") return NextResponse.json({ error: "The first payment cannot exceed the order total." }, { status: 400 });
    if (error instanceof Error && error.message === "TOTAL_OUT_OF_RANGE") return NextResponse.json({ error: "The order total is outside the supported range." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Inventory changed during reservation. Refresh and try again." }, { status: 409 });
    console.error("Layaway order creation failed", error);
    return NextResponse.json({ error: "Layaway order could not be created." }, { status: 500 });
  }
}