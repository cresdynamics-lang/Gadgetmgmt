import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { getBusinessInsights } from "@/lib/business-insights";
import { canAccessPage } from "@/lib/access";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CalendarRange, CircleDollarSign, CreditCard, Sparkles } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AiBriefing } from "./ai-briefing";

export const instant = false;

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const shortMoney = (amount: number) => amount >= 1_000_000 ? `KES ${(amount / 1_000_000).toFixed(1)}m` : amount >= 100_000 ? `KES ${(amount / 1_000).toFixed(0)}k` : money(amount);

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[#889189]">No previous-period baseline</span>;
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${positive ? "text-[#39724f]" : "text-[#a35442]"}`}>
    {positive ? <ArrowUpRight className="h-3.5 w-3.5"/> : <ArrowDownRight className="h-3.5 w-3.5"/>}{Math.abs(value)}% <span className="font-normal text-[#858e85]">vs prior 30 days</span>
  </span>;
}

export default async function InsightsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessPage(session.user.role, "/insights")) notFound();
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const data = await getBusinessInsights(scope);
  const maxProductSales = Math.max(1, ...data.inventory.topProducts.map((item) => item.total));
  const maxDay = Math.max(1, ...data.sales.daily.map((day) => day.total));
  const lowStockCount = data.inventory.attentionCount;
  const dateRange = `${new Date(data.period.from).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" })} – ${new Date(data.period.to).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" })}`;

  return <AppShell>
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section className="relative overflow-hidden rounded-[20px] border border-[#e6e4d8] bg-[#fbfaf6] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-32 h-72 w-72 rounded-full border border-[#e9e4d7]"/><div className="pointer-events-none absolute -right-6 -top-24 h-52 w-52 rounded-full border border-[#eee9df]"/>
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div><span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e4d9] bg-white/80 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.17em] text-[#617768]"><Sparkles className="h-3 w-3 text-[#a78350]"/>Decision support</span><h2 className="mt-3 font-serif text-[29px] leading-tight tracking-[-.035em] text-[#25372b] sm:text-[34px]">Business insights</h2><p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#747d73]">See the movement behind your sales, stock and Lipa book, then turn it into a clear next step.</p></div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#e8e6dc] bg-white/80 px-3 py-2.5 text-xs font-medium text-[#5e7063]"><CalendarRange className="h-4 w-4 text-[#8b9e8e]"/><span>Last 30 days · {dateRange}</span></div>
        </div>
      </section>

      <section aria-label="Key business measures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[15px] border border-[#e7e5dc] bg-white p-4 shadow-[0_2px_9px_rgba(42,46,34,.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#858b80]">Sales value</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#eaf3eb] text-[#477452]"><CircleDollarSign className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[#263a2d]">{shortMoney(data.sales.current.total)}</p><p className="mt-2 text-[10px]"><Change value={data.sales.totalChangePercent}/></p></article>
        <article className="rounded-[15px] border border-[#e7e5dc] bg-white p-4 shadow-[0_2px_9px_rgba(42,46,34,.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#858b80]">Cash collected</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#f3efe5] text-[#917447]"><CircleDollarSign className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[#263a2d]">{shortMoney(data.sales.current.collected)}</p><p className="mt-2 text-[10px]"><Change value={data.sales.collectedChangePercent}/></p></article>
        <article className="rounded-[15px] border border-[#e7e5dc] bg-white p-4 shadow-[0_2px_9px_rgba(42,46,34,.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#858b80]">Estimated gross profit</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#eaf3eb] text-[#477452]"><ArrowUpRight className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[#263a2d]">{data.sales.current.estimatedGrossProfit === null ? "No cost data" : shortMoney(data.sales.current.estimatedGrossProfit)}</p><p className="mt-2 text-[10px]"><Change value={data.sales.profitChangePercent}/></p><p className="mt-1 text-[9px] text-[#858e85]">Cost recorded for {data.sales.current.costCoveragePercent}% of units</p></article>
        <article className="rounded-[15px] border border-[#e7e5dc] bg-white p-4 shadow-[0_2px_9px_rgba(42,46,34,.025)]"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#858b80]">Overdue Lipa balance</p><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#fbf0e8] text-[#9b6240]"><CreditCard className="h-4 w-4"/></span></div><p className="mt-3 text-[23px] font-semibold tracking-[-.045em] text-[#263a2d]">{shortMoney(data.credit.overdueBalance)}</p><p className="mt-2 text-[10px] text-[#858e85]">Across {data.credit.activePlans} active plans</p></article>
      </section>

      <AiBriefing configured={Boolean(process.env.OPENAI_API_KEY)} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <section className="overflow-hidden rounded-[17px] border border-[#e6e5dc] bg-white shadow-[0_3px_14px_rgba(42,46,34,.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeece4] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#2d3e32]">How did daily sales move?</h3><p className="mt-1 text-[11px] text-[#848b81]">Recorded sale value · current 30-day period</p></div><span className="text-xs font-semibold tabular-nums text-[#364a3b]">{money(data.sales.current.total)}</span></div>
          <div className="flex h-[208px] items-end gap-[3px] px-4 pb-3 pt-5 sm:gap-1.5 sm:px-6">
            {data.sales.daily.map((day, index) => <div key={`${day.label}-${index}`} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${day.label}: ${money(day.total)}`}><div className={`w-full rounded-t-[3px] transition-colors group-hover:bg-[#285d43] ${day.total ? "bg-[#82ad8c]" : "bg-[#edf1eb]"}`} style={{ height: `${day.total ? Math.max(4, (day.total / maxDay) * 100) : 2}%` }}/>{index % 5 === 0 && <span className="absolute -bottom-5 left-0 whitespace-nowrap text-[8px] text-[#959b91]">{day.label}</span>}</div>)}
          </div>
          <p className="px-5 pb-4 pt-5 text-[10px] text-[#8b9288]">Previous 30-day sales: <span className="font-semibold text-[#536456]">{money(data.sales.previous.total)}</span>{data.sales.totalChangePercent !== null ? <span> · {Math.abs(data.sales.totalChangePercent)}% {data.sales.totalChangePercent >= 0 ? "higher" : "lower"}</span> : null}</p>
        </section>

        <section className="overflow-hidden rounded-[17px] border border-[#e6e5dc] bg-white shadow-[0_3px_14px_rgba(42,46,34,.03)]">
          <div className="flex items-center justify-between border-b border-[#eeece4] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#2d3e32]">What is driving sales value?</h3><p className="mt-1 text-[11px] text-[#848b81]">Top products · last 30 days</p></div><Boxes className="h-4 w-4 text-[#849786]"/></div>
          <div className="space-y-4 px-5 py-4">
            {data.inventory.topProducts.map((product, index) => <div key={product.sku}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-[#405144]"><span className="mr-2 font-mono text-[9px] text-[#9ca49a]">0{index + 1}</span>{product.name}</span><span className="shrink-0 font-semibold tabular-nums text-[#465c4b]">{shortMoney(product.total)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#f0f2ec]"><div className="h-full rounded-full bg-[#7ea889]" style={{ width: `${Math.max(4, (product.total / maxProductSales) * 100)}%` }}/></div></div>)}
            {!data.inventory.topProducts.length && <p className="py-4 text-xs text-[#858b81]">No completed sales in this period yet.</p>}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[17px] border border-[#e6e5dc] bg-white shadow-[0_3px_14px_rgba(42,46,34,.03)]">
          <div className="flex items-center justify-between border-b border-[#eeece4] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#2d3e32]">Which stock needs attention?</h3><p className="mt-1 text-[11px] text-[#848b81]">Available units compared with reorder level</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${lowStockCount ? "bg-[#fbf0e8] text-[#976040]" : "bg-[#eaf3eb] text-[#477452]"}`}>{lowStockCount} to review</span></div>
          <div className="divide-y divide-[#f0f1ec]">
            {data.inventory.attention.slice(0, 5).map((item) => { const below = item.available <= item.reorderPoint; return <div key={item.sku} className="flex items-center justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#37483b]">{item.name}</p><p className="mt-1 truncate text-[10px] text-[#8a9288]">{item.sku} · {item.unitsSold30d} sold in 30 days{item.daysOfCover === null ? " · cover unavailable" : ` · ${item.daysOfCover} days of cover`}</p></div><span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums ${below ? "text-[#9b6240]" : "text-[#53715b]"}`}>{below && <AlertTriangle className="h-3.5 w-3.5"/>}{item.available} <span className="text-[9px] font-normal text-[#929a90]">available</span></span></div>; })}
            {!data.inventory.attention.length && <p className="px-5 py-6 text-xs text-[#858b81]">No inventory records to analyze.</p>}
          </div>
        </section>

        <section className="overflow-hidden rounded-[17px] border border-[#e6e5dc] bg-white shadow-[0_3px_14px_rgba(42,46,34,.03)]">
          <div className="flex items-center justify-between border-b border-[#eeece4] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#2d3e32]">How old is the overdue balance?</h3><p className="mt-1 text-[11px] text-[#848b81]">Open installment amounts · KES</p></div><CreditCard className="h-4 w-4 text-[#849786]"/></div>
          <div className="grid grid-cols-2 gap-2.5 p-4 sm:p-5">
            {([ ["Not due", data.credit.ageBuckets.notDue, "#eaf3eb", "#477452"], ["1–7 days late", data.credit.ageBuckets.days1to7, "#f7f1df", "#8a6b33"], ["8–30 days late", data.credit.ageBuckets.days8to30, "#f8eadc", "#98603b"], ["31+ days late", data.credit.ageBuckets.days31Plus, "#f7e9e4", "#a35442"] ] as const).map(([label, value, bg, fg]) => <div key={label} className="rounded-xl border border-[#eeece4] px-3.5 py-3" style={{ backgroundColor: bg }}><p className="text-[10px] font-medium" style={{ color: fg }}>{label}</p><p className="mt-1.5 text-sm font-semibold tabular-nums text-[#35463a]">{shortMoney(value)}</p></div>)}
          </div>
          <p className="px-5 pb-4 text-[10px] leading-relaxed text-[#8b9288]">Balances are calculated from unpaid scheduled installments. Review individual plans before contacting customers.</p>
        </section>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-[#939a90]">Figures come from GadgetHub records. Gross profit is an estimate based on recorded item costs and sale totals. AI recommendations summarize these figures and should be reviewed by the business owner.</p>
    </div>
  </AppShell>;
}
