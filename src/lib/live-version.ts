import { prisma } from "@/lib/prisma";

const CACHE_MS = 4_000;
let cached: { at: number; version: Promise<string> } | null = null;

async function readVersion() {
  const stamps = await Promise.all([
    prisma.activityEvent.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.sale.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.salePayment.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.payment.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.mpesaC2BTransaction.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.paymentRequest.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.creditPlan.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.inventoryMovement.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.inventoryItem.aggregate({ _max: { lastUpdatedAt: true } }).then((row) => row._max.lastUpdatedAt),
    prisma.deviceUnit.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.product.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.customer.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
    prisma.tradeIn.aggregate({ _max: { createdAt: true } }).then((row) => row._max.createdAt),
    prisma.customerNotification.aggregate({ _max: { updatedAt: true } }).then((row) => row._max.updatedAt),
  ]);
  return stamps.map((stamp) => stamp?.getTime().toString(36) ?? "0").join(".");
}

/**
 * A fingerprint of the latest change across sales, payments, stock and Lipa data.
 * Pages refresh only when it changes. Shared across open tabs for a few seconds to keep the database quiet.
 */
export function liveDataVersion() {
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    const version = readVersion();
    cached = { at: now, version };
    version.catch(() => { if (cached?.version === version) cached = null; });
  }
  return cached.version;
}
