import { auth } from "@/auth";
import { getBusinessInsights } from "@/lib/business-insights";
import { presentBusinessInsights } from "@/lib/finance-visibility";
import { canAccessPage } from "@/lib/entitlements";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CalendarRange, CircleDollarSign, CreditCard, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AiBriefing } from "./ai-briefing";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const shortMoney = (amount: number) => amount >= 1_000_000 ? `KES ${(amount / 1_000_000).toFixed(1)}m` : amount >= 100_000 ? `KES ${(amount / 1_000).toFixed(0)}k` : money(amount);

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[var(--muted)]">No previous-period baseline</span>;
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${positive ? "text-[var(--accent-text)]" : "text-[var(--danger-text)]"}`}>
    {positive ? <ArrowUpRight className="h-3.5 w-3.5"/> : <ArrowDownRight className="h-3.5 w-3.5"/>}{Math.abs(value)}% <span className="font-normal text-[var(--muted)]">vs prior 30 days</span>
  </span>;
}

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await canAccessPage(session.user.role, "/insights", session.user.id))) notFound();
  if (session.user.role !== "OWNER" && session.user.role !== "BRANCH_MANAGER") notFound();
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const data = presentBusinessInsights(await getBusinessInsights(scope), session.user.role);
  const finance = data.financeVisible;
  const maxProductSales = Math.max(1, ...data.inventory.topProducts.map((item) => finance ? (item.total ?? 0) : item.units));
  const maxDay = Math.max(1, ...data.sales.daily.map((day) => day.total ?? 0));
  const lowStockCount = data.inventory.attentionCount;
  const dateRange = `${new Date(data.period.from).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" })} – ${new Date(data.period.to).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })}`;

  return <>
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section className="relative overflow-hidden rounded-[20px] border border-[#8a5a12] bg-[var(--background)] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-32 h-72 w-72 rounded-full border border-[#8a5a12]"/><div className="pointer-events-none absolute -right-6 -top-24 h-52 w-52 rounded-full border border-[var(--border)]"/>
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div><span className="inline-flex items-center gap-1.5 rounded-full border border-[#8a5a12] bg-[var(--panel)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.17em] text-[var(--foreground)]"><Sparkles className="h-3 w-3 text-[var(--warning-text)]"/>Decision support</span><h2 className="mt-3 font-serif text-[29px] leading-tight tracking-[-.035em] text-[var(--foreground)] sm:text-[34px]">Business insights</h2><p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--foreground)]">See the movement behind your sales, stock and Lipa book, then turn it into a clear next step.</p></div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-xs font-medium text-[var(--foreground)]"><CalendarRange className="h-4 w-4 text-[var(--muted)]"/><span>Last 30 days · {dateRange}</span></div>
        </div>
      </section>

      <section aria-label="Key business measures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[15px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_2px_9px_rgb(0_0_0/.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{finance ? "Sales value" : "Sales"}</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--background)] text-[var(--foreground)]"><CircleDollarSign className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[var(--foreground)]">{finance && data.sales.current.total !== null ? shortMoney(data.sales.current.total) : data.sales.current.salesCount}</p><p className="mt-2 text-[10px]">{finance ? <Change value={data.sales.totalChangePercent}/> : <span className="text-[var(--muted)]">Count only · revenue stays with the owner</span>}</p></article>
        <article className="rounded-[15px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_2px_9px_rgb(0_0_0/.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{finance ? "Cash collected" : "Units sold"}</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--background)] text-[var(--warning-text)]"><CircleDollarSign className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[var(--foreground)]">{finance && data.sales.current.collected !== null ? shortMoney(data.sales.current.collected) : data.sales.current.units}</p><p className="mt-2 text-[10px]">{finance ? <Change value={data.sales.collectedChangePercent}/> : <span className="text-[var(--muted)]">Units only · collected money stays with the owner</span>}</p></article>
        {finance ? <article className="rounded-[15px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_2px_9px_rgb(0_0_0/.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Estimated gross profit</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--background)] text-[var(--foreground)]"><ArrowUpRight className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[var(--foreground)]">{data.sales.current.estimatedGrossProfit === null ? "No cost data" : shortMoney(data.sales.current.estimatedGrossProfit)}</p><p className="mt-2 text-[10px]"><Change value={data.sales.profitChangePercent}/></p><p className="mt-1 text-[9px] text-[var(--muted)]">Cost recorded for {data.sales.current.costCoveragePercent}% of units</p></article> : <article className="rounded-[15px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_2px_9px_rgb(0_0_0/.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Stock to review</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--background)] text-[var(--foreground)]"><ArrowUpRight className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[var(--foreground)]">{lowStockCount}</p><p className="mt-2 text-[10px] text-[var(--muted)]">Profit and cost stay with the owner</p></article>}
        <article className="rounded-[15px] border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_2px_9px_rgb(0_0_0/.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">{finance ? "Overdue Lipa balance" : "Active Lipa plans"}</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--warning-soft)] text-[var(--warning-text)]"><CreditCard className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[var(--foreground)]">{finance && data.credit.overdueBalance !== null ? shortMoney(data.credit.overdueBalance) : data.credit.activePlans}</p><p className="mt-2 text-[10px] text-[var(--muted)]">{finance ? `Across ${data.credit.activePlans} active plans` : "Balances stay with the owner"}</p></article>
      </section>

      <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <section className="overflow-hidden rounded-[17px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">How did daily sales move?</h3><p className="mt-1 text-[11px] text-[var(--muted)]">{finance ? "Recorded sale value · current 30-day period" : "Revenue by day stays with the owner"}</p></div><span className="text-xs font-semibold tabular-nums text-[var(--foreground)]">{finance && data.sales.current.total !== null ? money(data.sales.current.total) : `${data.sales.current.salesCount} sales`}</span></div>
          <div className="flex h-[208px] items-end gap-[3px] px-4 pb-3 pt-5 sm:gap-1.5 sm:px-6">
            {finance ? data.sales.daily.map((day, index) => <div key={`${day.label}-${index}`} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${day.label}: ${day.total === null ? "Hidden" : money(day.total)}`}><div className={`w-full rounded-t-[3px] transition-colors group-hover:bg-[#0a7d56] ${day.total ? "bg-[#6b6b66]" : "bg-[var(--background)]"}`} style={{ height: `${day.total ? Math.max(4, (day.total / maxDay) * 100) : 2}%` }}/>{index % 5 === 0 && <span className="absolute -bottom-5 left-0 whitespace-nowrap text-[8px] text-[var(--muted)]">{day.label}</span>}</div>) : <p className="px-2 pb-6 text-sm text-[var(--foreground)]">Daily revenue is hidden for this role. The sales count above is the operational view.</p>}
          </div>
          {finance ? <p className="px-5 pb-4 pt-5 text-[10px] text-[var(--muted)]">Previous 30-day sales: <span className="font-semibold text-[var(--foreground)]">{data.sales.previous.total === null ? "Hidden" : money(data.sales.previous.total)}</span>{data.sales.totalChangePercent !== null ? <span> · {Math.abs(data.sales.totalChangePercent)}% {data.sales.totalChangePercent >= 0 ? "higher" : "lower"}</span> : null}</p> : null}
        </section>

        <section className="overflow-hidden rounded-[17px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.03)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">{finance ? "What is driving sales value?" : "What sold the most units?"}</h3><p className="mt-1 text-[11px] text-[var(--muted)]">Top products · last 30 days</p></div><Boxes className="h-4 w-4 text-[var(--muted)]"/></div>
          <div className="space-y-4 px-5 py-4">
            {data.inventory.topProducts.map((product, index) => <div key={product.sku}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-[var(--foreground)]"><span className="mr-2 font-mono text-[9px] text-[var(--muted)]">0{index + 1}</span>{product.name}</span><span className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">{finance && product.total !== null ? shortMoney(product.total) : `${product.units} units`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--background)]"><div className="h-full rounded-full bg-[#6b6b66]" style={{ width: `${Math.max(4, ((finance ? product.total ?? 0 : product.units) / maxProductSales) * 100)}%` }}/></div></div>)}
            {!data.inventory.topProducts.length && <p className="py-4 text-xs text-[var(--muted)]">No completed sales in this period yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[17px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.03)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">Which stock needs attention?</h3><p className="mt-1 text-[11px] text-[var(--muted)]">Available units compared with reorder level</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${lowStockCount ? "bg-[var(--warning-soft)] text-[var(--warning-text)]" : "bg-[var(--background)] text-[var(--foreground)]"}`}>{lowStockCount} to review</span></div>
          <div className="divide-y divide-[#f4f4f2]">
            {data.inventory.attention.slice(0, 5).map((item) => { const below = item.available <= item.reorderPoint; return <div key={item.sku} className="flex items-center justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--foreground)]">{item.name}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{item.sku} · {item.unitsSold30d} sold in 30 days{item.daysOfCover === null ? " · cover unavailable" : ` · ${item.daysOfCover} days of cover`}</p></div><span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums ${below ? "text-[var(--warning-text)]" : "text-[var(--foreground)]"}`}>{below && <AlertTriangle className="h-3.5 w-3.5"/>}{item.available} <span className="text-[9px] font-normal text-[var(--muted)]">available</span></span></div>; })}
            {!data.inventory.attention.length && <p className="px-5 py-6 text-xs text-[var(--muted)]">No inventory records to analyze.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-[17px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_3px_14px_rgb(0_0_0/.03)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">{finance ? "How old is the overdue balance?" : "Lipa book"}</h3><p className="mt-1 text-[11px] text-[var(--muted)]">{finance ? "Open installment amounts · KES" : "Counts only · balances stay with the owner"}</p></div><CreditCard className="h-4 w-4 text-[var(--muted)]"/></div>
          {finance && data.credit.ageBuckets ? <div className="grid grid-cols-2 gap-2.5 p-4 sm:p-5">
            {([ ["Not due", data.credit.ageBuckets.notDue, "#f4f4f2", "#111111"], ["1–7 days late", data.credit.ageBuckets.days1to7, "#fdf3df", "#8a5a12"], ["8–30 days late", data.credit.ageBuckets.days8to30, "#fdf3df", "#8a5a12"], ["31+ days late", data.credit.ageBuckets.days31Plus, "#fdeceb", "#b3261e"] ] as const).map(([label, value, bg, fg]) => <div key={label} className="rounded-xl border border-[var(--border)] px-3.5 py-3" style={{ backgroundColor: bg }}><p className="text-[10px] font-medium" style={{ color: fg }}>{label}</p><p className="mt-1.5 text-sm font-semibold tabular-nums text-[var(--foreground)]">{shortMoney(value)}</p></div>)}
          </div> : <p className="px-5 py-6 text-sm text-[var(--foreground)]">{data.credit.activePlans} active plans. Open Lipa to collect a payment. Shop-wide balances are not shown for this role.</p>}
          <p className="px-5 pb-4 text-[10px] leading-relaxed text-[var(--muted)]">{finance ? "Balances are calculated from unpaid scheduled installments. Review individual plans before contacting customers." : "Individual account balances stay on the Lipa screen so a payment can still be recorded."}</p>
        </section>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-[var(--muted)]">Figures come from GadgetHub records. Gross profit is an estimate based on recorded item costs and sale totals. AI recommendations summarize these figures and should be reviewed by the business owner.</p>
    </div>
  </>;
}
