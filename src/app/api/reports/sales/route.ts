import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, nairobiDateKey, resolveSalesRange, startOfNairobiDay, startOfNairobiMonth, startOfNairobiWeek, startOfNextNairobiMonth, type SalesRange } from "@/lib/sales-periods";

const ranges: SalesRange[] = ["today", "week", "month", "custom"];
const completed = { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] };

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "reports.view")) return denied(session.user, "reports.view", "Your permissions cannot view sales reports.");

  const params = new URL(request.url).searchParams;
  const requested = params.get("range") as SalesRange | null;
  const range = requested && ranges.includes(requested) ? requested : "today";
  const now = new Date();
  const { start, end } = resolveSalesRange(range, now, params.get("from"), params.get("to"));
  if (daysBetween(start, end) > 366) return NextResponse.json({ error: "Choose a range of one year or less." }, { status: 400 });
  const branchScope = canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" };
  const showFinance = hasPermission(session.user, "finance.view");

  const [sales, targets] = await Promise.all([
    prisma.sale.findMany({
      where: { ...branchScope, status: completed, createdAt: { gte: start, lt: end } },
      select: {
        id: true, invoiceNumber: true, total: true, paymentMethod: true, tradeInValue: true, tradeInModel: true, createdAt: true,
        cashier: { select: { id: true, name: true } },
        customer: { select: { name: true } },
        saleItems: { select: { quantity: true, total: true, unitCost: true, product: { select: { name: true, category: true, condition: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesTarget.findMany({
      where: { isActive: true, ...(canSeeAllBranches(session.user) ? {} : { OR: [{ branchId: session.user.branchId ?? "" }, { branchId: null }] }) },
      orderBy: [{ period: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
  const units = sales.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);

  const byStaff = new Map<string, { id: string; name: string; sales: number; units: number; revenue: number }>();
  const byCategory = new Map<string, { category: string; units: number; revenue: number }>();
  for (const sale of sales) {
    const staff = byStaff.get(sale.cashier.id) ?? { id: sale.cashier.id, name: sale.cashier.name, sales: 0, units: 0, revenue: 0 };
    staff.sales += 1;
    staff.revenue += sale.total;
    for (const line of sale.saleItems) {
      staff.units += line.quantity;
      const category = byCategory.get(line.product.category) ?? { category: line.product.category, units: 0, revenue: 0 };
      category.units += line.quantity;
      category.revenue += line.total;
      byCategory.set(line.product.category, category);
    }
    byStaff.set(sale.cashier.id, staff);
  }

  const dayCount = daysBetween(start, end);
  const daily = dayCount <= 93 ? Array.from({ length: dayCount }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const daySales = sales.filter((sale) => sale.createdAt >= dayStart && sale.createdAt < dayEnd);
    return { date: nairobiDateKey(dayStart), revenue: daySales.reduce((sum, sale) => sum + sale.total, 0), sales: daySales.length };
  }) : [];

  // Goal progress is measured over each goal's own period, whatever range is on screen.
  const goalWindow = (target: (typeof targets)[number]) => {
    if (target.period === "DAILY") return { from: startOfNairobiDay(now), to: addDays(startOfNairobiDay(now), 1) };
    if (target.period === "WEEKLY") return { from: startOfNairobiWeek(now), to: addDays(startOfNairobiWeek(now), 7) };
    if (target.period === "MONTHLY") return { from: startOfNairobiMonth(now), to: startOfNextNairobiMonth(now) };
    return { from: target.startsAt ?? start, to: target.endsAt ? addDays(startOfNairobiDay(target.endsAt), 1) : end };
  };
  const goals = await Promise.all(targets.map(async (target) => {
    const window = goalWindow(target);
    const [totals, lines] = await Promise.all([
      prisma.sale.aggregate({ where: { ...branchScope, status: completed, createdAt: { gte: window.from, lt: window.to } }, _sum: { total: true }, _count: true }),
      prisma.saleItem.aggregate({ where: { sale: { ...branchScope, status: completed, createdAt: { gte: window.from, lt: window.to } } }, _sum: { quantity: true } }),
    ]);
    const achieved = totals._sum.total ?? 0;
    return {
      id: target.id, period: target.period, label: target.label, amount: target.amount, unitsTarget: target.unitsTarget,
      from: window.from, to: window.to, achieved, unitsSold: lines._sum.quantity ?? 0, salesCount: totals._count,
      percent: target.amount ? Math.min(999, Math.round((achieved / target.amount) * 100)) : 0,
    };
  }));

  let finance: null | {
    collectedByMethod: { method: string; amount: number }[];
    lipaCollections: number;
    grossProfit: number;
    tradeInValue: number;
    outstandingLipa: number;
    settlementBank: string;
  } = null;
  if (showFinance) {
    const [salePayments, creditPayments, outstanding] = await Promise.all([
      prisma.salePayment.groupBy({ by: ["method"], where: { createdAt: { gte: start, lt: end }, sale: branchScope }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { createdAt: { gte: start, lt: end }, creditPlan: branchScope }, _sum: { amount: true } }),
      prisma.creditPlan.aggregate({ where: { ...branchScope, balance: { gt: 0 } }, _sum: { balance: true } }),
    ]);
    finance = {
      collectedByMethod: salePayments.map((row) => ({ method: row.method, amount: row._sum.amount ?? 0 })),
      lipaCollections: creditPayments._sum.amount ?? 0,
      grossProfit: sales.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + line.total - line.unitCost * line.quantity, 0), 0),
      tradeInValue: sales.reduce((sum, sale) => sum + sale.tradeInValue, 0),
      outstandingLipa: outstanding._sum.balance ?? 0,
      settlementBank: process.env.MPESA_SETTLEMENT_BANK || "Stanbic Bank",
    };
  }

  return NextResponse.json({
    range, from: start, to: end,
    summary: { revenue, salesCount: sales.length, units, averageSale: sales.length ? Math.round(revenue / sales.length) : 0, tradeIns: sales.filter((sale) => sale.tradeInValue > 0).length },
    byStaff: [...byStaff.values()].sort((left, right) => right.revenue - left.revenue),
    byCategory: [...byCategory.values()].sort((left, right) => right.revenue - left.revenue),
    daily,
    lines: sales.slice(0, 60).flatMap((sale) => sale.saleItems.map((line) => ({
      saleId: sale.id, invoiceNumber: sale.invoiceNumber, createdAt: sale.createdAt, product: line.product.name, condition: line.product.condition,
      quantity: line.quantity, total: line.total, paymentMethod: sale.paymentMethod, cashier: sale.cashier.name, customer: sale.customer?.name ?? null,
    }))),
    goals,
    finance,
    canManageGoals: hasPermission(session.user, "goals.manage"),
  }, { headers: { "Cache-Control": "no-store" } });
}
