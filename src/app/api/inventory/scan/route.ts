import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { matchScanProducts, parseScanPayload, type ScanableProduct } from "@/lib/inventory-scan";
import { prisma } from "@/lib/prisma";
import { receiveProductStock } from "@/lib/receive-stock";

const scanSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  brand: true,
  condition: true,
  colour: true,
  imei: true,
  websiteProductId: true,
  websiteVariantKey: true,
} satisfies Record<keyof ScanableProduct, true>;

function publicMatch(
  product: ScanableProduct & {
    inventory: { stockOnHand: number; reservedStock: number; reorderLevel: number }[];
  },
  reason: string,
) {
  const inventory = product.inventory[0];
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    condition: product.condition,
    colour: product.colour,
    imei: product.imei,
    reason,
    stockOnHand: inventory?.stockOnHand ?? 0,
    available: Math.max(0, (inventory?.stockOnHand ?? 0) - (inventory?.reservedStock ?? 0)),
    reorderLevel: inventory?.reorderLevel ?? 0,
  };
}

async function productsForBranch(branchId: string) {
  return prisma.product.findMany({
    where: { branchId },
    select: {
      ...scanSelect,
      inventory: {
        where: { branchId },
        select: { stockOnHand: true, reservedStock: true, reorderLevel: true },
      },
    },
  });
}

async function lookup(branchId: string, raw: string) {
  const parsed = parseScanPayload(raw);
  if (!parsed.code) return { code: "", kind: parsed.kind, matches: [] as ReturnType<typeof publicMatch>[] };
  const products = await productsForBranch(branchId);
  const hits = matchScanProducts(raw, products);
  return { code: parsed.code, kind: parsed.kind, matches: hits.map((hit) => publicMatch(hit.product, hit.reason)) };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot access inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const code = new URL(request.url).searchParams.get("code") || "";
  const result = await lookup(session.user.branchId, code);
  if (!result.code) return NextResponse.json({ error: "Scan a barcode, SKU, IMEI or product name." }, { status: 400 });
  return NextResponse.json(result);
}

const receiveSchema = z.object({
  code: z.string().trim().min(2).max(120),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  productId: z.string().min(8).max(40).optional(),
  reorderLevel: z.coerce.number().int().nonnegative().max(100000).optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot manage inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot receive inventory.");
  }

  const parsed = receiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Scan a valid barcode, SKU, IMEI or product name and quantity." }, { status: 400 });

  const scan = parseScanPayload(parsed.data.code);
  const lookupResult = await lookup(session.user.branchId, parsed.data.code);

  let chosen = parsed.data.productId
    ? lookupResult.matches.find((match) => match.productId === parsed.data.productId)
    : lookupResult.matches.length === 1
      ? lookupResult.matches[0]
      : null;

  if (parsed.data.productId && !chosen) {
    const products = await productsForBranch(session.user.branchId);
    const product = products.find((row) => row.id === parsed.data.productId);
    if (product) chosen = publicMatch(product, scan.kind === "imei" ? "imei" : "sku");
  }

  if (!lookupResult.matches.length && !chosen) {
    return NextResponse.json({
      error: scan.kind === "imei"
        ? `IMEI ${scan.code} is not on file. Confirm which product this unit is, then Receive again.`
        : `No product matches “${parsed.data.code}”. Confirm the product name or SKU below.`,
      matches: [],
      code: scan.code,
      kind: scan.kind,
    }, { status: 404 });
  }

  if (!chosen) {
    return NextResponse.json(
      {
        error: "More than one product matches. Confirm which one to receive.",
        matches: lookupResult.matches,
        code: lookupResult.code,
        kind: lookupResult.kind,
      },
      { status: 409 },
    );
  }

  const inventory = await receiveProductStock(prisma, {
    branchId: session.user.branchId,
    productId: chosen.productId,
    userId: session.user.id,
    userName: session.user.name ?? "Staff member",
    quantity: parsed.data.quantity,
    reorderLevel: parsed.data.reorderLevel,
    reference: parsed.data.reference || `${scan.kind === "imei" ? "IMEI" : "SCAN"}-${(scan.code || lookupResult.code).slice(-16)}`,
    note: parsed.data.note || "Scanned on arrival",
    imei: scan.kind === "imei" ? scan.code : null,
  });

  if (!inventory) {
    return NextResponse.json({ error: "This product is not set up for your branch." }, { status: 404 });
  }

  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "STOCK_RECEIVED",
    summary: `Scanned in ${parsed.data.quantity} of ${inventory.product.name} (${inventory.previousStock} → ${inventory.stockOnHand} on hand)`,
    entityType: "InventoryItem",
    entityId: inventory.id,
  });

  return NextResponse.json({ ...inventory, match: chosen, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 201 });
}
