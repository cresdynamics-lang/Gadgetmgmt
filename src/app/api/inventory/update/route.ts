import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { catalogSiblingSku, groupWebsiteUpdateRows } from "@/lib/inventory-update";
import { prisma } from "@/lib/prisma";

const productSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  condition: true,
  colour: true,
  configuration: true,
  productGroup: true,
  sellingPrice: true,
  showOnWebsite: true,
  websiteProductId: true,
  websiteVariantKey: true,
  branchId: true,
  brand: true,
  costPrice: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot access inventory.");
  if (!session.user.branchId && !canSeeAllBranches(session.user)) {
    return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    where: {
      condition: { in: ["NEW", "EX_UK"] },
      ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }),
    },
    select: {
      ...productSelect,
      inventory: { select: { stockOnHand: true, reservedStock: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const rows = groupWebsiteUpdateRows(
    products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      condition: product.condition,
      colour: product.colour,
      configuration: product.configuration,
      productGroup: product.productGroup,
      sellingPrice: product.sellingPrice,
      showOnWebsite: product.showOnWebsite,
      websiteProductId: product.websiteProductId,
      websiteVariantKey: product.websiteVariantKey,
      stockOnHand: product.inventory.reduce((sum, row) => sum + row.stockOnHand, 0),
      reservedStock: product.inventory.reduce((sum, row) => sum + row.reservedStock, 0),
    })),
  );

  return NextResponse.json({
    rows,
    canEditPrices: hasPermission(session.user, "products.price"),
    canToggleWebsite: hasPermission(session.user, "products.price") || hasPermission(session.user, "inventory.receive"),
  });
}

