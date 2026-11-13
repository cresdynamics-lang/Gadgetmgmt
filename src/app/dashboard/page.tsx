import { MetricCard } from "@/components/metric-card";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BellRing, CalendarDays, CirclePlus, CreditCard, PackageCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canAccessPage } from "@/lib/access";
import { getAccessMap } from "@/lib/entitlements";
import { requirePage } from "@/lib/require-page";
import { AiBriefing } from "@/app/insights/ai-briefing";
import { needsReorder } from "@/lib/stock-levels";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default async function DashboardPage() {
  const session = await requirePage("/dashboard");
  const grants = await getAccessMap();
  const role = session?.user.role ?? "";
  const finance = role === "OWNER";
  const branchId = session?.user.branchId;
  const scope = session?.user.role === "OWNER" ? {} : { branchId: branchId ?? "" };
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
        ...(session?.user.role === "OWNER" ? {} : {
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
      count: currentWeekSales.filter((sale) => sale.createdAt >= day && sale.createdAt < nextDay).length,
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((day) => day.total));
  const weekChange = previousTotal ? `${Math.round(((weekTotal - previousTotal) / previousTotal) * 100)}% vs prior week` : "No prior-week baseline";
  const formattedDate = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi" });
  const branchLabel = session?.user.branchName ?? (session?.user.role === "OWNER" ? "All branches" : "Branch not assigned");
  const nextSteps = [
    canAccessPage(role, "/notifications", grants) && paymentReviewCount > 0 ? { href: "/notifications", title: `${paymentReviewCount} payment ${paymentReviewCount === 1 ? "check" : "checks"} to review`, detail: "Match the M-Pesa receipts before they are applied." } : null,
    canAccessPage(role, "/credit", grants) && overduePlanCount > 0 ? { href: "/credit", title: `${overduePlanCount} overdue Lipa ${overduePlanCount === 1 ? "plan" : "plans"}`, detail: "Open the collection board and record a payment or place a call." } : null,
    canAccessPage(role, "/inventory", grants) && lowStock.length > 0 ? { href: "/inventory", title: `${lowStock.length} stock ${lowStock.length === 1 ? "item needs" : "items need"} a reorder`, detail: `${lowStock[0].product.name} is the thinnest on hand.` } : null,
  ].filter((step) => step !== null);
  const nextStep = nextSteps[0] ?? (canAccessPage(role, "/sales", grants) ? { href: "/sales", title: todaySales.length ? `${todaySales.length} ${todaySales.length === 1 ? "sale" : "sales"} recorded today` : "No sales yet today", detail: finance && todayTotal ? `${money(todayTotal)} so far. Start the next sale.` : "Start the next sale." } : null);

  return (
    <>
      <div className="space-y-6">
        <section className="dashboard-welcome flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 sm:px-5" aria-label="Next step">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]"><time dateTime={now.toISOString()}>{formattedDate}</time> · {branchLabel}</p>
            <h2 className="mt-1 text-base font-semibold text-[var(--foreground)]">{nextStep?.title ?? "Nothing is waiting"}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{nextStep?.detail ?? "The stock, Lipa, and payment checks you can open are clear."}{nextSteps.length > 1 ? ` ${nextSteps.length - 1} more ${nextSteps.length === 2 ? "item is" : "items are"} on the action desk.` : ""}</p>
          </div>
          {nextStep ? <Link href={nextStep.href} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#0a7d56] px-4 py-2.5 text-xs font-semibold text-white">{nextStep.href === "/sales" ? "Start a sale" : "Open"}<ArrowRight className="h-3.5 w-3.5"/></Link> : null}
        </section>

        <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/sales", icon: CirclePlus, title: "New sale", detail: "Start a checkout" },
            { href: "/inventory", icon: PackageCheck, title: "Receive stock", detail: "Add goods to a branch" },
            { href: "/customers", icon: CreditCard, title: "Customer accounts", detail: "Find a customer or Lipa plan" },
            { href: "/credit", icon: CalendarDays, title: "Collect a payment", detail: "Open the Lipa collection board" },
          ].filter(({ href }) => canAccessPage(role, href, grants)).map(({ href, icon: Icon, title, detail }) => <Link key={href} href={href} className="dashboard-shortcut group flex min-h-24 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] transition group-hover:scale-105"><Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[var(--foreground)]">{title}</span><span className="mt-1 block text-xs text-[var(--muted)]">{detail}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-1 group-hover:text-[var(--accent-text)]"/></Link>)}
        </section>

        <div className="dashboard-metrics grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Sales today" value={finance ? money(todayTotal) : String(todaySales.length)} delta={finance ? `${todaySales.length} transactions` : "Transactions · revenue stays with the owner"} tone="green" />
          <MetricCard label="Sales · 7 days" value={finance ? money(weekTotal) : String(currentWeekSales.length)} delta={finance ? weekChange : "Transaction count · revenue stays with the owner"} tone={weekTotal >= previousTotal ? "green" : "amber"} />
          <MetricCard label="Units on hand" value={units.toLocaleString("en-KE")} delta={`${inventory.length} stocked products`} tone="neutral" />
          <MetricCard label="Reorder attention" value={String(lowStock.length)} delta={`${monitoredStockCount} products have a reorder point`} tone={lowStock.length ? "amber" : "green"} />
        </div>

        <section aria-labelledby="action-desk-heading" className="dashboard-action-desk overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3.5 sm:px-5"><div><p className="text-[9px] font-semibold uppercase tracking-[.17em] text-[var(--muted)]">A clear next step</p><h3 id="action-desk-heading" className="mt-1 text-sm font-semibold text-[var(--foreground)]">Today’s action desk</h3></div><span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[9px] font-medium text-[var(--muted)]">Live from this branch</span></div>
          <div className="grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
            {canAccessPage(role, "/inventory", grants) ? <Link href="/inventory" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--panel)] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${lowStock.length ? "bg-[var(--warning-soft)] text-[var(--warning-text)]" : "bg-[var(--accent-soft)] text-[var(--foreground)]"}`}>{lowStock.length ? <AlertTriangle className="h-4 w-4"/> : <PackageCheck className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">{lowStock.length ? `${lowStock.length} stock items need attention` : "No configured reorder alerts"}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{lowStock.length ? "Review quantities and reorder points" : `${monitoredStockCount} products monitored · set a reorder point in inventory`}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-text)]"/></Link> : null}
            {canAccessPage(role, "/credit", grants) ? <Link href="/credit" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--panel)] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${overduePlanCount ? "bg-[var(--warning-soft)] text-[var(--warning-text)]" : "bg-[var(--background)] text-[var(--warning-text)]"}`}><CreditCard className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[var(--foreground)]">{overduePlanCount ? `${overduePlanCount} overdue Lipa plans` : "Collections are on track"}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{overduePlanCount ? "Review balances and follow-up status" : "Open Lipa Mdogo Mdogo"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-text)]"/></Link> : null}
            {canAccessPage(role, "/notifications", grants) ? <Link href="/notifications" className="group flex items-center gap-3 px-4 py-4 transition hover:bg-[var(--panel)] sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${paymentReviewCount ? "bg-[var(--warning-soft)] text-[var(--warning-text)]" : "bg-[var(--background)] text-[var(--foreground)]"}`}><BellRing className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-[var(--foreground)]">{paymentReviewCount ? `${paymentReviewCount} payment checks need review` : "Payment messages are clear"}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{paymentReviewCount ? "Resolve unmatched M-Pesa confirmations" : "Open messages and delivery activity"}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-text)]"/></Link> : null}
          </div>
        </section>

        {role === "OWNER" || role === "BRANCH_MANAGER" ? <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} /> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="dashboard-panel dashboard-chart">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><div><h3 className="text-sm font-semibold">Sales activity</h3><p className="mt-1 text-xs text-[var(--foreground)]">{finance ? "Daily revenue · last 7 days" : "Daily transactions · last 7 days"}</p></div><span className="text-sm font-semibold">{finance ? money(weekTotal) : currentWeekSales.length}</span></div>
            <div className="grid h-52 grid-cols-7 gap-3 px-5 pb-4 pt-5 sm:gap-5">
              {dailyTotals.map((day) => <div key={day.label} className="group flex min-w-0 flex-col items-center justify-end gap-2"><span className={`truncate text-[10px] tabular-nums ${day.isToday ? "font-bold text-[var(--accent-text)]" : "text-[var(--muted)]"}`}>{finance ? (day.total ? money(day.total).replace("KES ", "") : "—") : (day.count || "—")}</span><div className="flex h-32 w-full items-end overflow-hidden rounded-t-md bg-[var(--background)]"><div title={finance ? money(day.total) : `${day.count} sales`} className={`w-full rounded-t-md transition-all duration-500 group-hover:brightness-110 ${day.isToday ? "bg-gradient-to-t from-[#0a7d56] to-[#0fa36e]" : "bg-gradient-to-t from-[#6b6b66] to-[#e5f5ee]"}`} style={{ height: `${Math.max(4, ((finance ? day.total : day.count) / (finance ? maxDaily : Math.max(1, ...dailyTotals.map((item) => item.count)))) * 100)}%` }} /></div><span className={`grid h-6 min-w-8 place-items-center rounded-full px-2 text-[10px] font-semibold ${day.isToday ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--muted)]"}`}>{day.label}</span></div>)}
            </div>
          </section>

          <section className="dashboard-panel dashboard-stock">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><h3 className="text-sm font-semibold">Reorder attention</h3><span className="text-xs text-[var(--foreground)]">{lowStock.length} items</span></div>
            <div className="divide-y divide-[#f4f4f2]">
              {lowStock.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-1 text-xs text-[var(--foreground)]">{item.product.sku} · {item.branch.name}</p></div><span className="shrink-0 text-sm font-semibold text-[var(--danger-text)]">{item.stockOnHand - item.reservedStock} left</span></div>)}
              {!lowStock.length ? <p className="px-4 py-6 text-sm text-[var(--foreground)]">No stock is at or below its reorder level.</p> : null}
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="dashboard-panel dashboard-sales">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[var(--foreground)]">Latest 8</span></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)]"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 font-medium">Cashier</th>{finance ? <th className="px-4 py-3 text-right font-medium">Total</th> : null}<th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#f4f4f2]">
              {recentSales.map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-mono text-[11px] font-semibold text-[var(--foreground)]">{sale.invoiceNumber}</td><td className="px-4 py-3 text-[var(--foreground)]">{sale.createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</td><td className="px-4 py-3">{sale.branch.name}</td><td className="px-4 py-3">{sale.cashier.name}</td>{finance ? <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--foreground)]">{money(sale.total)}</td> : null}<td className="px-4 py-3 text-xs"><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent-text)]">{sale.status}</span></td></tr>)}
              {!recentSales.length ? <tr><td colSpan={finance ? 6 : 5} className="px-4 py-8 text-center text-sm text-[var(--foreground)]">No completed sales have been recorded in this period.</td></tr> : null}
            </tbody></table></div>
          </section>

          <section className="dashboard-panel dashboard-credit">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit plans due</h3><span className="text-xs text-[var(--foreground)]">Next 7 days</span></div>
            <div className="divide-y divide-[#f4f4f2]">
              {duePlans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[var(--foreground)]">{plan.branch.name} · Due {plan.nextDueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</p></div>{finance ? <span className="shrink-0 text-sm font-semibold tabular-nums">{money(plan.balance)}</span> : <span className="shrink-0 text-xs font-semibold text-[var(--foreground)]">Collect</span>}</div>)}
              {!duePlans.length ? <p className="px-4 py-6 text-sm text-[var(--foreground)]">No active credit installments due this week.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
