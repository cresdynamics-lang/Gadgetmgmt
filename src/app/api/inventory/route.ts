import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { presentDevice, tracksUnits } from "@/lib/device-units";
import { canUseCapability } from "@/lib/entitlements";
import { rejectSensitiveQuery } from "@/lib/request-guards";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!(await canUseCapability(session.user.role, "inventory", session.user.id))) return NextResponse.json({ error: "Your role cannot access inventory." }, { status: 403, headers: noStore });
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403, headers: noStore });

  const canViewCost = session.user.role === "OWNER";
  const [items, units, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { branchId: session.user.branchId },
      include: { product: { select: { id: true, sku: true, name: true, category: true, brand: true, costPrice: true, sellingPrice: true, reorderLevel: true, unitTracking: true } } },
      orderBy: { product: { name: "asc" } },
    }),
    prisma.stockUnit.findMany({
      where: { branchId: session.user.branchId },
      select: {
        id: true, productId: true, imei: true, imei2: true, serialNumber: true, status: true, condition: true,
        cosmeticGrade: true, color: true, storage: true, ram: true, networkLock: true, activationLock: true,
        location: true, supplierName: true, purchaseReference: true, receivedAt: true, soldAt: true, saleItemId: true,
      },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.inventoryMovement.findMany({
      where: { branchId: session.user.branchId },
      take: 20,
      include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    canViewCost,
    items: items.map((item) => ({
      ...item,
      product: {
        ...item.product,
        tracksUnits: tracksUnits(item.product.category, item.product.unitTracking),
        ...(canViewCost ? {} : { costPrice: undefined }),
      },
    })),
    units: units.map((unit) => presentDevice(unit)),
    movements,
  }, { headers: noStore });
}

const receiptSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(10000),
  reorderLevel: z.number().int().nonnegative().max(100000).optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

const productSchema = z.object({
  sku: z.string().trim().min(2).max(64).transform((sku) => sku.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80),
  brand: z.string().trim().max(80).optional(),
  costPrice: z.number().int().nonnegative().max(2_000_000_000),
  sellingPrice: z.number().int().positive().max(2_000_000_000),
  reorderLevel: z.number().int().nonnegative().max(100000),
  openingStock: z.number().int().nonnegative().max(100000),
  unitTracking: z.boolean().optional(),
  reference: z.string().trim().max(100).optional(),
});

export async function PUT(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canUseCapability(session.user.role, "inventory", session.user.id))) return NextResponse.json({ error: "Your role cannot manage inventory." }, { status: 403 });
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!["OWNER", "BRANCH_MANAGER", "INVENTORY_LEAD"].includes(session.user.role)) {
    return NextResponse.json({ error: "Your role cannot set up products." }, { status: 403 });
  }

  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid product details, prices, reorder level and opening stock." }, { status: 400 });
  const tracked = tracksUnits(parsed.data.category, parsed.data.unitTracking ?? null);
  if (tracked && parsed.data.openingStock > 0) {
    return NextResponse.json({ error: "Phones, laptops and tablets start at zero. Record each device with its IMEI or serial." }, { status: 400 });
  }

  try {
    const product = await prisma.$transaction(async (transaction) => {
      const created = await transaction.product.create({
        data: {
          sku: parsed.data.sku,
          name: parsed.data.name,
          category: parsed.data.category,
          brand: parsed.data.brand || null,
          costPrice: parsed.data.costPrice,
          sellingPrice: parsed.data.sellingPrice,
          reorderLevel: parsed.data.reorderLevel,
          unitTracking: parsed.data.unitTracking ?? null,
          branchId: session.user.branchId!,
          inventory: {
            create: {
              branchId: session.user.branchId!,
              stockOnHand: parsed.data.openingStock,
              reorderLevel: parsed.data.reorderLevel,
            },
          },
        },
        select: { id: true, sku: true, name: true },
      });

      if (parsed.data.openingStock > 0) {
        await transaction.inventoryMovement.create({
          data: {
            branchId: session.user.branchId!,
            productId: created.id,
            userId: session.user.id,
            type: "RECEIPT",
            quantity: parsed.data.openingStock,
            reference: parsed.data.reference || "OPENING STOCK",
            note: "Initial stock at product setup",
          },
        });
      }

      return created;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A product already uses this SKU." }, { status: 409 });
    }
    console.error("Product setup failed", error);
    return NextResponse.json({ error: "Product could not be set up." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(await canUseCapability(session.user.role, "inventory", session.user.id))) return NextResponse.json({ error: "Your role cannot manage inventory." }, { status: 403 });
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!["OWNER", "BRANCH_MANAGER", "INVENTORY_LEAD"].includes(session.user.role)) {
    return NextResponse.json({ error: "Your role cannot receive inventory." }, { status: 403 });
  }

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid product and quantity." }, { status: 400 });

  let inventory: Awaited<ReturnType<typeof prisma.$transaction>> | null;
  try {
  inventory = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.inventoryItem.findUnique({
      where: { branchId_productId: { branchId: session.user.branchId!, productId: parsed.data.productId } },
      select: {
        id: true,
        stockOnHand: true,
        product: { select: { name: true, sku: true, category: true, brand: true, costPrice: true, unitTracking: true } },
        branch: { select: { name: true } },
      },
    });
    if (!existing) return null;
    if (tracksUnits(existing.product.category, existing.product.unitTracking)) {
      throw new Error("UNIT_TRACKED");
    }

    const updated = await transaction.inventoryItem.update({
      where: { id: existing.id },
      data: { stockOnHand: { increment: parsed.data.quantity }, ...(parsed.data.reorderLevel !== undefined ? { reorderLevel: parsed.data.reorderLevel } : {}) },
      select: { id: true, stockOnHand: true, reservedStock: true },
    });
    const movement = await transaction.inventoryMovement.create({
      data: {
        branchId: session.user.branchId!,
        productId: parsed.data.productId,
        userId: session.user.id,
        type: "RECEIPT",
        quantity: parsed.data.quantity,
        reference: parsed.data.reference || null,
        note: parsed.data.note || null,
      },
      select: { id: true, createdAt: true },
    });
    const { costPrice, ...product } = existing.product;
    return {
      ...updated,
      previousStock: existing.stockOnHand,
      product: session.user.role === "OWNER" ? { ...product, costPrice } : product,
      branchName: existing.branch.name,
      receivedBy: session.user.name ?? "Staff member",
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      movement,
    };
  });
  } catch (error) {
    if (error instanceof Error && error.message === "UNIT_TRACKED") {
      return NextResponse.json({ error: "Record each device with its IMEI or serial. Quantity receipt is for accessories." }, { status: 409 });
    }
    console.error("Stock receipt failed", error);
    return NextResponse.json({ error: "Stock receipt could not be recorded." }, { status: 500 });
  }

  if (!inventory) return NextResponse.json({ error: "This product is not set up for your branch." }, { status: 404 });
  return NextResponse.json(inventory, { status: 201, headers: noStore });
}