const patchSchema = z
  .object({
    key: z.string().trim().min(1).max(200).optional(),
    websiteProductId: z.string().trim().max(80).nullable().optional(),
    websiteVariantKey: z.string().trim().max(80).nullable().optional(),
    newProductId: z.string().cuid().optional(),
    exUkProductId: z.string().cuid().optional(),
    newPrice: z.number().int().positive().max(2_000_000_000).nullable().optional(),
    exUkPrice: z.number().int().positive().max(2_000_000_000).nullable().optional(),
    newShowOnWebsite: z.boolean().optional(),
    exUkShowOnWebsite: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.newPrice !== undefined ||
      data.exUkPrice !== undefined ||
      data.newShowOnWebsite !== undefined ||
      data.exUkShowOnWebsite !== undefined,
  );

async function uniqueSku(sku: string) {
  const taken = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (!taken) return sku;
  return `${sku.slice(0, 56)}-${Date.now().toString(36).toUpperCase()}`.slice(0, 64);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot manage inventory.");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid New or Ex-UK catalog change." }, { status: 400 });

  const changingPrice = parsed.data.newPrice != null || parsed.data.exUkPrice != null;
  const changingVisibility = parsed.data.newShowOnWebsite !== undefined || parsed.data.exUkShowOnWebsite !== undefined;
  if (changingPrice && !hasPermission(session.user, "products.price")) {
    return denied(session.user, "products.price", "Your permissions cannot change product prices.");
  }
  if (changingVisibility && !hasPermission(session.user, "products.price") && !hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot change website visibility.");
  }

  const branchFilter = canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" };
  const ids = [parsed.data.newProductId, parsed.data.exUkProductId].filter((id): id is string => Boolean(id));
  if (!ids.length && !parsed.data.websiteProductId) {
    return NextResponse.json({ error: "That listing was not found." }, { status: 400 });
  }
  const products = await prisma.product.findMany({
    where: {
      ...branchFilter,
      condition: { in: ["NEW", "EX_UK"] },
      OR: [
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...(parsed.data.websiteProductId
          ? [
              {
                websiteProductId: parsed.data.websiteProductId,
                OR: [
                  { websiteVariantKey: parsed.data.websiteVariantKey || "base" },
                  ...(!parsed.data.websiteVariantKey || parsed.data.websiteVariantKey === "base" ? [{ websiteVariantKey: null }] : []),
                ],
              },
            ]
          : []),
      ],
    },
    select: productSelect,
  });

  if (!products.length) return NextResponse.json({ error: "That listing was not found." }, { status: 404 });

  const newProducts = products.filter((product) => product.condition === "NEW");
  const exUkProducts = products.filter((product) => product.condition === "EX_UK");
  const source = newProducts[0] ?? exUkProducts[0];
  if (!source) return NextResponse.json({ error: "That listing was not found." }, { status: 404 });

  const updates: { id: string; sellingPrice: number; showOnWebsite: boolean }[] = [];
  const created: { id: string; sku: string; condition: "NEW" | "EX_UK" }[] = [];
  const summaries: string[] = [];

  async function applyCondition(
    condition: "NEW" | "EX_UK",
    rows: typeof products,
    price: number | null | undefined,
    showOnWebsite: boolean | undefined,
  ) {
    if (price === undefined && showOnWebsite === undefined) return;

    if (rows.length) {
      for (const product of rows) {
        const nextPrice = price ?? product.sellingPrice;
        const nextShow = showOnWebsite ?? product.showOnWebsite;
        if (nextPrice === product.sellingPrice && nextShow === product.showOnWebsite) continue;
        const updated = await prisma.product.update({
          where: { id: product.id },
          data: {
            ...(price != null ? { sellingPrice: price } : {}),
            ...(showOnWebsite !== undefined ? { showOnWebsite } : {}),
          },
          select: { id: true, sellingPrice: true, showOnWebsite: true },
        });
        updates.push(updated);
        if (price != null && price !== product.sellingPrice) {
          summaries.push(`${condition === "EX_UK" ? "Ex-UK" : "New"} price KES ${product.sellingPrice.toLocaleString("en-KE")} → ${price.toLocaleString("en-KE")}`);
        }
        if (showOnWebsite !== undefined && showOnWebsite !== product.showOnWebsite) {
          summaries.push(`${condition === "EX_UK" ? "Ex-UK" : "New"} ${showOnWebsite ? "shown on website" : "hidden from website"}`);
        }
      }
      return;
    }

    if (price == null) return;
    const sku = await uniqueSku(
      catalogSiblingSku(source.websiteProductId, source.websiteVariantKey, source.sku, condition),
    );
    const createdProduct = await prisma.product.create({
      data: {
        sku,
        name: source.name,
        category: source.category,
        brand: source.brand,
        colour: source.colour,
        productGroup: source.productGroup,
        configuration: source.configuration,
        websiteProductId: source.websiteProductId,
        websiteVariantKey: source.websiteVariantKey,
        condition,
        costPrice: source.costPrice,
        sellingPrice: price,
        showOnWebsite: showOnWebsite ?? true,
        branchId: source.branchId,
        inventory: {
          create: { branchId: source.branchId, stockOnHand: 0 },
        },
      },
      select: { id: true, sku: true, sellingPrice: true, showOnWebsite: true },
    });
    created.push({ id: createdProduct.id, sku: createdProduct.sku, condition });
    updates.push({ id: createdProduct.id, sellingPrice: createdProduct.sellingPrice, showOnWebsite: createdProduct.showOnWebsite });
    summaries.push(`added ${condition === "EX_UK" ? "Ex-UK" : "New"} at KES ${price.toLocaleString("en-KE")}`);
  }

  await applyCondition("NEW", newProducts, parsed.data.newPrice, parsed.data.newShowOnWebsite);
  await applyCondition("EX_UK", exUkProducts, parsed.data.exUkPrice, parsed.data.exUkShowOnWebsite);

  if (summaries.length) {
    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: changingPrice ? "PRICE_UPDATED" : "WEBSITE_VISIBILITY",
      summary: `Updated website listing ${source.name}: ${summaries.join(", ")}`,
      entityType: "Product",
      entityId: source.id,
    });
  }

  return NextResponse.json({ ok: true, updates, created, name: source.name });
}
