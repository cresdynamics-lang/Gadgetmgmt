import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { isAppleMpn, normalizeGtin } from "@/lib/apple-barcodes";
import { deviceNotes, type ScannedDevice } from "@/lib/device-scan";
import { batteryPercent, deviceIdentifiers, findActiveUnit } from "@/lib/device-units";
import { allocateUnitCode } from "@/lib/unit-code";
import { parseScanPayload } from "@/lib/inventory-scan";

function identifiedNotes(kind: string, input: { serial?: string | null; batteryHealth?: string | null; fmi?: string | null; sim?: string | null; version?: string | null }) {
  const extras = deviceNotes({
    serial: input.serial || "",
    batteryHealth: input.batteryHealth || "",
    fmi: input.fmi || "",
    sim: input.sim || "",
    version: input.version || "",
  } as ScannedDevice);
  return [kind, extras || null].filter(Boolean).join(" · ");
}

type Db = Prisma.TransactionClient;

/** A receipt that must not be saved; thrown so the whole transaction rolls back. */
export class ReceiveError extends Error {}

/** About-screen details of one phone, saved on its device record. */
export type DeviceDetails = {
  serial?: string | null;
  storage?: string | null;
  modelNumber?: string | null;
  batteryHealth?: string | null;
  fmi?: string | null;
  sim?: string | null;
  version?: string | null;
};

export type StockSourceInput = {
  vendorName?: string | null;
  sourceKind?: "VENDOR" | "TRADE_IN" | null;
  sourceName?: string | null;
  sourcePhone?: string | null;
  hasReceipt?: boolean | null;
  hasBox?: boolean | null;
  gtin?: string | null;
  mpn?: string | null;
  colour?: string | null;
  scannedCode?: string | null;
  sellingPrice?: number | null;
};

type ReceiveInput = {
  branchId: string;
  productId: string;
  userId: string;
  userName: string;
  quantity: number;
  reorderLevel?: number;
  reference?: string | null;
  note?: string | null;
  imei?: string | null;
  device?: DeviceDetails;
  tradeInId?: string | null;
} & StockSourceInput;

const productSelect = {
  id: true,
  name: true,
  sku: true,
  category: true,
  brand: true,
  condition: true,
  colour: true,
  costPrice: true,
  imei: true,
  gtin: true,
  mpn: true,
} as const;

function barcodesFromScan(input: StockSourceInput) {
  const parsed = parseScanPayload(input.scannedCode || "");
  const gtin = input.gtin || (parsed.kind === "gtin" ? parsed.code : null);
  const mpn = input.mpn || (parsed.kind === "mpn" ? parsed.code : isAppleMpn(input.scannedCode || "") ? String(input.scannedCode).trim().toUpperCase() : null);
  return {
    gtin: gtin ? normalizeGtin(gtin) || gtin : null,
    mpn: mpn ? mpn.toUpperCase() : null,
  };
}

function sourceNote(input: StockSourceInput, fallback: string | null) {
  if (fallback) return fallback;
  if (input.sourceKind === "TRADE_IN") {
    const person = [input.sourceName, input.sourcePhone].filter(Boolean).join(" · ");
    const extras = [input.hasReceipt ? "receipt" : null, input.hasBox ? "phone box" : null].filter(Boolean).join(" and ");
    return `Trade-in from ${person || "walk-in"}${extras ? ` · ${extras}` : ""}`;
  }
  if (input.vendorName) return `Vendor ${input.vendorName}`;
  return null;
}

function movementSourceKind(input: StockSourceInput) {
  return input.sourceKind || (input.sourceName ? "TRADE_IN" : input.vendorName ? "VENDOR" : null);
}

