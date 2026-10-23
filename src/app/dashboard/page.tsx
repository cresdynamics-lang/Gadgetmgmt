import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, BellRing, CalendarDays, CirclePlus, CreditCard, PackageCheck, Target } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage, canSeeAllBranches, hasPermission, needsApproval } from "@/lib/access";
import { LockedPanel } from "@/components/locked-panel";
import { AiBriefing } from "@/app/insights/ai-briefing";
import { needsReorder } from "@/lib/stock-levels";

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

  const [sales, inventory, duePlans, overduePlanCount, paymentReviewCount, recentSales] = await Promise.all([
    prisma.sale.findMany({
      where: { ...scope, createdAt: { gte: startPreviousWeek } },
      select: { total: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
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

  const completedSales = sales.filter((sale) => sale.status === "PAID" || sale.status === "PARTIAL");
  const todaySales = completedSales.filter((sale) => sale.createdAt >= startToday);
  const previousWeekSales = completedSales.filter((sale) => sale.createdAt < startWeek);
  const currentWeekSales = completedSales.filter((sale) => sale.createdAt >= startWeek);
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const weekTotal = currentWeekSales.reduce((sum, sale) => sum + sale.total, 0);
  const previousTotal = previousWeekSales.reduce((sum, sale) => sum + sale.total, 0);
  const units = inventory.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStock = inventory.filter((item) => needsReorder(item.stockOnHand - item.reservedStock, item.reorderLevel, item.product.reorderLevel));
  const monitoredStockCount = inventory.filter((item) => Math.max(item.reorderLevel, item.product.reorderLevel) > 0).length;
  const dailyTotals = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(startWeek);
    day.setDate(day.getDate() + offset);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return {
      label: day.toLocaleDateString("en-KE", { weekday: "short", timeZone: "Africa/Nairobi" }),
      isToday: dateKey(day) === dateKey(now),
      total: currentWeekSales.filter((sale) => sale.createdAt >= day && sale.createdAt < nextDay).reduce((sum, sale) => sum + sale.total, 0),
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((day) => day.total));
  const weekChange = previousTotal ? `${Math.round(((weekTotal - previousTotal) / previousTotal) * 100)}% vs prior week` : "No prior-week baseline";
  const formattedDate = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="dashboard-hero flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[#111111] px-5 py-4 text-white shadow-[0_12px_30px_rgba(0,0,0,.15)] sm:px-6">
          <div className="min-w-0"><h2 className="text-lg font-semibold tracking-[-.03em] sm:text-xl">Good to see you, {(session?.user.name ?? "there").split(/\s+/)[0]}</h2><p className="mt-0.5 text-xs text-white/60">{session?.user.branchName ?? "Norwich Union Hse"}<span className="mx-1.5 text-white/30">·</span><time dateTime={now.toISOString()}>{formattedDate}</time></p></div>
          {canAccessPage(user, "/sales") ? <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-[#e5e5e5] px-3.5 py-2 text-xs font-semibold text-[#111111] transition hover:bg-white"><CirclePlus className="h-4 w-4"/>New sale<ArrowUpRight className="h-3.5 w-3.5"/></Link> : null}
        </section>

        <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/sales", icon: CirclePlus, title: "New sale", detail: "Start a checkout" },
            { href: "/inventory", icon: PackageCheck, title: "Receive stock", detail: "Add goods to a branch" },
            { href: "/customers", icon: CreditCard, title: "Customer accounts", detail: "Find a customer or Lipa plan" },
            { href: "/credit", icon: CalendarDays, title: "Collect a payment", detail: "Open the Lipa collection board" },
            { href: "/activity", icon: Activity, title: "Activity", detail: "See who signed in and what they did" },
            { href: "/reports", icon: Target, title: "Sales reports", detail: "Day, week, month and goals" },
          ].filter(({ href }) => canAccessPage(user, href)).map(({ href, icon: Icon, title, detail }) => <Link key={href} href={href} className="dashboard-shortcut group flex min-h-24 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition group-hover:scale-105"><Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#20242b]">{title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{detail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#a3a9b1] transition group-hover:translate-x-1 group-hover:text-[var(--accent)]"/></Link>)}
        </section>

        {canSeeSales || canSeeStock ? <div className="dashboard-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {canSeeSales ? <>
            <MetricCard label="Sales today" value={money(todayTotal)} delta={`${todaySales.length} transactions`} tone="green" />
            <MetricCard label="Sales · 7 days" value={money(weekTotal)} delta={weekChange} tone={weekTotal >= previousTotal ? "green" : "amber"} />
          </> : null}
          {canSeeStock ? <>
            <MetricCard label="Units on hand" value={units.toLocaleString("en-KE")} delta={`${inventory.length} stocked products`} tone="neutral" />
            <MetricCard label="Reorder attention" value={String(lowStock.length)} delta={`${monitoredStockCount} products have a reorder point`} tone={lowStock.length ? "amber" : "green"} />
          </> : null}
        </div> : null}
        {needsApproval(user, "reports.view") ? <LockedPanel permission="reports.view" title="Sales figures"/> : null}
        {needsApproval(user, "inventory.view") ? <LockedPanel permission="inventory.view" title="Stock levels"/> : null}

        <section aria-labelledby="action-desk-heading" className="dashboard-action-desk overflow-hidden rounded-[18px] border border-[#e5e5e5] bg-white shadow-[0_3px_14px_rgba(0,0,0,.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#839084]">A clear next step</p><h3 id="action-desk-heading" className="mt-1 text-sm font-semibold text-[#1a1a1a]">Today’s action desk</h3></div><span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[9px] font-medium text-[#7b877d]">Live from this branch</span></div>
          <div className="grid divide-y divide-[#e5e5e5] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
            {canSeeStock ? <Link href="/inventory" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${lowStock.length ? "bg-[#fff2e8] text-[#a15d3d]" : "bg-[#e5e5e5] text-[#2d2d2d]"}`}>{lowStock.length ? <AlertTriangle className="h-4 w-4"/> : <PackageCheck className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-semibold text-[#1a1a1a]">{lowStock.length ? `${lowStock.length} stock items need attention` : "No configured reorder alerts"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{lowStock.length ? "Review quantities and reorder points" : `${monitoredStockCount} products monitored · set a reorder point in inventory`}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
            {canSeeCredit ? <Link href="/credit" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${overduePlanCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#f3f3eb] text-[#81764f]"}`}><CreditCard className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1a1a1a]">{overduePlanCount ? `${overduePlanCount} overdue Lipa plans` : "Collections are on track"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{overduePlanCount ? "Review balances and follow-up status" : "Open Lipa Mdogo Mdogo"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
            {canAccessPage(user, "/notifications") ? <Link href="/notifications" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#f5f5f5] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${paymentReviewCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#f5f5f5] text-[#4a4a4a]"}`}><BellRing className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#1a1a1a]">{paymentReviewCount ? `${paymentReviewCount} payment checks need review` : "Payment messages are clear"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{paymentReviewCount ? "Resolve unmatched M-Pesa confirmations" : "Open messages and delivery activity"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#2d2d2d]"/></Link> : null}
          </div>
        </section>

        {hasPermission(user, "insights.view") ? <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} /> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          {canSeeSales ? <section className="dashboard-panel dashboard-chart">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><div><h3 className="text-sm font-semibold">Sales activity</h3><p className="mt-1 text-xs text-[#69746c]">Daily revenue · last 7 days</p></div><span className="text-sm font-semibold">{money(weekTotal)}</span></div>
            <div className="grid h-52 grid-cols-7 gap-3 px-5 pb-4 pt-5 sm:gap-5">
              {dailyTotals.map((day) => <div key={day.label} className="group flex min-w-0 flex-col items-center justify-end gap-2"><span className={`truncate text-[10px] tabular-nums ${day.isToday ? "font-bold text-[#2d2d2d]" : "text-[#9aa59d]"}`}>{day.total ? money(day.total).replace("KES ", "") : "—"}</span><div className="flex h-32 w-full items-end overflow-hidden rounded-t-md bg-[#f5f5f5]"><div title={money(day.total)} className={`w-full rounded-t-md transition-all duration-500 group-hover:brightness-110 ${day.isToday ? "bg-gradient-to-t from-[#2d2d2d] to-[#6b6b6b]" : "bg-gradient-to-t from-[#c4c4c4] to-[#e5e5e5]"}`} style={{ height: `${Math.max(4, (day.total / maxDaily) * 100)}%` }} /></div><span className={`grid h-6 min-w-8 place-items-center rounded-full px-2 text-[10px] font-semibold ${day.isToday ? "bg-[#e5e5e5] text-[#2d2d2d]" : "text-[#87948c]"}`}>{day.label}</span></div>)}
            </div>
          </section> : null}

          {canSeeStock ? <section className="dashboard-panel dashboard-stock">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Reorder attention</h3><span className="text-xs text-[#69746c]">{lowStock.length} items</span></div>
            <div className="divide-y divide-[#e5e5e5]">
              {lowStock.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-1 text-xs text-[#69746c]">{item.product.sku} · {item.branch.name}</p></div><span className="shrink-0 text-sm font-semibold text-[#995338]">{item.stockOnHand - item.reservedStock} left</span></div>)}
              {!lowStock.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No stock is at or below its reorder level.</p> : null}
            </div>
          </section> : null}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          {canSeeSales ? <section className="dashboard-panel dashboard-sales">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[#69746c]">Latest 8</span></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 font-medium">Cashier</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#e5e5e5]">
              {recentSales.map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#2d2d2d]">{sale.invoiceNumber}</td><td className="px-4 py-3 text-[#69746c]">{sale.createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</td><td className="px-4 py-3">{sale.branch.name}</td><td className="px-4 py-3">{sale.cashier.name}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-[#111111]">{money(sale.total)}</td><td className="px-4 py-3 text-xs"><span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold text-[#2d2d2d]">{sale.status}</span></td></tr>)}
              {!recentSales.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No completed sales have been recorded in this period.</td></tr> : null}
            </tbody></table></div>
          </section> : null}

          {canSeeCredit ? <section className="dashboard-panel dashboard-credit">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit plans due</h3><span className="text-xs text-[#69746c]">Next 7 days</span></div>
            <div className="divide-y divide-[#e5e5e5]">
              {duePlans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[#69746c]">{plan.branch.name} · Due {plan.nextDueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(plan.balance)}</span></div>)}
              {!duePlans.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No active credit installments due this week.</p> : null}
            </div>
          </section> : null}
        </div>
      </div>
    </AppShell>
  );
}
