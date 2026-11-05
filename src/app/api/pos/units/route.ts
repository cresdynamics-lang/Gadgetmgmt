import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { denied } from "@/lib/authz";
import { parseDeviceScan } from "@/lib/device-scan";
import { deviceIdentifiers, normalizeDeviceCode } from "@/lib/device-units";
import { prisma } from "@/lib/prisma";

/** Find the in-stock phone a cashier scanned, so checkout can add it to the sale. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "sales")) return denied(session.user, "sales", "Your role cannot access sales.");
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const raw = new URL(request.url).searchParams.get("code") || "";
  const parsed = parseDeviceScan(raw);
  const codes = deviceIdentifiers({ imei: parsed.imei || normalizeDeviceCode(raw), serial: parsed.serial });
  const lookups = [codes.imei, codes.serial].filter((code): code is string => Boolean(code));
  // The GadgetHub label or an Ex-UK supplier's sticker finds the phone as well.
  const label = parsed.unitCode || "";
  const sticker = /^[A-Z0-9-]{4,40}$/i.test(raw.trim()) ? raw.trim().toUpperCase() : "";
  if (!lookups.length && !label && !sticker) return NextResponse.json({ error: "Scan the IMEI barcode, serial, GadgetHub label or the phone's QR label." }, { status: 400 });

  const unit = await prisma.deviceUnit.findFirst({
    where: { branchId, OR: [...lookups.flatMap((code) => [{ imei: code }, { serial: code }]), ...(label ? [{ unitCode: label }] : []), ...(sticker ? [{ supplierCode: sticker }] : [])] },
    orderBy: { receivedAt: "desc" },
    select: { id: true, imei: true, serial: true, status: true, productId: true, product: { select: { name: true } } },
  });
  if (!unit) return NextResponse.json({ error: `${lookups[0] || label || sticker} is not on file. Receive the phone into stock first.` }, { status: 404 });
  if (unit.status !== "IN_STOCK") {
    return NextResponse.json({ error: `${unit.product.name} (${unit.imei || unit.serial}) is ${unit.status === "SOLD" ? "already sold" : "held for a sale awaiting payment"}.` }, { status: 409 });
  }
  return NextResponse.json({ code: unit.imei || unit.serial, productId: unit.productId, productName: unit.product.name });
}
