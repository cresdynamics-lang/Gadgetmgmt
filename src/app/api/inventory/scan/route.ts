import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { appleCatalogHint, lookupAppleIdentity, suggestedConditionFromMpn } from "@/lib/apple-barcodes";
import { denied } from "@/lib/authz";
import { productCategories } from "@/lib/catalog";
import { deviceHasIdentity, emptyScannedDevice, overlayDevice, parseDeviceScan, type ScannedDevice } from "@/lib/device-scan";
import { deviceIdentifiers } from "@/lib/device-units";
import { matchScanProducts, parseScanPayload, type ScanableProduct } from "@/lib/inventory-scan";
import { prisma } from "@/lib/prisma";
import { receiveExUkStock, receiveNewStock, receiveProductStock } from "@/lib/receive-stock";

const scanSelect = {
  id: true,
  sku: true,
  name: true,
  category: true,
  brand: true,
  condition: true,
  colour: true,
  imei: true,
  gtin: true,
  mpn: true,
  productGroup: true,
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
    gtin: product.gtin,
    mpn: product.mpn,
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

/** A phone this shop has handled before, found by the IMEI or serial on its barcode. */
async function knownDevice(branchId: string, scanned: ScannedDevice, parsed: ReturnType<typeof parseScanPayload>) {
  const codes = deviceIdentifiers({ imei: scanned.imei || (parsed.kind === "imei" ? parsed.code : ""), serial: scanned.serial });
  const lookups = [codes.imei, codes.serial].filter((code): code is string => Boolean(code));
  if (!lookups.length) return null;
  const unit = await prisma.deviceUnit.findFirst({
    where: { branchId, OR: lookups.flatMap((code) => [{ imei: code }, { serial: code }]) },
    orderBy: { receivedAt: "desc" },
    select: {
      imei: true, serial: true, status: true, colour: true, storage: true, mpn: true, modelNumber: true, batteryHealth: true, fmi: true, sim: true, osVersion: true,
      vendorName: true, sourceName: true, receivedAt: true, soldAt: true,
      product: { select: { id: true, name: true, category: true, condition: true, productGroup: true, sellingPrice: true } },
      sale: { select: { invoiceNumber: true } },
    },
  });
  if (!unit) return null;
  // The saved record fills in what this scan did not carry; anything the scan did read wins.
  const saved = overlayDevice(emptyScannedDevice(), {
    imei: unit.imei ?? "", serial: unit.serial ?? "", colour: unit.colour ?? "", storage: unit.storage ?? "", mpn: unit.mpn ?? "", modelNumber: unit.modelNumber ?? "",
    batteryHealth: unit.batteryHealth ? String(unit.batteryHealth) : "", fmi: unit.fmi ?? "", sim: unit.sim ?? "", version: unit.osVersion ?? "",
    name: unit.product.name.replace(/\s*\((?:Ex-UK|trade-in)\)\s*$/i, ""), category: unit.product.category, group: unit.product.productGroup ?? "",
  });
  return {
    device: overlayDevice(saved, scanned),
    unit: {
      status: unit.status,
      productId: unit.product.id,
      productName: unit.product.name,
      condition: unit.product.condition,
      sellingPrice: unit.product.sellingPrice,
      receivedAt: unit.receivedAt,
      source: unit.vendorName || unit.sourceName,
      soldAt: unit.soldAt,
      invoiceNumber: unit.sale?.invoiceNumber ?? null,
    },
  };
}

async function lookup(branchId: string, raw: string, condition?: string | null) {
  const parsed = parseScanPayload(raw);
  const known = await knownDevice(branchId, parseDeviceScan(raw), parsed);
  let device = known?.device ?? parseDeviceScan(raw);
  const identity = lookupAppleIdentity(raw) || (device.modelNumber ? lookupAppleIdentity(device.modelNumber) : null);
  if (!parsed.code && !deviceHasIdentity(device)) {
    return { code: "", kind: parsed.kind, device, known: null, catalog: appleCatalogHint(identity), suggestedCondition: null as "NEW" | "EX_UK" | null, matches: [] as ReturnType<typeof publicMatch>[] };
  }
  // A part number staff have already named stays known, so the next scan fills in by itself.
  if (!identity && !device.name && device.mpn) {
    const learned = await prisma.product.findFirst({ where: { branchId, mpn: device.mpn }, select: { name: true, category: true, productGroup: true } });
    if (learned) device = overlayDevice(device, { name: learned.name.replace(/\s*\((?:Ex-UK|trade-in)\)\s*$/i, ""), category: learned.category, group: learned.productGroup ?? "" });
  }
  const products = await productsForBranch(branchId);
  const hits = parsed.code || device.modelNumber || device.name
    ? matchScanProducts(raw, products, { condition, identity })
    : [];
  return {
    code: parsed.code || device.imei || device.modelNumber || device.mpn,
    kind: parsed.kind,
    device,
    known: known?.unit ?? null,
    catalog: appleCatalogHint(identity),
    suggestedCondition: parsed.kind === "mpn" ? suggestedConditionFromMpn(parsed.code) : null,
    matches: hits.map((hit) => publicMatch(hit.product, hit.reason)),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot access inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const code = params.get("code") || "";
  const condition = params.get("condition") || "";
  const result = await lookup(session.user.branchId, code, condition === "NEW" || condition === "EX_UK" || condition === "TRADE_IN" ? condition : null);
  if (!result.code && !deviceHasIdentity(result.device)) {
    return NextResponse.json({ error: "Scan a barcode, QR code, IMEI, Apple model number or About details." }, { status: 400 });
  }
  return NextResponse.json(result);
}

const receiveSchema = z.object({
  code: z.string().trim().min(2).max(800),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  productId: z.string().min(8).max(40).optional(),
  condition: z.enum(["NEW", "EX_UK", "TRADE_IN"]),
  vendorName: z.string().trim().max(120).optional(),
  sellingPrice: z.coerce.number().int().positive().max(2_000_000_000).optional(),
  deviceName: z.string().trim().max(160).optional(),
  category: z.enum(productCategories).optional(),
  imei: z.string().trim().max(20).optional(),
  serial: z.string().trim().max(20).optional(),
  mpn: z.string().trim().max(20).optional(),
  modelNumber: z.string().trim().max(10).optional(),
  colour: z.string().trim().max(40).optional(),
  storage: z.string().trim().max(10).optional(),
  batteryHealth: z.string().trim().max(4).optional(),
  fmi: z.string().trim().max(10).optional(),
  sim: z.string().trim().max(20).optional(),
  version: z.string().trim().max(20).optional(),
  reorderLevel: z.coerce.number().int().nonnegative().max(100000).optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

function deviceFromBody(raw: string, body: z.infer<typeof receiveSchema>): ScannedDevice {
  return overlayDevice(parseDeviceScan(raw), {
    imei: body.imei,
    serial: body.serial,
    mpn: body.mpn,
    modelNumber: body.modelNumber,
    colour: body.colour,
    storage: body.storage,
    batteryHealth: body.batteryHealth,
    fmi: body.fmi,
    sim: body.sim,
    version: body.version,
    name: body.deviceName,
  });
}

function identifiedFields(device: ScannedDevice, identity: ReturnType<typeof lookupAppleIdentity>, chosenCategory?: string) {
  const name = device.name || identity?.name || "";
  // What staff chose wins, then the scan, then whatever the typed name makes clear.
  const named = lookupAppleIdentity(name);
  return {
    name: device.storage && !name.toUpperCase().includes(device.storage.toUpperCase()) ? `${name} ${device.storage}`.trim() : name,
    category: chosenCategory || device.category || identity?.category || named?.category || "",
    brand: "Apple",
    imei: device.imei || device.serial,
    mpn: device.mpn || null,
    colour: device.colour || null,
    storage: device.storage || null,
    serial: device.serial || null,
    modelNumber: device.modelNumber || null,
    batteryHealth: device.batteryHealth || null,
    fmi: device.fmi || null,
    sim: device.sim || null,
    version: device.version || null,
    productGroup: device.group || identity?.group || named?.group || name.replace(/\s+\d+\s*(GB|TB).*/i, "").trim() || null,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "inventory")) return denied(session.user, "inventory", "Your role cannot manage inventory.");
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  if (!hasPermission(session.user, "inventory.receive")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot receive inventory.");
  }

  const parsed = receiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mark the stock as New, Ex-UK or trade-in, then scan a barcode, QR code, IMEI or About details." }, { status: 400 });

  // A trade-in only enters stock through the sale it pays towards, with its value and seller on record.
  if (parsed.data.condition === "TRADE_IN") {
    return NextResponse.json({ error: "Trade-ins start with the sale of the new phone. Use Add a trade-in on the Sales page." }, { status: 400 });
  }
  if ((parsed.data.vendorName || "").trim().length < 2) {
    return NextResponse.json({ error: "Enter the vendor name before receiving New or Ex-UK stock." }, { status: 400 });
  }

  const scan = parseScanPayload(parsed.data.code);
  const lookupResult = await lookup(session.user.branchId, parsed.data.code, parsed.data.condition);
  const identity = lookupAppleIdentity(parsed.data.code);
  const device = deviceFromBody(parsed.data.code, parsed.data);
  const identified = identifiedFields(device, identity, parsed.data.category);
  if (!parsed.data.productId && lookupResult.matches.length === 0 && identified.name && !identified.category) {
    return NextResponse.json({ error: "Choose what this device is: iPhone, iPad, MacBook, Watch, AirPods or accessory.", matches: [], catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 400 });
  }

  if (parsed.data.condition === "EX_UK" && !parsed.data.productId && lookupResult.matches.length === 0) {
    const name = identified.name;
    if (!name || name === "Apple device") {
      return NextResponse.json({
        error: "This Ex-UK scan was recognised incompletely. Scan the QR / IMEI again, or type the model, then Receive.",
        matches: [],
        catalog: lookupResult.catalog,
        device,
        code: scan.code || lookupResult.code,
        kind: scan.kind,
      }, { status: 404 });
    }
    const inventory = await receiveExUkStock(prisma, {
      branchId: session.user.branchId,
      userId: session.user.id,
      userName: session.user.name ?? "Staff member",
      quantity: parsed.data.quantity,
      ...identified,
      name,
      sellingPrice: parsed.data.sellingPrice,
      scannedCode: parsed.data.code,
      vendorName: parsed.data.vendorName?.trim(),
      reference: parsed.data.reference,
      note: parsed.data.note,
    });
    if ("error" in inventory) return NextResponse.json({ error: inventory.error }, { status: 409 });
    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: "STOCK_RECEIVED",
      summary: `Received Ex-UK ${inventory.product.name} from ${parsed.data.vendorName} (${inventory.previousStock} → ${inventory.stockOnHand} on hand)`,
      entityType: "InventoryItem",
      entityId: inventory.id,
    });
    return NextResponse.json({ ...inventory, catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 201 });
  }

  if (parsed.data.condition === "NEW" && !parsed.data.productId && lookupResult.matches.length === 0) {
    const name = identified.name;
    if (!name) {
      return NextResponse.json({ error: "Name the device, then Submit.", matches: [], catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 404 });
    }
    // A typed model may already be stocked under the shop's own name.
    const stocked = matchScanProducts(name, await productsForBranch(session.user.branchId), { condition: "NEW", identity: lookupAppleIdentity(name) });
    if (stocked.length > 1) {
      return NextResponse.json({ error: "More than one product matches. Confirm which one to receive.", matches: stocked.map((hit) => publicMatch(hit.product, hit.reason)), catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 409 });
    }
    if (!stocked.length) {
      const inventory = await receiveNewStock(prisma, {
        branchId: session.user.branchId,
        userId: session.user.id,
        userName: session.user.name ?? "Staff member",
        quantity: parsed.data.quantity,
        ...identified,
        scannedCode: parsed.data.code,
        vendorName: parsed.data.vendorName?.trim(),
        reference: parsed.data.reference,
        note: parsed.data.note,
      });
      if ("error" in inventory) return NextResponse.json({ error: inventory.error }, { status: 409 });
      await recordActivity({
        userId: session.user.id,
        sessionId: session.user.sessionId,
        action: "STOCK_RECEIVED",
        summary: `Received New ${inventory.product.name} from ${parsed.data.vendorName} (${inventory.previousStock} → ${inventory.stockOnHand} on hand)`,
        entityType: "InventoryItem",
        entityId: inventory.id,
      });
      return NextResponse.json({ ...inventory, catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 201 });
    }
    lookupResult.matches.push(publicMatch(stocked[0].product, stocked[0].reason));
  }

  let chosen = parsed.data.productId
    ? lookupResult.matches.find((match) => match.productId === parsed.data.productId)
    : lookupResult.matches.length === 1
      ? lookupResult.matches[0]
      : null;

  if (parsed.data.productId && !chosen) {
    const products = await productsForBranch(session.user.branchId);
    const product = products.find((row) => row.id === parsed.data.productId);
    if (product && product.condition === parsed.data.condition) chosen = publicMatch(product, scan.kind === "imei" ? "imei" : "sku");
  }

  if (!lookupResult.matches.length && !chosen) {
    return NextResponse.json({
      error: scan.kind === "imei"
        ? `IMEI ${scan.code} is not on file. Confirm which product this unit is, then Receive again.`
        : identity
          ? `${identity.name} was recognised. Set up or confirm the ${parsed.data.condition === "EX_UK" ? "Ex-UK" : "New"} SKU, then Receive to update quantity.`
          : `No product matches “${parsed.data.code}”. Confirm the product name or SKU below.`,
      matches: [],
      catalog: lookupResult.catalog,
      device,
      code: scan.code,
      kind: scan.kind,
    }, { status: 404 });
  }

  if (!chosen) {
    return NextResponse.json(
      {
        error: "More than one product matches. Confirm which one to receive.",
        matches: lookupResult.matches,
        catalog: lookupResult.catalog,
        device,
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
    imei: device.imei || (scan.kind === "imei" ? scan.code : null),
    device: {
      serial: device.serial || null,
      storage: device.storage || null,
      modelNumber: device.modelNumber || null,
      batteryHealth: device.batteryHealth || null,
      fmi: device.fmi || null,
      sim: device.sim || null,
      version: device.version || null,
    },
    scannedCode: parsed.data.code,
    mpn: device.mpn || null,
    colour: device.colour || null,
    vendorName: parsed.data.vendorName,
    sourceKind: "VENDOR",
  });

  if (!inventory) {
    return NextResponse.json({ error: "This product is not set up for your branch." }, { status: 404 });
  }
  if ("error" in inventory) return NextResponse.json({ error: inventory.error }, { status: 409 });

  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "STOCK_RECEIVED",
    summary: `Scanned in ${parsed.data.quantity} of ${inventory.product.name} (${inventory.previousStock} → ${inventory.stockOnHand} on hand)`,
    entityType: "InventoryItem",
    entityId: inventory.id,
  });

  return NextResponse.json({ ...inventory, match: chosen, catalog: lookupResult.catalog, device, code: scan.code || lookupResult.code, kind: scan.kind }, { status: 201 });
}
