import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "sales")) return NextResponse.json({ error: "Your role cannot access sales." }, { status: 403 });
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
  paymentMethod: z.enum(["CASH", "MPESA", "CARD", "CREDIT", "SPLIT"]),
  paidAmount: z.number().int().nonnegative().max(2_000_000_000).optional(),
  discountAmount: z.number().int().nonnegative().max(2_000_000_000).default(0),
  taxAmount: z.number().int().nonnegative().max(2_000_000_000).default(0),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "sales")) return NextResponse.json({ error: "Your role cannot create sales." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "The checkout details are invalid." }, { status: 400 });
  if (parsed.data.paymentMethod === "CREDIT" && !parsed.data.customerId) {
    return NextResponse.json({ error: "Select a customer to create a credit sale." }, { status: 400 });
  }
  if ((parsed.data.discountAmount > 0 || parsed.data.taxAmount > 0) && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Only an administrator can apply checkout adjustments." }, { status: 403 });
  }

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
          costPrice: true,
          sellingPrice: true,
          inventory: { where: { branchId }, select: { id: true, stockOnHand: true, reservedStock: true } },
        },
      });

      if (products.length !== productIds.length) throw new Error("PRODUCT_UNAVAILABLE");

      const lineItems = products.map((product) => {
        const quantity = quantities.get(product.id)!;
        const inventory = product.inventory[0];
        if (!inventory || inventory.stockOnHand - inventory.reservedStock < quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        }
        return { product, inventory, quantity, subtotal: product.sellingPrice * quantity };
      });

      if (parsed.data.customerId) {
        const customer = await transaction.customer.findFirst({
          where: { id: parsed.data.customerId, branchId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!customer) throw new Error("CUSTOMER_UNAVAILABLE");
      }

      for (const { inventory, quantity, product } of lineItems) {
        const updated = await transaction.inventoryItem.updateMany({
          where: { id: inventory.id, stockOnHand: { gte: inventory.reservedStock + quantity }, reservedStock: inventory.reservedStock },
          data: { stockOnHand: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
      }

      const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
      if (parsed.data.discountAmount > subtotal) throw new Error("DISCOUNT_EXCEEDS_SUBTOTAL");
      const total = subtotal - parsed.data.discountAmount + parsed.data.taxAmount;
      const paidAmount = parsed.data.paymentMethod === "CREDIT" ? 0 : parsed.data.paymentMethod === "SPLIT" ? parsed.data.paidAmount : total;
      if (paidAmount === undefined || paidAmount > total || (parsed.data.paymentMethod === "SPLIT" && (paidAmount <= 0 || paidAmount >= total))) {
        throw new Error("INVALID_PAID_AMOUNT");
      }
      const receiptDate = new Date();
      const datePart = receiptDate.toISOString().slice(2, 10).replaceAll("-", "");
      const invoiceNumber = `GH-${datePart}-${randomBytes(2).toString("hex").toUpperCase()}`;

      let discountRemaining = parsed.data.discountAmount;
      let taxRemaining = parsed.data.taxAmount;
      const saleLines = lineItems.map((item, index) => {
        const isLast = index === lineItems.length - 1;
        const lineDiscount = isLast ? discountRemaining : Math.floor(parsed.data.discountAmount * item.subtotal / subtotal);
        discountRemaining -= lineDiscount;
        const lineTax = isLast ? taxRemaining : Math.floor(parsed.data.taxAmount * item.subtotal / subtotal);
        taxRemaining -= lineTax;
        return { ...item, lineDiscount, lineTax, total: item.subtotal - lineDiscount + lineTax };
      });

      const createdSale = await transaction.sale.create({
        data: {
          invoiceNumber,
          branchId,
          cashierId: session.user.id,
          customerId: parsed.data.customerId ?? null,
          total,
          discountAmount: parsed.data.discountAmount,
          taxAmount: parsed.data.taxAmount,
          paidAmount,
          paymentMethod: parsed.data.paymentMethod,
          status: paidAmount === total ? "PAID" : "PARTIAL",
          saleItems: {
            create: saleLines.map(({ product, quantity, lineDiscount, lineTax, total: lineTotal }) => ({
              productId: product.id,
              quantity,
              unitPrice: product.sellingPrice,
              unitCost: product.costPrice,
              discountAmount: lineDiscount,
              taxAmount: lineTax,
              total: lineTotal,
            })),
          },
        },
        include: {
          customer: { select: { name: true, phone: true } },
          branch: { select: { name: true, address: true, phone: true } },
          cashier: { select: { name: true } },
          saleItems: { include: { product: { select: { name: true, sku: true, configuration: true, condition: true } } } },
        },
      });

      if (parsed.data.paymentMethod === "CREDIT") {
        const dueDate = new Date(receiptDate);
        dueDate.setDate(dueDate.getDate() + 30);
        await transaction.creditPlan.createMany({
          data: saleLines.map(({ product, total: lineTotal }) => ({
            saleId: createdSale.id,
            branchId,
            customerId: parsed.data.customerId!,
            productId: product.id,
            totalAmount: lineTotal,
            balance: lineTotal,
            installmentCount: 1,
            nextDueDate: dueDate,
            status: "ACTIVE",
          })),
        });
      }

      await transaction.inventoryMovement.createMany({
        data: saleLines.map(({ product, quantity }) => ({
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
    if (error instanceof Error && error.message.startsWith("INSUFFICIENT_STOCK:")) {
      return NextResponse.json({ error: `Insufficient stock for ${error.message.slice("INSUFFICIENT_STOCK:".length)}.` }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DISCOUNT_EXCEEDS_SUBTOTAL") return NextResponse.json({ error: "Discount cannot exceed the sale subtotal." }, { status: 400 });
    if (error instanceof Error && error.message === "INVALID_PAID_AMOUNT") return NextResponse.json({ error: "Enter a paid amount below the total for a split payment." }, { status: 400 });
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