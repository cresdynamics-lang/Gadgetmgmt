import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "website.view") && !canUseCapability(session.user, "inventory")) {
    return denied(session.user, "website.view", "Your role cannot view the website catalog.");
  }
  if (!session.user.branchId && !canSeeAllBranches(session.user)) {
    return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  }

  const items = await prisma.product.findMany({
    where: {
      condition: { in: ["NEW", "EX_UK"] },
      websiteProductId: { not: null },
      ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }),
    },
    include: {
      inventory: { select: { stockOnHand: true, reservedStock: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const canSeeCost = hasPermission(session.user, "finance.view");
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      configuration: item.configuration,
      productGroup: item.productGroup,
      condition: item.condition,
      colour: item.colour,
      websiteProductId: item.websiteProductId,
      websiteVariantKey: item.websiteVariantKey,
      sellingPrice: item.sellingPrice,
      costPrice: canSeeCost ? item.costPrice : null,
      showOnWebsite: item.showOnWebsite,
      available: item.inventory.reduce((sum, row) => sum + Math.max(0, row.stockOnHand - row.reservedStock), 0),
      stockOnHand: item.inventory.reduce((sum, row) => sum + row.stockOnHand, 0),
    })),
    canEditPrices: hasPermission(session.user, "products.price"),
    canToggleWebsite: hasPermission(session.user, "products.price") || hasPermission(session.user, "inventory.receive"),
    canSeeCost,
  });
}

const patchSchema = z.object({
  productId: z.string().cuid(),
  sellingPrice: z.number().int().positive().max(2_000_000_000).optional(),
  showOnWebsite: z.boolean().optional(),
}).strict().refine((data) => data.sellingPrice !== undefined || data.showOnWebsite !== undefined);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid catalog change." }, { status: 400 });

  if (parsed.data.sellingPrice !== undefined && !hasPermission(session.user, "products.price")) {
    return denied(session.user, "products.price", "Your permissions cannot change product prices.");
  }
  if (
    parsed.data.showOnWebsite !== undefined &&
    !hasPermission(session.user, "products.price") &&
    !hasPermission(session.user, "inventory.receive")
  ) {
    return denied(session.user, "inventory.receive", "Your permissions cannot change website visibility.");
  }

  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }) },
    select: { id: true, name: true, sellingPrice: true, showOnWebsite: true },
  });
  if (!product) return NextResponse.json({ error: "That product was not found." }, { status: 404 });

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      ...(parsed.data.sellingPrice !== undefined ? { sellingPrice: parsed.data.sellingPrice } : {}),
      ...(parsed.data.showOnWebsite !== undefined ? { showOnWebsite: parsed.data.showOnWebsite } : {}),
    },
    select: { id: true, sellingPrice: true, showOnWebsite: true },
  });

  const changes = [
    parsed.data.sellingPrice !== undefined && parsed.data.sellingPrice !== product.sellingPrice
      ? `selling price KES ${product.sellingPrice.toLocaleString("en-KE")} → ${parsed.data.sellingPrice.toLocaleString("en-KE")}`
      : null,
    parsed.data.showOnWebsite !== undefined && parsed.data.showOnWebsite !== product.showOnWebsite
      ? parsed.data.showOnWebsite
        ? "shown on website"
        : "hidden from website"
      : null,
  ].filter(Boolean);
  if (changes.length) {
    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: parsed.data.showOnWebsite !== undefined ? "WEBSITE_VISIBILITY" : "PRICE_UPDATED",
      summary: `Changed ${product.name}: ${changes.join(", ")}`,
      entityType: "Product",
      entityId: product.id,
    });
  }
  return NextResponse.json(updated);
}
