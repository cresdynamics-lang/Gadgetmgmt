import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { allocateUnitCode } from "@/lib/unit-code";

/** A unique barcode for the phone just scanned, shown before it is saved. */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "inventory.receive") && !hasPermission(session.user, "sales.create")) {
    return denied(session.user, "inventory.receive", "Your permissions cannot assign a device barcode.");
  }
  const unitCode = await allocateUnitCode(prisma);
  return NextResponse.json({ unitCode }, { headers: { "Cache-Control": "no-store" } });
}
