import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

/** IMEIs are 15 digits; serials are 8–20 letters and digits. Anything else is not a device code. */
export function normalizeDeviceCode(raw: string | null | undefined) {
  const code = String(raw || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return code.length >= 8 && code.length <= 20 ? code : "";
}

/** Split a scanned code into the IMEI and serial fields a device record keeps. */
export function deviceIdentifiers(input: { imei?: string | null; serial?: string | null }) {
  const imeiCode = normalizeDeviceCode(input.imei);
  const serialCode = normalizeDeviceCode(input.serial);
  const imei = /^\d{15}$/.test(imeiCode) ? imeiCode : "";
  const serial = serialCode || (imeiCode && !imei ? imeiCode : "");
  return { imei: imei || null, serial: serial && serial !== imei ? serial : null };
}

export type TrackedUnit = { id: string; imei: string | null; serial: string | null };

export type UnitAllocation =
  | { ok: true; unitIds: string[] }
  | { ok: false; reason: "missing"; missing: number }
  | { ok: false; reason: "unknown"; code: string }
  | { ok: false; reason: "too_many" };

/**
 * Decide which phones leave stock on a sale line.
 * Phones received before per-phone tracking have no record ("untracked"); those can still be sold by quantity.
 * When every tracked phone has to go anyway, they are picked without a scan.
 */
export function planUnitAllocation(input: { quantity: number; stockOnHand: number; activeUnits: number; tracked: TrackedUnit[]; scanned: string[] }): UnitAllocation {
  const codes = [...new Set(input.scanned.map(normalizeDeviceCode).filter(Boolean))];
  if (codes.length > input.quantity) return { ok: false, reason: "too_many" };
  const chosen: string[] = [];
  for (const code of codes) {
    const unit = input.tracked.find((item) => (item.imei === code || item.serial === code) && !chosen.includes(item.id));
    if (!unit) return { ok: false, reason: "unknown", code };
    chosen.push(unit.id);
  }
  const untracked = Math.max(0, input.stockOnHand - input.activeUnits);
  const needed = Math.min(input.tracked.length, Math.max(0, input.quantity - untracked));
  if (chosen.length >= needed) return { ok: true, unitIds: chosen };
  const remaining = input.tracked.filter((unit) => !chosen.includes(unit.id));
  if (remaining.length === needed - chosen.length) return { ok: true, unitIds: [...chosen, ...remaining.map((unit) => unit.id)] };
  return { ok: false, reason: "missing", missing: needed - chosen.length };
}

/** How many phones the cashier has to scan for a line; zero when the system can pick them itself. */
export function scansRequired(input: { quantity: number; untracked: number; tracked: number }) {
  const needed = Math.min(input.tracked, Math.max(0, input.quantity - input.untracked));
  return needed === input.tracked ? 0 : needed;
}

/** The device currently in the shop with this IMEI or serial, if any. */
export function findActiveUnit(transaction: Db, codes: { imei?: string | null; serial?: string | null }) {
  const or = [codes.imei ? { imei: codes.imei } : null, codes.serial ? { serial: codes.serial } : null, codes.imei ? { serial: codes.imei } : null, codes.serial ? { imei: codes.serial } : null]
    .filter((item): item is { imei: string } | { serial: string } => Boolean(item));
  if (!or.length) return Promise.resolve(null);
  return transaction.deviceUnit.findFirst({
    where: { status: { in: ["IN_STOCK", "RESERVED"] }, OR: or },
    select: { id: true, productId: true, status: true, product: { select: { name: true } } },
  });
}

export class SaleUnitError extends Error {
  constructor(public readonly productName: string, public readonly detail: UnitAllocation & { ok: false }) {
    super("SALE_UNIT_ERROR");
  }

  get userMessage() {
    if (this.detail.reason === "missing") return `Scan the IMEI or serial of ${this.detail.missing === 1 ? "the" : `${this.detail.missing}`} ${this.productName} ${this.detail.missing === 1 ? "phone" : "phones"} being sold.`;
    if (this.detail.reason === "unknown") return `${this.detail.code} is not an in-stock ${this.productName}. Check the phone and scan again.`;
    return `More IMEIs were scanned than ${this.productName} units in the sale.`;
  }
}

/** Work out the phones for each sale line, throwing a SaleUnitError a cashier can act on. */
export async function allocateSaleUnits(
  transaction: Db,
  input: { branchId: string; lines: { productId: string; productName: string; quantity: number; stockOnHand: number; scanned: string[] }[] },
) {
  const productIds = input.lines.map((line) => line.productId);
  const units = await transaction.deviceUnit.findMany({
    where: { branchId: input.branchId, productId: { in: productIds }, status: { in: ["IN_STOCK", "RESERVED"] } },
    select: { id: true, productId: true, imei: true, serial: true, status: true },
    orderBy: { receivedAt: "asc" },
  });
  const allocated = new Map<string, string[]>();
  for (const line of input.lines) {
    const active = units.filter((unit) => unit.productId === line.productId);
    const plan = planUnitAllocation({
      quantity: line.quantity,
      stockOnHand: line.stockOnHand,
      activeUnits: active.length,
      tracked: active.filter((unit) => unit.status === "IN_STOCK"),
      scanned: line.scanned,
    });
    if (!plan.ok) throw new SaleUnitError(line.productName, plan);
    allocated.set(line.productId, plan.unitIds);
  }
  return allocated;
}

/** Hand the chosen phones to a sale. Reserved phones wait for payment before they count as sold. */
export async function attachUnitsToSale(
  transaction: Db,
  input: { unitIds: string[]; saleId: string; saleItemId: string; soldById: string; reserved: boolean },
) {
  if (!input.unitIds.length) return;
  const updated = await transaction.deviceUnit.updateMany({
    where: { id: { in: input.unitIds }, status: "IN_STOCK" },
    data: {
      status: input.reserved ? "RESERVED" : "SOLD",
      saleId: input.saleId,
      saleItemId: input.saleItemId,
      soldById: input.soldById,
      soldAt: input.reserved ? null : new Date(),
    },
  });
  if (updated.count !== input.unitIds.length) throw new Error("DEVICE_UNIT_CHANGED");
}

/** A pending sale was paid: its reserved phones are now sold. */
export function completeSaleUnits(transaction: Db, saleId: string) {
  return transaction.deviceUnit.updateMany({ where: { saleId, status: "RESERVED" }, data: { status: "SOLD", soldAt: new Date() } });
}

/** A pending sale lapsed: its reserved phones go back on the shelf. */
export function releaseSaleUnits(transaction: Db, saleId: string) {
  return transaction.deviceUnit.updateMany({
    where: { saleId, status: "RESERVED" },
    data: { status: "IN_STOCK", saleId: null, saleItemId: null, soldById: null, soldAt: null },
  });
}

export function batteryPercent(value: string | number | null | undefined) {
  const percent = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isInteger(percent) && percent >= 1 && percent <= 100 ? percent : null;
}
