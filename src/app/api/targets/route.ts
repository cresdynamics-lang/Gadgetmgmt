import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isDateKey, nairobiMidnight } from "@/lib/sales-periods";

const targetSchema = z.object({
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]),
  amount: z.number().int().positive().max(2_000_000_000),
  unitsTarget: z.number().int().positive().max(1_000_000).optional(),
  label: z.string().trim().max(80).optional(),
  from: z.string().refine(isDateKey).optional(),
  to: z.string().refine(isDateKey).optional(),
}).strict().superRefine((data, context) => {
  if (data.period === "CUSTOM" && (!data.from || !data.to || data.from > data.to)) {
    context.addIssue({ code: "custom", path: ["from"], message: "Choose a start and end date for a custom goal." });
  }
});

const periodName = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", CUSTOM: "custom" } as const;

/** Daily, weekly and monthly goals repeat every period. Custom goals cover the dates chosen. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "goals.manage")) return denied(session.user, "goals.manage", "Your permissions cannot set sales goals.");
  const parsed = targetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid goal amount and period." }, { status: 400 });
  const branchId = session.user.branchId;

  const target = await prisma.$transaction(async (transaction) => {
    if (parsed.data.period !== "CUSTOM") {
      await transaction.salesTarget.updateMany({ where: { period: parsed.data.period, branchId, isActive: true }, data: { isActive: false } });
    }
    return transaction.salesTarget.create({
      data: {
        branchId,
        period: parsed.data.period,
        amount: parsed.data.amount,
        unitsTarget: parsed.data.unitsTarget ?? null,
        label: parsed.data.label || null,
        startsAt: parsed.data.period === "CUSTOM" ? nairobiMidnight(parsed.data.from!) : null,
        endsAt: parsed.data.period === "CUSTOM" ? nairobiMidnight(parsed.data.to!) : null,
        createdById: session.user.id,
      },
    });
  });
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "SALES_GOAL_UPDATED",
    summary: `Set a ${periodName[target.period]} sales goal of KES ${target.amount.toLocaleString("en-KE")}${target.label ? ` · ${target.label}` : ""}`,
    entityType: "SalesTarget",
    entityId: target.id,
  });
  return NextResponse.json(target, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "goals.manage")) return denied(session.user, "goals.manage", "Your permissions cannot remove sales goals.");
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const removed = await prisma.salesTarget.updateMany({ where: { id, isActive: true }, data: { isActive: false } });
  if (removed.count !== 1) return NextResponse.json({ error: "That goal was not found." }, { status: 404 });
  await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "SALES_GOAL_UPDATED", summary: "Removed a sales goal", entityType: "SalesTarget", entityId: id });
  return NextResponse.json({ ok: true });
}
