import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { rejectSensitiveQuery } from "@/lib/request-guards";
import { recordStockUnit, StockUnitError } from "@/lib/stock-units";

const noStore = { "Cache-Control": "no-store" };
const optionalText = (max: number) => z.union([z.string().trim().max(max), z.literal("")]).optional();

const deviceSchema = z.object({
  productId: z.string().cuid(),
  imei: optionalText(20),
  imei2: optionalText(20),
  serialNumber: optionalText(40),
  barcode: optionalText(32),
  condition: z.enum(["NEW", "OPEN_BOX", "REFURBISHED", "USED"]),
  cosmeticGrade: z.union([z.enum(["A", "B", "C"]), z.literal(""), z.null()]).optional(),
  color: optionalText(40),
  storage: optionalText(40),
  ram: optionalText(40),
  screenSize: optionalText(40),
  processor: optionalText(80),
  region: optionalText(40),
  camera: optionalText(40),
  networkLock: z.enum(["UNKNOWN", "LOCKED", "UNLOCKED"]),
  osVersion: optionalText(40),
  activationLock: z.enum(["UNKNOWN", "ON", "OFF"]),
  batteryHealth: z.union([z.number().int().min(0).max(100), z.null()]).optional(),
  location: optionalText(80),
  supplierName: optionalText(120),
  purchaseReference: optionalText(100),
  notes: optionalText(300),
}).strict();

async function authorize() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore }) };
  if (!(await canUseCapability(session.user.role, "inventory", session.user.id))) {
    return { error: NextResponse.json({ error: "Your role cannot manage inventory." }, { status: 403, headers: noStore }) };
  }
  if (!session.user.branchId) return { error: NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403, headers: noStore }) };
  if (!["OWNER", "BRANCH_MANAGER", "INVENTORY_LEAD"].includes(session.user.role)) {
    return { error: NextResponse.json({ error: "Your role cannot record devices." }, { status: 403, headers: noStore }) };
  }
  return { session };
}

export async function POST(request: Request) {
  const rejected = rejectSensitiveQuery(request);
  if (rejected) return rejected;
  const access = await authorize();
  if ("error" in access && access.error) return access.error;
  const session = access.session;
  if (!session?.user.branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403, headers: noStore });

  const parsed = deviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the device, its IMEI or serial, and its condition." }, { status: 400, headers: noStore });

  try {
    const recorded = await prisma.$transaction((transaction) => recordStockUnit(transaction, {
      ...parsed.data,
      cosmeticGrade: parsed.data.cosmeticGrade || null,
      branchId: session.user.branchId!,
      userId: session.user.id,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({
      id: recorded.unit.id,
      status: recorded.unit.status,
      identifiedExisting: recorded.identifiedExisting,
      stockOnHand: recorded.stockOnHand,
      product: { id: recorded.product.id, name: recorded.product.name, sku: recorded.product.sku },
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof StockUnitError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      const message = error.code === "P2002" ? "This IMEI or serial is already on record." : "Stock changed while recording this device. Try again.";
      return NextResponse.json({ error: message }, { status: 409, headers: noStore });
    }
    console.error("Device receipt failed", error);
    return NextResponse.json({ error: "The device could not be recorded." }, { status: 500, headers: noStore });
  }
}