async function receiveInTx(transaction: Db, input: ReceiveInput) {
  let existing = await transaction.inventoryItem.findUnique({
    where: { branchId_productId: { branchId: input.branchId, productId: input.productId } },
    select: {
      id: true,
      stockOnHand: true,
      product: { select: productSelect },
      branch: { select: { name: true } },
    },
  });

  if (!existing) {
    const product = await transaction.product.findFirst({
      where: { id: input.productId, branchId: input.branchId },
      select: productSelect,
    });
    const branch = await transaction.branch.findUnique({ where: { id: input.branchId }, select: { name: true } });
    if (!product || !branch) return null;
    const created = await transaction.inventoryItem.create({
      data: {
        branchId: input.branchId,
        productId: product.id,
        stockOnHand: 0,
        reorderLevel: input.reorderLevel ?? 0,
      },
      select: { id: true, stockOnHand: true },
    });
    existing = { id: created.id, stockOnHand: created.stockOnHand, product, branch };
  }

  const identifiers = deviceIdentifiers({ imei: input.imei, serial: input.device?.serial });
  const imei = identifiers.imei || "";
  if (identifiers.imei || identifiers.serial) {
    if (input.quantity !== 1) throw new ReceiveError("Scan one phone at a time. Each IMEI or serial is one unit.");
    const active = await findActiveUnit(transaction, identifiers);
    if (active) throw new ReceiveError(`${identifiers.imei || identifiers.serial} is already in stock as ${active.product.name}.`);
  }
  const barcodes = barcodesFromScan(input);
  const productPatch: { imei?: string; gtin?: string; mpn?: string; colour?: string; sellingPrice?: number } = {};
  // A New product is a model with many phones, so its IMEIs live on the device records instead.
  if (imei.length === 15 && !existing.product.imei && existing.product.condition !== "NEW") {
    const taken = await transaction.product.findFirst({ where: { imei }, select: { id: true } });
    if (!taken) productPatch.imei = imei;
  }
  if (barcodes.gtin && !existing.product.gtin) productPatch.gtin = barcodes.gtin;
  if (barcodes.mpn && !existing.product.mpn) productPatch.mpn = barcodes.mpn;
  if (input.colour && !existing.product.colour && existing.product.condition !== "NEW") productPatch.colour = input.colour;
  if (input.sellingPrice && input.sellingPrice > 0) productPatch.sellingPrice = input.sellingPrice;
  if (Object.keys(productPatch).length) {
    await transaction.product.update({ where: { id: existing.product.id }, data: productPatch });
  }

  const updated = await transaction.inventoryItem.update({
    where: { id: existing.id },
    data: {
      stockOnHand: { increment: input.quantity },
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
    },
    select: { id: true, stockOnHand: true, reservedStock: true },
  });
  const note = sourceNote(input, input.note || null);
  const movement = await transaction.inventoryMovement.create({
    data: {
      branchId: input.branchId,
      productId: input.productId,
      userId: input.userId,
      type: "RECEIPT",
      quantity: input.quantity,
      reference: input.reference || null,
      note,
      vendorName: input.vendorName || null,
      sourceKind: movementSourceKind(input),
      sourceName: input.sourceName || null,
      sourcePhone: input.sourcePhone || null,
      hasReceipt: input.hasReceipt ?? null,
      hasBox: input.hasBox ?? null,
    },
    select: { id: true, createdAt: true },
  });
  let unit: { id: string; unitCode: string } | null = null;
  if (identifiers.imei || identifiers.serial) {
    const created = await transaction.deviceUnit.create({
      data: {
        branchId: input.branchId,
        productId: existing.product.id,
        unitCode: await allocateUnitCode(transaction),
        imei: identifiers.imei,
        serial: identifiers.serial,
        condition: existing.product.condition,
        colour: input.colour || existing.product.colour || null,
        storage: input.device?.storage || null,
        mpn: barcodes.mpn || existing.product.mpn || null,
        modelNumber: input.device?.modelNumber || null,
        batteryHealth: batteryPercent(input.device?.batteryHealth),
        fmi: input.device?.fmi || null,
        sim: input.device?.sim || null,
        osVersion: input.device?.version || null,
        costPrice: existing.product.costPrice,
        sourceKind: movementSourceKind(input),
        vendorName: input.vendorName || null,
        sourceName: input.sourceName || null,
        sourcePhone: input.sourcePhone || null,
        reference: input.reference || null,
        receivedById: input.userId,
        receivedAt: movement.createdAt,
        tradeInId: input.tradeInId || null,
      },
      select: { id: true, unitCode: true },
    });
    unit = { id: created.id, unitCode: created.unitCode || "" };
  }
  return {
    ...updated,
    previousStock: existing.stockOnHand,
    product: {
      ...existing.product,
      imei: productPatch.imei || existing.product.imei || imei || null,
      gtin: productPatch.gtin || existing.product.gtin,
      mpn: productPatch.mpn || existing.product.mpn,
      colour: productPatch.colour || existing.product.colour,
    },
    branchName: existing.branch.name,
    receivedBy: input.userName || "Staff member",
    reference: input.reference || null,
    note,
    vendorName: input.vendorName || null,
    sourceName: input.sourceName || null,
    sourcePhone: input.sourcePhone || null,
    hasReceipt: input.hasReceipt ?? null,
    hasBox: input.hasBox ?? null,
    movement,
    unit,
  };
}

/** Turn a ReceiveError into `{ error }` for the caller; anything else still throws. */
async function catchReceiveError<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ReceiveError) return { error: error.message };
    throw error;
  }
}

export async function receiveProductStock(prisma: PrismaClient | Db, input: ReceiveInput) {
  if ("$transaction" in prisma) {
    return catchReceiveError(() => prisma.$transaction((transaction) => receiveInTx(transaction, input)));
  }
  return catchReceiveError(() => receiveInTx(prisma, input));
}

/** Receive inside a transaction the caller already holds (throws ReceiveError to roll it back). */
export const receiveStockInTransaction = receiveInTx;

