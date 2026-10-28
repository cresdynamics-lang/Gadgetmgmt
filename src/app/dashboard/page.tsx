import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, BellRing, CirclePlus, CreditCard, PackageCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage, canSeeAllBranches, hasPermission, needsApproval } from "@/lib/access";
import { LockedPanel } from "@/components/locked-panel";
import { needsReorder } from "@/lib/stock-levels";
import { BarList, ChartPanel, DailySalesChart, GoalBars, SalesPeriodCard, ShareBar, StatusBreakdown } from "@/components/dashboard-charts";
import { daysUntilDue, flaggedCreditStatuses } from "@/lib/credit-lifecycle";
import { addDays, nairobiDateKey, startOfNairobiDay, startOfNairobiMonth, startOfNairobiWeek, startOfNextNairobiMonth } from "@/lib/sales-periods";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function DashboardPage() {
  const session = await auth();
  const branchId = session?.user.branchId;
  const user = session?.user;
  const scope = canSeeAllBranches(user) ? {} : { branchId: branchId ?? "" };
  const canSeeSales = hasPermission(user, "reports.view");
  const canSeeStock = hasPermission(user, "inventory.view");
  const canSeeCredit = hasPermission(user, "credit.view");
  const now = new Date();
  const dateKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const startToday = new Date(`${dateKey(now)}T00:00:00+03:00`);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 6);
  const startPreviousWeek = new Date(startWeek);
  startPreviousWeek.setDate(startPreviousWeek.getDate() - 7);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  const [inventory, duePlans, overduePlanCount, paymentReviewCount, recentSales] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: scope,
      include: {
        branch: { select: { name: true } },
        product: { select: { name: true, sku: true, reorderLevel: true } },
      },
      orderBy: { stockOnHand: "asc" },
    }),
    prisma.creditPlan.findMany({
      where: { ...scope, balance: { gt: 0 }, status: { not: "PAID_OFF" }, nextDueDate: { lte: endWeek } },
      include: { customer: { select: { name: true, phone: true } }, branch: { select: { name: true } } },
      orderBy: { nextDueDate: "asc" },
      take: 6,
    }),
    prisma.creditPlan.count({ where: { ...scope, balance: { gt: 0 }, nextDueDate: { lt: startToday }, status: { not: "PAID_OFF" } } }),
    prisma.paymentRequest.count({
      where: {
        status: "REVIEW",
        ...(canSeeAllBranches(user) ? {} : {
          OR: [
            { sale: { is: { branchId: branchId ?? "" } } },
            { creditPlan: { is: { branchId: branchId ?? "" } } },
          ],
        }),
      },
    }),
    prisma.sale.findMany({ where: { ...scope, createdAt: { gte: startPreviousWeek }, status: { in: ["PAID", "PARTIAL"] } }, include: { branch: { select: { name: true } }, cashier: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  // The morning report (no longer emailed), for people who can see sales.
  const dailyReports = canSeeSales
    ? await prisma.customerNotification.findMany({
        where: { ...scope, kind: "OWNER_DAILY_DIGEST" },
        orderBy: { createdAt: "desc" },
        take: canSeeAllBranches(user) ? 3 : 1,
        select: { id: true, subject: true, body: true, createdAt: true },
      })
    : [];

  // Figures for the charts, each loaded only for sections this person can see.
  const canSeeFinance = hasPermission(user, "finance.view");
  const canSeeCustomers = hasPermission(user, "customers.view");
  const today = startOfNairobiDay(now);
  const monthStart = startOfNairobiMonth(now);
  const weekStart = startOfNairobiWeek(now);
  const chartStart = addDays(today, -29);
  const lastMonthStart = startOfNairobiMonth(addDays(monthStart, -1));
  // Six extra days feed the first points of the 7-day average; last month feeds the period comparison.
  const windowStart = new Date(Math.min(addDays(chartStart, -6).getTime(), lastMonthStart.getTime()));
  const completed = { in: ["PAID", "PARTIAL"] as ("PAID" | "PARTIAL")[] };
  const [chartSales, paymentsByMethod, lipaCollected, openPlans, stockItems, goals, customerCount, newCustomers] = await Promise.all([
    canSeeSales ? prisma.sale.findMany({ where: { ...scope, status: completed, createdAt: { gte: windowStart } }, select: { total: true, tradeInValue: true, createdAt: true, saleItems: { select: { quantity: true, total: true, product: { select: { category: true } } } } } }) : [],
    canSeeFinance ? prisma.salePayment.groupBy({ by: ["method"], where: { createdAt: { gte: monthStart }, sale: scope }, _sum: { amount: true } }) : [],
    canSeeFinance ? prisma.payment.aggregate({ where: { createdAt: { gte: monthStart }, creditPlan: scope }, _sum: { amount: true } }) : null,
    canSeeCredit ? prisma.creditPlan.findMany({ where: { ...scope, balance: { gt: 0 }, status: { not: "PAID_OFF" } }, select: { balance: true, nextDueDate: true, status: true } }) : [],
    canSeeStock ? prisma.inventoryItem.findMany({ where: scope, select: { stockOnHand: true, reservedStock: true, product: { select: { category: true, costPrice: true } } } }) : [],
    canSeeSales ? prisma.salesTarget.findMany({ where: { isActive: true }, select: { period: true, label: true, amount: true, startsAt: true, endsAt: true } }) : [],
    canSeeCustomers ? prisma.customer.count({ where: scope }) : 0,
    canSeeCustomers ? prisma.customer.count({ where: { ...scope, createdAt: { gte: monthStart } } }) : 0,
  ]);
  const sumSales = (from: Date, to = addDays(today, 1)) => chartSales.filter((sale) => sale.createdAt >= from && sale.createdAt < to);
  const monthSales = sumSales(monthStart, startOfNextNairobiMonth(now));
  const total = (rows: { total: number }[]) => rows.reduce((sum, row) => sum + row.total, 0);
  const dayValue = (from: Date) => total(sumSales(from, addDays(from, 1)));
  const dailySeries = Array.from({ length: 30 }, (_, index) => {
    const from = addDays(chartStart, index);
    const rows = sumSales(from, addDays(from, 1));
    const average = Math.round(Array.from({ length: 7 }, (_, back) => dayValue(addDays(from, -back))).reduce((sum, value) => sum + value, 0) / 7);
    return { date: nairobiDateKey(from), label: from.toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }), value: total(rows), count: rows.length, average };
  });
  const periodFigures = (key: string, label: string, from: Date, to: Date, previousLabel: string, previousFrom: Date, previousTo: Date) => {
    const rows = sumSales(from, to);
    return { key, label, value: total(rows), count: rows.length, units: rows.reduce((sum, sale) => sum + sale.saleItems.reduce((lineSum, line) => lineSum + line.quantity, 0), 0), tradeIns: rows.filter((sale) => sale.tradeInValue > 0).length, previousLabel, previousValue: total(sumSales(previousFrom, previousTo)) };
  };
  const salesPeriods = [
    periodFigures("today", "Today", today, addDays(today, 1), "Yesterday", addDays(today, -1), today),
    periodFigures("week", "This week", weekStart, addDays(weekStart, 7), "Last week", addDays(weekStart, -7), weekStart),
    periodFigures("month", "This month", monthStart, startOfNextNairobiMonth(now), "Last month", lastMonthStart, monthStart),
    periodFigures("30days", "30 days", chartStart, addDays(today, 1), "30 days before", addDays(chartStart, -30), chartStart),
  ];
  const byType = new Map<string, { value: number; units: number }>();
  for (const sale of monthSales) for (const line of sale.saleItems) {
    const row = byType.get(line.product.category) ?? { value: 0, units: 0 };
    row.value += line.total; row.units += line.quantity; byType.set(line.product.category, row);
  }
  const methodTotal = (method: string) => paymentsByMethod.find((row) => row.method === method)?._sum.amount ?? 0;
  const receivedThisMonth = ["MPESA", "CASH", "CARD"].reduce((sum, method) => sum + methodTotal(method), 0) + (lipaCollected?._sum.amount ?? 0);
  const lipaBuckets = (["good", "warning", "serious", "critical"] as const).map((key) => ({ key, label: { good: "Up to date", warning: "Due within 3 days", serious: "Overdue", critical: "Flagged (3+ days late)" }[key], count: 0, amount: 0 }));
  for (const plan of openPlans) {
    const days = daysUntilDue(plan.nextDueDate, now);
    const bucket = flaggedCreditStatuses.includes(plan.status as (typeof flaggedCreditStatuses)[number]) ? 3 : days < 0 ? 2 : days <= 3 ? 1 : 0;
    lipaBuckets[bucket].count += 1; lipaBuckets[bucket].amount += plan.balance;
  }
  const lipaOwed = openPlans.reduce((sum, plan) => sum + plan.balance, 0);
  const stockByType = new Map<string, number>();
  for (const item of stockItems) stockByType.set(item.product.category, (stockByType.get(item.product.category) ?? 0) + item.stockOnHand);
  const outOfStock = stockItems.filter((item) => item.stockOnHand - item.reservedStock <= 0).length;
  const stockValue = stockItems.reduce((sum, item) => sum + item.stockOnHand * item.product.costPrice, 0);
  const goalRows = goals.map((goal) => {
    const [from, to] = goal.period === "DAILY" ? [today, addDays(today, 1)] : goal.period === "WEEKLY" ? [weekStart, addDays(weekStart, 7)] : goal.period === "MONTHLY" ? [monthStart, startOfNextNairobiMonth(now)] : [goal.startsAt ?? today, goal.endsAt ? addDays(goal.endsAt, 1) : addDays(today, 1)];
    const label = goal.label ?? ({ DAILY: "Today's goal", WEEKLY: "This week's goal", MONTHLY: "This month's goal", CUSTOM: "Custom goal" } as const)[goal.period];
    return { label, goal: goal.amount, achieved: total(sumSales(from, to)) };
  });

  const units = inventory.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStock = inventory.filter((item) => needsReorder(item.stockOnHand - item.reservedStock, item.reorderLevel, item.product.reorderLevel));
  const monitoredStockCount = inventory.filter((item) => Math.max(item.reorderLevel, item.product.reorderLevel) > 0).length;
  const formattedDate = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });

  const panel = "dashboard-panel overflow-hidden rounded-[18px] border border-[#e5e5e5] bg-white";
  return (
    <AppShell>
      <div className="space-y-6">
        <section className="dashboard-hero flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[#111111] px-5 py-4 text-white shadow-[0_12px_30px_rgba(0,0,0,.15)] sm:px-6">
          <div className="min-w-0"><h2 className="text-lg font-semibold tracking-[-.03em] sm:text-xl">Good to see you, {(session?.user.name ?? "there").split(/\s+/)[0]}</h2><p className="mt-0.5 text-xs text-white/60">{session?.user.branchName ?? "Norwich Union Hse"}<span className="mx-1.5 text-white/30">·</span><time dateTime={now.toISOString()}>{formattedDate}</time></p></div>
          {canAccessPage(user, "/sales") ? <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-[#e5e5e5] px-3.5 py-2 text-xs font-semibold text-[#111111] transition hover:bg-white"><CirclePlus className="h-4 w-4"/>New sale<ArrowUpRight className="h-3.5 w-3.5"/></Link> : null}
        </section>

        {canSeeStock || canSeeCredit || canAccessPage(user, "/notifications") ? <section aria-labelledby="action-desk-heading" className="dashboard-action-desk overflow-hidden rounded-[18px] border border-[#e5e5e5] bg-white shadow-[0_3px_14px_rgba(0,0,0,.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#839084]">A clear next step</p><h3 id="action-desk-heading" className="mt-1 text-sm font-semibold text-[#1a1a1a]">Today’s action desk</h3></div><span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[9px] font-medium text-[#7b877d]">Live from this branch</span></div>
          <div className="grid divide-y divide-[#e5e5e5] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
            {canSeeStock ? <Link href="/inventory" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${lowStock.length ? "bg-[#fff2e8] text-[#a15d3d]" : "bg-[#e5e5e5] text-[#2d2d2d]"}`}>{lowStock.length ? <AlertTriangle className="h-4 w-4"/> : <PackageCheck className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-semibold text-[#1a1a1a]">{lowStock.length ? `${lowStock.length} stock items need attention` : "No configured reorder alerts"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{lowStock.length ? "Review quantities and reorder points" : `${monitoredStockCount} products monitored · set a reorder point in inventory`}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
            {canSeeCredit ? <Link href="/credit" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${overduePlanCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#f3f3eb] text-[#81764f]"}`}><CreditCard className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1a1a1a]">{overduePlanCount ? `${overduePlanCount} overdue Lipa plans` : "Collections are on track"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{overduePlanCount ? "Review balances and follow-up status" : "Open Lipa Mdogo Mdogo"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
            {canAccessPage(user, "/notifications") ? <Link href="/notifications" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${paymentReviewCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#f5f5f5] text-[#4a4a4a]"}`}><BellRing className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1a1a1a]">{paymentReviewCount ? `${paymentReviewCount} payment checks need review` : "Payment messages are clear"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{paymentReviewCount ? "Resolve unmatched M-Pesa confirmations" : "Open messages and delivery activity"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
          </div>
        </section> : null}

        <div className="dashboard-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canSeeSales ? <SalesPeriodCard periods={salesPeriods}/> : null}
          {canSeeFinance ? <MetricCard label="Money received this month" value={money(receivedThisMonth)} delta={`Lipa installments ${money(lipaCollected?._sum.amount ?? 0)}`} tone="neutral" /> : null}
          {canSeeCredit ? <MetricCard label="Owed on Lipa" value={money(lipaOwed)} delta={`${openPlans.length} accounts · ${lipaBuckets[2].count + lipaBuckets[3].count} overdue`} tone={lipaBuckets[2].count + lipaBuckets[3].count ? "amber" : "green"} /> : null}
          {canSeeStock ? <MetricCard label="Units in stock" value={units.toLocaleString("en-KE")} delta={`${outOfStock} products out of stock${canSeeFinance ? ` · worth ${money(stockValue)} at cost` : ""}`} tone={outOfStock ? "amber" : "neutral"} /> : null}
          {canSeeCustomers ? <MetricCard label="Customers" value={customerCount.toLocaleString("en-KE")} delta={`${newCustomers} new this month`} tone="neutral" /> : null}
        </div>
        {needsApproval(user, "reports.view") ? <LockedPanel permission="reports.view" title="Sales figures"/> : null}
        {needsApproval(user, "inventory.view") ? <LockedPanel permission="inventory.view" title="Stock levels"/> : null}

        {canSeeSales ? <ChartPanel title="Sales, last 30 days" subtitle="Daily sales with the 7-day average" figure={money(dailySeries.reduce((sum, day) => sum + day.value, 0))}><DailySalesChart days={dailySeries}/></ChartPanel> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {canSeeSales ? <ChartPanel title="Sales by product type" subtitle="This month" figure={money(total(monthSales))}><BarList rows={[...byType].map(([label, row]) => ({ label, value: row.value, note: `${row.units} ${row.units === 1 ? "unit" : "units"}` })).sort((a, b) => b.value - a.value)} empty="No sales yet this month."/></ChartPanel> : null}
          {canSeeFinance ? <ChartPanel title="How customers paid" subtitle="Sale payments this month" figure={money(methodTotal("MPESA") + methodTotal("CASH") + methodTotal("CARD"))}><ShareBar segments={[{ label: "M-Pesa", value: methodTotal("MPESA") }, { label: "Cash", value: methodTotal("CASH") }, { label: "Card", value: methodTotal("CARD") }]} empty="No payments received yet this month."/></ChartPanel> : null}
          {canSeeCredit ? <ChartPanel title="Lipa Mdogo Mdogo accounts" subtitle="Money still owed, by payment state" figure={money(lipaOwed)}>{openPlans.length ? <StatusBreakdown buckets={lipaBuckets}/> : <p className="px-4 py-8 text-center text-sm text-[#6b6b6b]">No Lipa accounts with money owed.</p>}</ChartPanel> : null}
          {canSeeSales ? <ChartPanel title="Sales goals" subtitle="Progress over each goal's own period">{goalRows.length ? <GoalBars goals={goalRows}/> : <p className="px-4 py-8 text-center text-sm text-[#6b6b6b]">No goals set. Add one in Sales reports.</p>}</ChartPanel> : null}
        </div>

        {canSeeStock ? <div className="grid gap-5 lg:grid-cols-2">
          <ChartPanel title="Stock by product type" subtitle="Units on hand now" figure={`${units.toLocaleString("en-KE")} units`}><BarList format="units" rows={[...stockByType].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} empty="No stock recorded yet."/></ChartPanel>
          <section className={`${panel} dashboard-stock`}>
            <div className="flex items-center justify-between border-b border-[#efefef] px-4 py-3.5"><h3 className="text-sm font-semibold">Reorder attention</h3><span className="text-xs text-[#69746c]">{lowStock.length} items</span></div>
            <div className="divide-y divide-[#e5e5e5]">
              {lowStock.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-1 truncate text-xs text-[#69746c]">{item.product.sku}</p></div><span className="shrink-0 text-sm font-semibold text-[#995338]">{item.stockOnHand - item.reservedStock} left</span></div>)}
              {!lowStock.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No stock is at or below its reorder level.</p> : null}
            </div>
          </section>
        </div> : null}

        {canSeeSales ? <section className={`${panel} dashboard-sales`}>
          <div className="flex items-center justify-between border-b border-[#efefef] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[#69746c]">Latest 8</span></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 font-medium">Cashier</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#e5e5e5]">
            {recentSales.map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#2d2d2d]">{sale.invoiceNumber}</td><td className="px-4 py-3 text-[#69746c]">{sale.createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</td><td className="px-4 py-3">{sale.branch.name}</td><td className="px-4 py-3">{sale.cashier.name}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111111]">{money(sale.total)}</td><td className="px-4 py-3 text-xs"><span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold text-[#2d2d2d]">{sale.status}</span></td></tr>)}
            {!recentSales.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No completed sales have been recorded in this period.</td></tr> : null}
          </tbody></table></div>
        </section> : null}

        {canSeeCredit ? <section className={`${panel} dashboard-credit`}>
          <div className="flex items-center justify-between border-b border-[#efefef] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit plans due</h3><span className="text-xs text-[#69746c]">Next 7 days</span></div>
          <div className="divide-y divide-[#e5e5e5]">
            {duePlans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[#69746c]">{plan.branch.name} · Due {plan.nextDueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(plan.balance)}</span></div>)}
            {!duePlans.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No active credit installments due this week.</p> : null}
          </div>
        </section> : null}

        {dailyReports.length ? <section aria-labelledby="daily-report-heading" className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#839084]">Prepared every morning</p><h3 id="daily-report-heading" className="mt-1 text-sm font-semibold text-[#1a1a1a]">Daily report</h3></div><span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[9px] font-medium text-[#7b877d]">Shown here, not emailed</span></div>
          <div className="divide-y divide-[#e5e5e5]">
            {dailyReports.map((report) => <div key={report.id} className="px-4 py-4 sm:px-5"><p className="text-xs font-semibold text-[#1a1a1a]">{report.subject}</p><p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#4a4a4a]">{report.body}</p></div>)}
          </div>
        </section> : null}
      </div>
    </AppShell>
  );
}
