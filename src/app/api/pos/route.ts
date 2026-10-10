import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const [products, customers] = await Promise.all([
    prisma.product.findMany({
      where: { branchId },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        sellingPrice: true,
        inventory: {
          where: { branchId },
          select: { stockOnHand: true, reservedStock: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.customer.findMany({
      where: { branchId, status: "ACTIVE" },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    products: products.map(({ inventory, ...product }) => ({
      ...product,
      available: Math.max(0, (inventory[0]?.stockOnHand ?? 0) - (inventory[0]?.reservedStock ?? 0)),
    })),
    customers,
  });
}

const checkoutSchema = z.object({
  items: z.array(z.object({ productId: z.string().cuid(), quantity: z.number().int().min(1).max(1000) })).min(1).max(100),
  customerId: z.string().cuid().nullable().optional(),
  paymentMethod: z.enum(["CASH", "MPESA", "CARD"]),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The checkout details are invalid." }, { status: 400 });

  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  try {
    const sale = await prisma.$transaction(async (transaction) => {
      const productIds = [...quantities.keys()];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds }, branchId },
        select: {
          id: true,
          name: true,
          sellingPrice: true,
          inventory: { where: { branchId }, select: { id: true, stockOnHand: true, reservedStock: true } },
        },
      });

      if (products.length !== productIds.length) throw new Error("PRODUCT_UNAVAILABLE");

      const lineItems = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        const inventory = product.inventory[0];
        if (!inventory || inventory.stockOnHand - inventory.reservedStock < quantity) throw new Error("INSUFFICIENT_STOCK");
        return { product, inventory, quantity, total: product.sellingPrice * quantity };
      });

      if (parsed.data.customerId) {
        const customer = await transaction.customer.findFirst({
          where: { id: parsed.data.customerId, branchId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!customer) throw new Error("CUSTOMER_UNAVAILABLE");
      }

      for (const { inventory, quantity } of lineItems) {
        const updated = await transaction.inventoryItem.updateMany({
          where: { id: inventory.id, stockOnHand: inventory.stockOnHand, reservedStock: inventory.reservedStock },
          data: { stockOnHand: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new Error("INVENTORY_CHANGED");
      }

      const total = lineItems.reduce((sum, item) => sum + item.total, 0);
      const invoiceNumber = `GH-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;

      const createdSale = await transaction.sale.create({
        data: {
          invoiceNumber,
          branchId,
          cashierId: session.user.id,
          customerId: parsed.data.customerId ?? null,
          total,
          paidAmount: total,
          paymentMethod: parsed.data.paymentMethod,
          status: "PAID",
          saleItems: {
            create: lineItems.map(({ product, quantity, total: lineTotal }) => ({
              productId: product.id,
              quantity,
              unitPrice: product.sellingPrice,
              total: lineTotal,
            })),
          },
        },
        select: { id: true, invoiceNumber: true, total: true, paymentMethod: true, createdAt: true },
      });

      await transaction.inventoryMovement.createMany({
        data: lineItems.map(({ product, quantity }) => ({
          branchId,
          productId: product.id,
          userId: session.user.id,
          saleId: createdSale.id,
          type: "SALE",
          quantity: -quantity,
          reference: createdSale.invoiceNumber,
        })),
      });

      return createdSale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["INSUFFICIENT_STOCK", "INVENTORY_CHANGED"].includes(error.message)) {
      return NextResponse.json({ error: "Stock changed or is insufficient. Refresh the catalogue and try again." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") {
      return NextResponse.json({ error: "One or more products are unavailable at your branch." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CUSTOMER_UNAVAILABLE") {
      return NextResponse.json({ error: "That customer is not active at your branch." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another checkout changed inventory. Refresh and try again." }, { status: 409 });
    }
    console.error("POS checkout failed", error);
    return NextResponse.json({ error: "Sale could not be completed. No stock was deducted." }, { status: 500 });
  }
}