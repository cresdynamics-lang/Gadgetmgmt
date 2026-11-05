import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { addDays, startOfNairobiDay, startOfNairobiMonth, startOfNairobiWeek, startOfNextNairobiMonth } from "@/lib/sales-periods";
import { saleLineValue, saleValue } from "@/lib/sale-value";

const completed = { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] };

function windowFor(range: string, now: Date) {
  if (range === "week") return { from: startOfNairobiWeek(now), to: addDays(startOfNairobiWeek(now), 7), label: "This week" };
  if (range === "month") return { from: startOfNairobiMonth(now), to: startOfNextNairobiMonth(now), label: "This month" };
  return { from: startOfNairobiDay(now), to: addDays(startOfNairobiDay(now), 1), label: "Today" };
}

function goalWindow(period: string, startsAt: Date | null, endsAt: Date | null, now: Date) {
  if (period === "WEEKLY") return { from: startOfNairobiWeek(now), to: addDays(startOfNairobiWeek(now), 7) };
  if (period === "MONTHLY") return { from: startOfNairobiMonth(now), to: startOfNextNairobiMonth(now) };
  if (period === "CUSTOM") return { from: startsAt ?? now, to: endsAt ? addDays(startOfNairobiDay(endsAt), 1) : addDays(now, 1) };
  return { from: startOfNairobiDay(now), to: addDays(startOfNairobiDay(now), 1) };
}

/** Sales, profit and stock work for one team member, for today, this week or this month. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "staff.view")) return denied(session.user, "staff.view", "Your permissions cannot view staff performance.");
  const { id } = await context.params;
  const member = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, status: true, branchId: true, branch: { select: { name: true } } } });
  if (!member) return NextResponse.json({ error: "That team member was not found." }, { status: 404 });
  if (!canSeeAllBranches(session.user) && member.branchId !== session.user.branchId) {
    return NextResponse.json({ error: "That team member is at another branch." }, { status: 403 });
  }

  const range = new URL(request.url).searchParams.get("range") || "day";
  const now = new Date();
  const period = windowFor(range, now);
  const showProfit = hasPermission(session.user, "finance.view");
  const where = { cashierId: id, status: completed, createdAt: { gte: period.from, lt: period.to } };
  const [sales, receipts] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: { total: true, tradeInValue: true, saleItems: { select: { quantity: true, unitPrice: true, discountAmount: true, taxAmount: true, unitCost: true } } },
    }),
    prisma.inventoryMovement.count({ where: { userId: id, type: "RECEIPT", createdAt: { gte: period.from, lt: period.to } } }),
  ]);

  const units = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
  const revenue = sales.reduce((sum, sale) => sum + saleValue(sale), 0);
  const cost = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + line.unitCost * line.quantity, 0), 0);
  const profit = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + (saleLineValue(line) - line.unitCost * line.quantity), 0), 0);

  const goals = await prisma.salesTarget.findMany({
    where: { assigneeId: id, isActive: true },
    select: { id: true, period: true, label: true, amount: true, unitsTarget: true, startsAt: true, endsAt: true },
  });
  const goalProgress = await Promise.all(goals.map(async (goal) => {
    const span = goalWindow(goal.period, goal.startsAt, goal.endsAt, now);
    const totals = await prisma.sale.aggregate({ where: { cashierId: id, status: completed, createdAt: { gte: span.from, lt: span.to } }, _sum: { total: true, tradeInValue: true }, _count: true });
    const achieved = (totals._sum.total ?? 0) + (totals._sum.tradeInValue ?? 0);
    return { id: goal.id, period: goal.period, label: goal.label, amount: goal.amount, unitsTarget: goal.unitsTarget, achieved, percent: goal.amount ? Math.min(999, Math.round((achieved / goal.amount) * 100)) : 0 };
  }));

  return NextResponse.json({
    member,
    range: period.label,
    sales: sales.length,
    units,
    revenue,
    receipts,
    profit: showProfit ? profit : null,
    cost: showProfit ? cost : null,
    goals: goalProgress,
  }, { headers: { "Cache-Control": "no-store" } });
}
