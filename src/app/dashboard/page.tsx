import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  const [sales, inventory, duePlans] = await Promise.all([
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
  ]);

  const completedSales = sales.filter((sale) => sale.status !== "VOIDED");
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
      total: currentWeekSales.filter((sale) => sale.createdAt >= day && sale.createdAt < nextDay).reduce((sum, sale) => sum + sale.total, 0),
    };
  });
  const maxDaily = Math.max(1, ...dailyTotals.map((day) => day.total));
  const weekChange = previousTotal ? `${Math.round(((weekTotal - previousTotal) / previousTotal) * 100)}% vs prior week` : "No prior-week baseline";
  const formattedDate = now.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div><p className="text-sm text-[#66736a]">{session?.user.branchName ?? (session?.user.role === "OWNER" ? "All branches" : "Branch not assigned")}</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Operations overview</h2></div>
          <time dateTime={now.toISOString()} className="text-sm text-[#66736a]">{formattedDate}</time>
        </div>

        <div className="grid gap-px border border-[#dfe4df] bg-[#dfe4df] md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Sales today" value={money(todayTotal)} delta={`${todaySales.length} transactions`} tone="green" />
          <MetricCard label="Sales · 7 days" value={money(weekTotal)} delta={weekChange} tone={weekTotal >= previousTotal ? "green" : "amber"} />
          <MetricCard label="Units on hand" value={units.toLocaleString("en-KE")} delta={`${inventory.length} stocked products`} tone="neutral" />
          <MetricCard label="Reorder attention" value={String(lowStock.length)} delta="at or below minimum" tone={lowStock.length ? "amber" : "green"} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="border border-[#dfe4df] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><div><h3 className="text-sm font-semibold">Sales activity</h3><p className="mt-1 text-xs text-[#69746c]">Daily revenue · last 7 days</p></div><span className="text-sm font-semibold">{money(weekTotal)}</span></div>
            <div className="grid h-48 grid-cols-7 gap-3 px-4 pb-3 pt-5 sm:gap-5">
              {dailyTotals.map((day) => <div key={day.label} className="flex min-w-0 flex-col items-center justify-end gap-2"><span className="truncate text-[10px] tabular-nums text-[#69746c]">{day.total ? `${Math.round(day.total / 1000)}k` : ""}</span><div className="flex h-32 w-full items-end"><div title={money(day.total)} className="w-full bg-[#315d3f]" style={{ height: `${Math.max(3, (day.total / maxDaily) * 100)}%` }} /></div><span className="text-[10px] text-[#69746c]">{day.label}</span></div>)}
            </div>
          </section>

          <section className="border border-[#dfe4df] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Reorder attention</h3><span className="text-xs text-[#69746c]">{lowStock.length} items</span></div>
            <div className="divide-y divide-[#edf0ed]">
              {lowStock.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.product.name}</p><p className="mt-1 text-xs text-[#69746c]">{item.product.sku} · {item.branch.name}</p></div><span className="shrink-0 text-sm font-semibold text-[#995338]">{item.stockOnHand - item.reservedStock} left</span></div>)}
              {!lowStock.length ? <p className="px-4 py-6 text-sm text-[#69746c]">No stock is at or below its reorder level.</p> : null}
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <section className="border border-[#dfe4df] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[#69746c]">Latest 8</span></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Time</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 font-medium">Cashier</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">
              {completedSales.slice(0, 8).map((sale) => <tr key={sale.id}><td className="px-4 py-3 font-mono text-xs">{sale.invoiceNumber}</td><td className="px-4 py-3 text-[#69746c]">{sale.createdAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3">{sale.branch.name}</td><td className="px-4 py-3">{sale.cashier.name}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{money(sale.total)}</td><td className="px-4 py-3 text-xs">{sale.status}</td></tr>)}
              {!completedSales.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No completed sales have been recorded in this period.</td></tr> : null}
            </tbody></table></div>
          </section>

          <section className="border border-[#dfe4df] bg-white">
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
