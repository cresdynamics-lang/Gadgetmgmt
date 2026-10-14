import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, BellRing, CalendarDays, CirclePlus, CreditCard, PackageCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPage } from "@/lib/access";
import { AiBriefing } from "@/app/insights/ai-briefing";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function DashboardPage() {
  const session = await auth();
  const branchId = session?.user.branchId;
  const scope = session?.user.role === "OWNER" ? {} : { branchId: branchId ?? "" };
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 6);
  const startPreviousWeek = new Date(startWeek);
  startPreviousWeek.setDate(startPreviousWeek.getDate() - 7);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  const [sales, inventory, duePlans, overduePlanCount, paymentReviewCount] = await Promise.all([
    prisma.sale.findMany({
      where: { ...scope, createdAt: { gte: startPreviousWeek } },
      include: {
        branch: { select: { name: true } },
        cashier: { select: { name: true } },
        customer: { select: { name: true } },
        saleItems: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
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
      where: { ...scope, status: { in: ["ACTIVE", "DUE_SOON", "OVERDUE"] }, nextDueDate: { lte: endWeek } },
      include: { customer: { select: { name: true, phone: true } }, branch: { select: { name: true } } },
      orderBy: { nextDueDate: "asc" },
      take: 6,
    }),
    prisma.creditPlan.count({ where: { ...scope, status: "OVERDUE" } }),
    prisma.paymentRequest.count({
      where: {
        status: "REVIEW",
        ...(session?.user.role === "OWNER" ? {} : {
          OR: [
            { sale: { is: { branchId: branchId ?? "" } } },
            { creditPlan: { is: { branchId: branchId ?? "" } } },
          ],
        }),
      },
    }),
  ]);

  const completedSales = sales.filter((sale) => sale.status === "PAID" || sale.status === "PARTIAL");
  const todaySales = completedSales.filter((sale) => sale.createdAt >= startToday);
  const previousWeekSales = completedSales.filter((sale) => sale.createdAt < startWeek);
  const currentWeekSales = completedSales.filter((sale) => sale.createdAt >= startWeek);
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const weekTotal = currentWeekSales.reduce((sum, sale) => sum + sale.total, 0);
  const previousTotal = previousWeekSales.reduce((sum, sale) => sum + sale.total, 0);
  const units = inventory.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStock = inventory.filter((item) => item.stockOnHand - item.reservedStock <= Math.max(item.reorderLevel, item.product.reorderLevel));
  const dailyTotals = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(startWeek);
    day.setDate(day.getDate() + offset);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    return {
      label: day.toLocaleDateString("en-KE", { weekday: "short" }),
      isToday: day.toDateString() === startToday.toDateString(),
      total: currentWeekSales.filter((sale) => sale.createdAt >= day && sale.createdAt < nextDay).reduce((sum, sale) => sum + sale.total, 0),
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((day) => day.total));
  const weekChange = previousTotal ? `${Math.round(((weekTotal - previousTotal) / previousTotal) * 100)}% vs prior week` : "No prior-week baseline";
  const formattedDate = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="dashboard-welcome relative overflow-hidden rounded-[24px] bg-[#12372d] px-6 py-7 text-white shadow-[0_18px_42px_rgba(18,55,45,.17)] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-14 -top-36 h-[390px] w-[390px] rounded-full border border-[#d4c29d]/[.12]"/><div className="pointer-events-none absolute -right-2 -top-24 h-[300px] w-[300px] rounded-full border border-white/[.08]"/>
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl"><h2 className="mt-4 text-[28px] font-semibold leading-tight tracking-[-.045em] sm:text-[34px]">A good day to make<br className="hidden sm:block"/> good things happen.</h2><p className="mt-2 text-sm text-white/60">{session?.user.branchName ?? (session?.user.role === "OWNER" ? "All branches" : "Branch not assigned")} <span className="mx-1.5 text-white/30">·</span> {todaySales.length} sales captured today</p></div>
            <div className="flex flex-wrap items-center gap-3"><time dateTime={now.toISOString()} className="inline-flex items-center gap-2 rounded-xl border border-white/[.12] bg-white/[.06] px-3.5 py-2.5 text-xs font-medium text-white/75"><CalendarDays className="h-4 w-4 text-[#9bd5b2]"/>{formattedDate}</time><Link href="/sales" className="inline-flex items-center gap-2 rounded-xl bg-[#c8f0d8] px-4 py-2.5 text-xs font-semibold text-[#163a2c] shadow-sm transition hover:bg-white"><CirclePlus className="h-4 w-4"/>Open point of sale<ArrowUpRight className="h-3.5 w-3.5"/></Link></div>
          </div>
        </section>

        <div className="dashboard-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Sales today" value={money(todayTotal)} delta={`${todaySales.length} transactions`} tone="green" />
          <MetricCard label="Sales · 7 days" value={money(weekTotal)} delta={weekChange} tone={weekTotal >= previousTotal ? "green" : "amber"} />
          <MetricCard label="Units on hand" value={units.toLocaleString("en-KE")} delta={`${inventory.length} stocked products`} tone="neutral" />
          <MetricCard label="Reorder attention" value={String(lowStock.length)} delta="at or below minimum" tone={lowStock.length ? "amber" : "green"} />
        </div>

        <section aria-labelledby="action-desk-heading" className="dashboard-action-desk overflow-hidden rounded-[18px] border border-[#e6e8df] bg-white shadow-[0_3px_14px_rgba(42,46,34,.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0e9] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.17em] text-[#839084]">A clear next step</p><h3 id="action-desk-heading" className="mt-1 text-sm font-semibold text-[#2e4034]">Today’s action desk</h3></div><span className="rounded-full bg-[#f5f7f2] px-2.5 py-1 text-[9px] font-medium text-[#7b877d]">Live from this branch</span></div>
          <div className="grid divide-y divide-[#edf0e9] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
            <Link href="/inventory" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#fafbf8] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${lowStock.length ? "bg-[#fff2e8] text-[#a15d3d]" : "bg-[#eaf4eb] text-[#477452]"}`}>{lowStock.length ? <AlertTriangle className="h-4 w-4"/> : <PackageCheck className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-semibold text-[#344638]">{lowStock.length ? `${lowStock.length} stock items need attention` : "Stock levels look healthy"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{lowStock.length ? "Review quantities and reorder points" : "Open inventory to check availability"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#39724f]"/></Link>
            <Link href="/credit" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#fafbf8] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${overduePlanCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#f3f3eb] text-[#81764f]"}`}><CreditCard className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#344638]">{overduePlanCount ? `${overduePlanCount} overdue Lipa plans` : "Collections are on track"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{overduePlanCount ? "Review balances and follow-up status" : "Open Lipa Mdogo Mdogo"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#39724f]"/></Link>
            {canAccessPage(session?.user.role ?? "", "/notifications") ? <Link href="/notifications" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[#fafbf8] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${paymentReviewCount ? "bg-[#fff0e8] text-[#a15d3d]" : "bg-[#edf3f1] text-[#55746a]"}`}><BellRing className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[#344638]">{paymentReviewCount ? `${paymentReviewCount} payment checks need review` : "Payment messages are clear"}</span><span className="mt-1 block text-[10px] text-[#828b81]">{paymentReviewCount ? "Resolve unmatched M-Pesa confirmations" : "Open messages and delivery activity"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#9aa69d] transition group-hover:translate-x-0.5 group-hover:text-[#39724f]"/></Link> : null}
          </div>
        </section>

        <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="dashboard-panel dashboard-chart">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><div><h3 className="text-sm font-semibold">Sales activity</h3><p className="mt-1 text-xs text-[#69746c]">Daily revenue · last 7 days</p></div><span className="text-sm font-semibold">{money(weekTotal)}</span></div>
            <div className="grid h-52 grid-cols-7 gap-3 px-5 pb-4 pt-5 sm:gap-5">
              {dailyTotals.map((day) => <div key={day.label} className="group flex min-w-0 flex-col items-center justify-end gap-2"><span className={`truncate text-[10px] tabular-nums ${day.isToday ? "font-bold text-[#347c52]" : "text-[#9aa59d]"}`}>{day.total ? money(day.total).replace("KES ", "") : "—"}</span><div className="flex h-32 w-full items-end overflow-hidden rounded-t-md bg-[#f4f7f4]"><div title={money(day.total)} className={`w-full rounded-t-md transition-all duration-500 group-hover:brightness-110 ${day.isToday ? "bg-gradient-to-t from-[#347c52] to-[#78bf8c]" : "bg-gradient-to-t from-[#b7d5bf] to-[#d6e9d9]"}`} style={{ height: `${Math.max(4, (day.total / maxDaily) * 100)}%` }} /></div><span className={`grid h-6 min-w-8 place-items-center rounded-full px-2 text-[10px] font-semibold ${day.isToday ? "bg-[#e8f5eb] text-[#347c52]" : "text-[#87948c]"}`}>{day.label}</span></div>)}
            </div>
          </section>

          <section className="dashboard-panel dashboard-stock">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Reorder attention</h3><span className="text-xs text-[#69746c]">{lowStock.length} items</span></div>
            <div className="divide-y divide-[#edf0ed]">
              {lowStock.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-1 text-xs text-[#69746c]">{item.product.sku} · {item.branch.name}</p></div><span className="shrink-0 text-sm font-semibold text-[#995338]">{item.stockOnHand - item.reservedStock} left</span></div>)}
              {!lowStock.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No stock is at or below its reorder level.</p> : null}
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="dashboard-panel dashboard-sales">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[#69746c]">Latest 8</span></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 font-medium">Cashier</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">
              {completedSales.slice(0, 8).map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#435b4b]">{sale.invoiceNumber}</td><td className="px-4 py-3 text-[#69746c]">{sale.createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3">{sale.branch.name}</td><td className="px-4 py-3">{sale.cashier.name}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-[#263b2e]">{money(sale.total)}</td><td className="px-4 py-3 text-xs"><span className="rounded-full bg-[#eaf6ed] px-2.5 py-1 text-[10px] font-semibold text-[#367d50]">{sale.status}</span></td></tr>)}
              {!completedSales.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No completed sales have been recorded in this period.</td></tr> : null}
            </tbody></table></div>
          </section>

          <section className="dashboard-panel dashboard-credit">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit plans due</h3><span className="text-xs text-[#69746c]">Next 7 days</span></div>
            <div className="divide-y divide-[#edf0ed]">
              {duePlans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[#69746c]">{plan.branch.name} · Due {plan.nextDueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(plan.balance)}</span></div>)}
              {!duePlans.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No active credit installments due this week.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
