import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { MAX_WARRANTY_MONTHS } from "@/lib/warranty";
import { getWarrantyDefaults, setWarrantyDefaults } from "@/lib/warranty-settings";

const months = z.number().int().min(0).max(MAX_WARRANTY_MONTHS);
const updateSchema = z.object({ NEW: months, EX_UK: months, TRADE_IN: months }).strict();

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json(await getWarrantyDefaults());
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can change warranty periods.");
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Enter warranty months from 0 to ${MAX_WARRANTY_MONTHS}.` }, { status: 400 });
  await setWarrantyDefaults(parsed.data);
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "POLICY_UPDATED",
    summary: `Set warranty: New ${parsed.data.NEW}, Ex-UK ${parsed.data.EX_UK}, trade-in resale ${parsed.data.TRADE_IN} months`,
    entityType: "AppSetting",
    entityId: "warranty",
  });
  return NextResponse.json(await getWarrantyDefaults());
}
