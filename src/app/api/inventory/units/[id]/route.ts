import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { activationAllowsStock } from "@/lib/device-units";
import { auth } from "@/auth";
import { canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { rejectSensitiveQuery } from "@/lib/request-guards";
import { moveStockUnit, StockUnitError } from "@/lib/stock-units";

const noStore = { "Cache-Control": "no-store" };

const detailsSchema = z.object({
  color: z.string().trim().max(40),
  storage: z.string().trim().max(40),
  ram: z.string().trim().max(40),
  location: z.string().trim().max(80),
  notes: z.string().trim().max(300),
  condition: z.enum(["NEW", "OPEN_BOX", "REFURBISHED", "USED"]),
  activationLock: z.enum(["UNKNOWN", "ON", "OFF"]),
}).strict();

const moveSchema = z.object({
  status: z.enum(["IN_STOCK", "RESERVED", "IN_REPAIR", "RETURNED"]),
  location: z.union([z.string().trim().max(80), z.literal("")]).optional(),
}).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!(await canUseCapability(session.user.role, "inventory"))) return NextResponse.json({ error: "Your role cannot manage inventory." }, { status: 403, headers: noStore });
  if (!session.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403, headers: noStore });
  if (!["OWNER", "BRANCH_MANAGER", "INVENTORY_LEAD"].includes(session.user.role)) {
    return NextResponse.json({ error: "Your role cannot move devices." }, { status: 403, headers: noStore });
  }

  const { id } = await params;
  if (!id || id.length > 40) return NextResponse.json({ error: "That device could not be found." }, { status: 404, headers: noStore });
  const body = await request.json().catch(() => null);
  const details = detailsSchema.safeParse(body);
  if (details.success) {
    try {
      await prisma.$transaction(async (transaction) => {
        const unit = await transaction.stockUnit.findFirst({ where: { id, branchId: session.user.branchId! } });
        if (!unit) throw new StockUnitError(404, "That device is not at your branch.");
        if (unit.status === "SOLD" || unit.saleItemId) throw new StockUnitError(409, "Devices tied to a sale cannot be edited from stock.");
        if ((unit.status === "IN_STOCK" || unit.status === "RESERVED") && !activationAllowsStock(details.data.condition, details.data.activationLock)) {
          throw new StockUnitError(400, "Set activation lock to off before saving a used or open-box device on the shelf.");
        }
        await transaction.stockUnit.update({ where: { id: unit.id }, data: {
          ...details.data,
          color: details.data.color || null,
          storage: details.data.storage || null,
          ram: details.data.ram || null,
          location: details.data.location || null,
          notes: details.data.notes || null,
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ id }, { headers: noStore });
    } catch (error) {
      if (error instanceof StockUnitError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "This device changed. Refresh and try again." }, { status: 409, headers: noStore });
      console.error("Device details update failed", error);
      return NextResponse.json({ error: "The device details could not be saved." }, { status: 500, headers: noStore });
    }
  }
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter valid device details or choose a stock status." }, { status: 400, headers: noStore });

  try {
    const moved = await prisma.$transaction((transaction) => moveStockUnit(transaction, {
      id,
      branchId: session.user.branchId!,
      status: parsed.data.status,
      location: parsed.data.location,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(moved, { headers: noStore });
  } catch (error) {
    if (error instanceof StockUnitError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Stock changed while moving this device. Try again." }, { status: 409, headers: noStore });
    }
    console.error("Device status update failed", error);
    return NextResponse.json({ error: "The device could not be updated." }, { status: 500, headers: noStore });
  }
}