type IdentifiedReceiveInput = {
  branchId: string;
  userId: string;
  userName: string;
  quantity?: number;
  name: string;
  category: string;
  brand?: string | null;
  imei?: string | null;
  mpn?: string | null;
  sellingPrice?: number;
  costPrice?: number;
  colour?: string | null;
  storage?: string | null;
  serial?: string | null;
  modelNumber?: string | null;
  batteryHealth?: string | null;
  fmi?: string | null;
  sim?: string | null;
  version?: string | null;
  productGroup?: string | null;
  scannedCode?: string | null;
  vendorName?: string | null;
  sourceName?: string;
  sourcePhone?: string;
  hasReceipt?: boolean;
  hasBox?: boolean;
  reference?: string | null;
  note?: string | null;
};

function deviceDetails(input: IdentifiedReceiveInput): DeviceDetails {
  return {
    serial: input.serial,
    storage: input.storage,
    modelNumber: input.modelNumber,
    batteryHealth: input.batteryHealth,
    fmi: input.fmi,
    sim: input.sim,
    version: input.version,
  };
}

/** New stock of a model the shop has not stocked before: one product for the model, one record per device. */
export async function receiveNewStock(prisma: PrismaClient, input: IdentifiedReceiveInput) {
  const sku = `NEW-${input.name}`.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return catchReceiveError(() => prisma.$transaction(async (transaction) => {
    const existing = await transaction.product.findUnique({ where: { sku }, select: { id: true } });
    const product = existing ?? await transaction.product.create({
      data: {
        sku,
        mpn: input.mpn || null,
        name: input.name,
        category: input.category,
        brand: input.brand || "Apple",
        colour: null,
        configuration: input.storage || null,
        productGroup: input.productGroup || null,
        condition: "NEW",
        costPrice: input.costPrice ?? 0,
        sellingPrice: input.sellingPrice && input.sellingPrice > 0 ? input.sellingPrice : 1,
        branchId: input.branchId,
        inventory: { create: { branchId: input.branchId, stockOnHand: 0 } },
      },
      select: { id: true },
    });
    const received = await receiveInTx(transaction, {
      branchId: input.branchId,
      productId: product.id,
      userId: input.userId,
      userName: input.userName,
      quantity: input.quantity ?? 1,
      reference: input.reference || "NEW",
      note: input.note,
      imei: input.imei,
      device: deviceDetails(input),
      scannedCode: input.scannedCode,
      mpn: input.mpn,
      colour: input.colour,
      vendorName: input.vendorName,
      sellingPrice: input.sellingPrice,
      sourceKind: "VENDOR",
    });
    if (!received) throw new ReceiveError("New stock could not be added to this branch.");
    return received;
  }));
}

export async function receiveExUkStock(prisma: PrismaClient, input: IdentifiedReceiveInput) {
  const imei = (input.imei || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const skuBase = `EXUK-${input.name}`.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

  return catchReceiveError(() => prisma.$transaction(async (transaction) => {
    if (imei.length >= 8) {
      const known = await transaction.product.findUnique({
        where: { imei },
        select: { id: true, inventory: { select: { stockOnHand: true } } },
      });
      if (known && known.inventory.some((item) => item.stockOnHand > 0)) {
        return { error: "A device with this IMEI or serial is already in stock." as const };
      }
      if (known) await transaction.product.update({ where: { id: known.id }, data: { imei: null } });
    }

    const sku = imei.length >= 8 ? `EXUK-${imei}` : skuBase;
    const existingSku = await transaction.product.findUnique({ where: { sku }, select: { id: true } });
    const created = await transaction.product.create({
      data: {
        sku: existingSku ? `${sku.slice(0, 48)}-${randomBytes(2).toString("hex").toUpperCase()}` : sku.slice(0, 64),
        imei: imei.length >= 8 ? imei : null,
        mpn: input.mpn || null,
        name: /ex-uk/i.test(input.name) ? input.name : `${input.name} (Ex-UK)`,
        category: input.category,
        brand: input.brand || "Apple",
        colour: input.colour || null,
        configuration: input.storage || null,
        productGroup: input.productGroup || null,
        condition: "EX_UK",
        catalogNotes: identifiedNotes(input.vendorName ? `Ex-UK · vendor ${input.vendorName}` : "Ex-UK", input),
        costPrice: input.costPrice ?? 0,
        sellingPrice: input.sellingPrice && input.sellingPrice > 0 ? input.sellingPrice : 1,
        branchId: input.branchId,
        inventory: { create: { branchId: input.branchId, stockOnHand: 0 } },
      },
      select: { id: true },
    });

    const received = await receiveInTx(transaction, {
      branchId: input.branchId,
      productId: created.id,
      userId: input.userId,
      userName: input.userName,
      quantity: input.quantity ?? 1,
      reference: input.reference || (imei ? `EX-UK-${imei.slice(-8)}` : "EX-UK"),
      note: input.note,
      imei,
      device: deviceDetails(input),
      scannedCode: input.scannedCode,
      mpn: input.mpn,
      colour: input.colour,
      vendorName: input.vendorName,
      sellingPrice: input.sellingPrice,
      sourceKind: "VENDOR",
    });
    if (!received) return { error: "Ex-UK stock could not be added to this branch." as const };
    return received;
  }));
}
