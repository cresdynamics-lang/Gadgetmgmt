import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { recordActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot access inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const [items, movements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { branchId: session.user.branchId },
      include: { product: { select: { id: true, sku: true, name: true, category: true, brand: true, condition: true, colour: true, imei: true, costPrice: true, sellingPrice: true, reorderLevel: true, showOnWebsite: true, websiteProductId: true } } },
      orderBy: { product: { name: "asc" } },
    }),
    prisma.inventoryMovement.findMany({
      where: { branchId: session.user.branchId },
      take: 20,
      include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Buying prices are part of the financial position, so they need the finance permission.
  const canSeeCost = hasPermission(session.user, "finance.view");
  return NextResponse.json({
    items: canSeeCost ? items : items.map((item) => ({ ...item, product: { ...item.product, costPrice: null } })),
    movements,
    canSeeCost,
    canEditPrices: hasPermission(session.user, "products.price"),
    canToggleWebsite: hasPermission(session.user, "products.price") || hasPermission(session.user, "inventory.receive"),
  });
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
  // New stock comes in as new or ex-UK. Trade-ins are added from the POS at checkout.
  condition: z.enum(["NEW", "EX_UK"]).default("NEW"),
  colour: z.string().trim().max(40).optional(),
  brand: z.string().trim().max(80).optional(),
  costPrice: z.number().int().nonnegative().max(2_000_000_000),
  sellingPrice: z.number().int().positive().max(2_000_000_000),
  reorderLevel: z.number().int().nonnegative().max(100000),
  openingStock: z.number().int().nonnegative().max(100000),
  reference: z.string().trim().max(100).optional(),
});

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot manage inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot set up products.");
  }

  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid product details, prices, reorder level and opening stock." }, { status: 400 });

  try {
    const product = await prisma.$transaction(async (transaction) => {
      const created = await transaction.product.create({
        data: {
          sku: parsed.data.sku,
          name: parsed.data.name,
          category: parsed.data.category,
          condition: parsed.data.condition,
          colour: parsed.data.colour || null,
          brand: parsed.data.brand || null,
          costPrice: parsed.data.costPrice,
          sellingPrice: parsed.data.sellingPrice,
          reorderLevel: parsed.data.reorderLevel,
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

    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: "PRODUCT_CREATED",
      summary: `Added Apple product ${product.name} (${product.sku})`,
      entityType: "Product",
      entityId: product.id,
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot manage inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot receive inventory.");
  }

  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid product and quantity." }, { status: 400 });

  const inventory = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.inventoryItem.findUnique({
      where: { branchId_productId: { branchId: session.user.branchId!, productId: parsed.data.productId } },
      select: {
        id: true,
        stockOnHand: true,
        product: { select: { name: true, sku: true, category: true, brand: true, costPrice: true } },
        branch: { select: { name: true } },
      },
    });
    if (!existing) return null;

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
    return {
      ...updated,
      previousStock: existing.stockOnHand,
      product: existing.product,
      branchName: existing.branch.name,
      receivedBy: session.user.name ?? "Staff member",
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      movement,
    };
  });

  if (!inventory) return NextResponse.json({ error: "This product is not set up for your branch." }, { status: 404 });
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "STOCK_RECEIVED",
    summary: `Received ${parsed.data.quantity} of ${inventory.product.name}`,
    entityType: "InventoryItem",
    entityId: inventory.id,
  });
  return NextResponse.json(inventory, { status: 201 });
}

const priceSchema = z.object({
  productId: z.string().cuid(),
  sellingPrice: z.number().int().positive().max(2_000_000_000).optional(),
  costPrice: z.number().int().nonnegative().max(2_000_000_000).optional(),
  showOnWebsite: z.boolean().optional(),
}).strict().refine((data) => data.sellingPrice !== undefined || data.costPrice !== undefined || data.showOnWebsite !== undefined);

/** Change a product's selling price, and its buying price for people who can see finances. */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = priceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  if ((parsed.data.sellingPrice !== undefined || parsed.data.costPrice !== undefined) && !hasPermission(session.user, "products.price")) {
    return denied(session.user, "products.price", "Your permissions cannot change product prices.");
  }
  if (parsed.data.showOnWebsite !== undefined && !hasPermission(session.user, "products.price") && !hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot change website visibility.");
  }
  if (parsed.data.costPrice !== undefined && !hasPermission(session.user, "finance.view")) {
    return denied(session.user, "finance.view", "Buying prices need the financial permission.");
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }) },
    select: { id: true, name: true, sellingPrice: true, costPrice: true, showOnWebsite: true },
  });
  if (!product) return NextResponse.json({ error: "That product was not found." }, { status: 404 });

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      ...(parsed.data.sellingPrice !== undefined ? { sellingPrice: parsed.data.sellingPrice } : {}),
      ...(parsed.data.costPrice !== undefined ? { costPrice: parsed.data.costPrice } : {}),
      ...(parsed.data.showOnWebsite !== undefined ? { showOnWebsite: parsed.data.showOnWebsite } : {}),
    },
    select: { id: true, sellingPrice: true, costPrice: true, showOnWebsite: true },
  });
  const changes = [
    parsed.data.sellingPrice !== undefined && parsed.data.sellingPrice !== product.sellingPrice ? `selling price KES ${product.sellingPrice.toLocaleString("en-KE")} → ${parsed.data.sellingPrice.toLocaleString("en-KE")}` : null,
    parsed.data.costPrice !== undefined && parsed.data.costPrice !== product.costPrice ? "buying price updated" : null,
    parsed.data.showOnWebsite !== undefined && parsed.data.showOnWebsite !== product.showOnWebsite ? (parsed.data.showOnWebsite ? "shown on website" : "hidden from website") : null,
  ].filter(Boolean);
  if (changes.length) {
    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: parsed.data.showOnWebsite !== undefined && parsed.data.sellingPrice === undefined ? "WEBSITE_VISIBILITY" : "PRICE_UPDATED",
      summary: `Changed ${product.name}: ${changes.join(", ")}`,
      entityType: "Product",
      entityId: product.id,
    });
  }
  return NextResponse.json(hasPermission(session.user, "finance.view") ? updated : { ...updated, costPrice: null });
}
