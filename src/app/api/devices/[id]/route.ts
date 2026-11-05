import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { recordActivity, recordDeviceActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { batteryPercent, deviceIdentifiers } from "@/lib/device-units";
import { prisma } from "@/lib/prisma";

const detailsSchema = z.object({
  imei: z.string().trim().max(20).optional(),
  serial: z.string().trim().max(20).optional(),
  supplierCode: z.string().trim().toUpperCase().max(40).optional(),
  colour: z.string().trim().max(40).optional(),
  storage: z.string().trim().max(10).optional(),
  batteryHealth: z.union([z.string().trim().max(4), z.number().int()]).optional(),
  vendorName: z.string().trim().max(120).optional(),
}).strict().refine((data) => Object.keys(data).length > 0);

const labels: Record<string, string> = { imei: "IMEI", serial: "serial", supplierCode: "supplier sticker", colour: "colour", storage: "storage", batteryHealth: "battery", vendorName: "vendor" };

async function findUnit(id: string, user: { branchId?: string | null; role?: string }) {
  return prisma.deviceUnit.findFirst({
    where: { id, ...(canSeeAllBranches(user as never) ? {} : { branchId: user.branchId ?? "" }) },
    select: { id: true, branchId: true, productId: true, status: true, imei: true, serial: true, supplierCode: true, colour: true, storage: true, batteryHealth: true, vendorName: true, unitCode: true, product: { select: { name: true } } },
  });
}

/** Correct a phone's details, such as a mistyped IMEI or battery reading. The change goes on its timeline. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "inventory.receive")) return denied(session.user, "inventory.receive", "Your permissions cannot change device details.");
  const parsed = detailsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid device details." }, { status: 400 });
  const { id } = await context.params;
  const unit = await findUnit(id, session.user);
  if (!unit) return NextResponse.json({ error: "That device was not found." }, { status: 404 });

  const codes = deviceIdentifiers({ imei: parsed.data.imei ?? unit.imei, serial: parsed.data.serial ?? unit.serial });
  if (!codes.imei && !codes.serial) return NextResponse.json({ error: "Keep an IMEI or serial on the device." }, { status: 400 });
  if (parsed.data.imei && !codes.imei) return NextResponse.json({ error: "An IMEI has 15 digits." }, { status: 400 });
  const next = {
    imei: codes.imei,
    serial: codes.serial,
    ...(parsed.data.supplierCode !== undefined ? { supplierCode: parsed.data.supplierCode || null } : {}),
    ...(parsed.data.colour !== undefined ? { colour: parsed.data.colour || null } : {}),
    ...(parsed.data.storage !== undefined ? { storage: parsed.data.storage || null } : {}),
    ...(parsed.data.batteryHealth !== undefined ? { batteryHealth: batteryPercent(parsed.data.batteryHealth) } : {}),
    ...(parsed.data.vendorName !== undefined ? { vendorName: parsed.data.vendorName || null } : {}),
  };
  // Another phone already in stock cannot carry the same IMEI, serial or sticker.
  const clash = await prisma.deviceUnit.findFirst({
    where: {
      id: { not: unit.id },
      status: { in: ["IN_STOCK", "RESERVED"] },
      OR: [...(next.imei ? [{ imei: next.imei }] : []), ...(next.serial ? [{ serial: next.serial }] : []), ...(next.supplierCode ? [{ supplierCode: next.supplierCode }] : [])],
    },
    select: { product: { select: { name: true } } },
  });
  if (clash) return NextResponse.json({ error: `That code is already on ${clash.product.name} in stock.` }, { status: 409 });

  const before = unit as Record<string, unknown>;
  const changes = Object.entries(next).filter(([key, value]) => (before[key] ?? null) !== value).map(([key, value]) => `${labels[key] ?? key} ${before[key] ?? "not set"} → ${value ?? "not set"}`);
  if (!changes.length) return NextResponse.json({ ok: true, changed: 0 });
  await prisma.deviceUnit.update({ where: { id: unit.id }, data: next });
  await recordDeviceActivity(unit.id, session.user, "DEVICE_UPDATED", `Corrected ${changes.join(", ")}`);
  return NextResponse.json({ ok: true, changed: changes.length });
}

/** Take out a phone received by mistake. A sold or held phone stays: its sale needs the record. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "inventory.receive")) return denied(session.user, "inventory.receive", "Your permissions cannot remove devices.");
  const { id } = await context.params;
  const unit = await findUnit(id, session.user);
  if (!unit) return NextResponse.json({ error: "That device was not found." }, { status: 404 });
  if (unit.status !== "IN_STOCK") return NextResponse.json({ error: "Only a phone still in stock can be removed. This one has been sold or is held for a sale." }, { status: 409 });
  try {
    await prisma.$transaction(async (transaction) => {
      const item = await transaction.inventoryItem.findFirst({ where: { productId: unit.productId, branchId: unit.branchId }, select: { id: true, stockOnHand: true } });
      await transaction.devicePhoto.deleteMany({ where: { deviceUnitId: unit.id } });
      await transaction.deviceUnit.delete({ where: { id: unit.id } });
      if (item && item.stockOnHand > 0) {
        await transaction.inventoryItem.update({ where: { id: item.id }, data: { stockOnHand: { decrement: 1 } } });
        await transaction.inventoryMovement.create({
          data: { branchId: unit.branchId, productId: unit.productId, userId: session.user.id, type: "ADJUSTMENT", quantity: -1, reference: unit.unitCode || unit.imei || unit.serial || "REMOVED", note: "Phone received by mistake, removed" },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: "This phone is linked to a trade-in or plan, so it stays for the records." }, { status: 409 });
    }
    console.error("Device removal failed", error);
    return NextResponse.json({ error: "The device could not be removed." }, { status: 500 });
  }
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "STOCK_ADJUSTED",
    summary: `Removed ${unit.product.name} (${[unit.unitCode, unit.imei || unit.serial].filter(Boolean).join(" · ")}) received by mistake`,
    entityType: "Product",
    entityId: unit.productId,
  });
  return NextResponse.json({ ok: true });
}
