"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Banknote, CalendarRange, Target, Trash2, TrendingUp, UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { MetricCard } from "@/components/metric-card";

type Range = "today" | "week" | "month" | "custom";
type Goal = { id: string; period: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM"; label: string | null; amount: number; unitsTarget: number | null; from: string; to: string; achieved: number; unitsSold: number; salesCount: number; percent: number };
type Report = {
  range: Range;
  from: string;
  to: string;
  summary: { revenue: number; salesCount: number; units: number; averageSale: number; tradeIns: number };
  byStaff: { id: string; name: string; sales: number; units: number; revenue: number }[];
  byCategory: { category: string; units: number; revenue: number }[];
  daily: { date: string; revenue: number; sales: number }[];
  lines: { saleId: string; invoiceNumber: string; createdAt: string; product: string; condition: string; quantity: number; total: number; paymentMethod: string; cashier: string; customer: string | null }[];
  goals: Goal[];
  finance: null | { collectedByMethod: { method: string; amount: number }[]; lipaCollections: number; grossProfit: number; tradeInValue: number; outstandingLipa: number; settlementBank: string };
  canManageGoals: boolean;
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const rangeLabels: Record<Range, string> = { today: "Today", week: "This week", month: "This month", custom: "Custom dates" };
const periodLabels: Record<Goal["period"], string> = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month", CUSTOM: "Custom dates" };
const methodLabels: Record<string, string> = { CASH: "Cash", MPESA: "M-Pesa", CARD: "Card" };
const conditionLabels: Record<string, string> = { NEW: "New", EX_UK: "Ex-UK", TRADE_IN: "Trade-in" };
const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());

export default function ReportsPage() {
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [goalPeriod, setGoalPeriod] = useState<Goal["period"]>("DAILY");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ range });
    if (range === "custom") { params.set("from", from); params.set("to", to); }
    try {
      const response = await fetch(`/api/reports/sales?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The sales report could not be loaded.");
      setReport(result);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The sales report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [range, from, to]);

  useEffect(() => {
    const frame = window.setTimeout(() => void load(), 0);
    const live = () => void load();
    window.addEventListener("gadgethub:live", live);
    return () => { window.clearTimeout(frame); window.removeEventListener("gadgethub:live", live); };
  }, [load]);

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSavingGoal(true);
    setError("");
    setNotice("");
    try {
      const units = Number(data.get("unitsTarget") || 0);
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: goalPeriod,
          amount: Number(data.get("amount")),
          ...(units > 0 ? { unitsTarget: units } : {}),
          ...(String(data.get("label") || "").trim() ? { label: String(data.get("label")).trim() } : {}),
          ...(goalPeriod === "CUSTOM" ? { from: data.get("goalFrom"), to: data.get("goalTo") } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The goal could not be saved.");
      form.reset();
      setNotice("Sales goal saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The goal could not be saved.");
    } finally {
      setSavingGoal(false);
    }
  }

  async function removeGoal(id: string) {
    setError("");
    const response = await fetch(`/api/targets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "The goal could not be removed."); return; }
    setNotice("Sales goal removed.");
    await load();
  }

  const maxDaily = Math.max(1, ...(report?.daily ?? []).map((day) => day.revenue));

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#4a4a4a]"><TrendingUp className="h-3.5 w-3.5"/>Sales performance</p>
            <h2 className="mt-1.5 text-[26px] font-semibold tracking-[-.045em] text-[#111111]">Sales reports</h2>
            <p className="mt-1 text-sm text-[#6b6b6b]">{report ? `${dateLabel(report.from)} – ${dateLabel(new Date(new Date(report.to).getTime() - 1).toISOString())}` : "Sales, units and who sold them"}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div role="group" aria-label="Report period" className="flex overflow-hidden rounded-xl border border-[#d4d4d4] bg-white text-xs font-semibold">
              {(Object.keys(rangeLabels) as Range[]).map((option) => <button key={option} type="button" aria-pressed={range === option} onClick={() => { if (option === "custom" && !from) { setFrom(todayKey()); setTo(todayKey()); } setLoading(true); setRange(option); }} className={`px-3 py-2 transition ${range === option ? "bg-[#111111] text-white" : "text-[#4a4a4a] hover:bg-[#f5f5f5]"}`}>{rangeLabels[option]}</button>)}
            </div>
            {range === "custom" ? <div className="flex items-end gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[#6b6b6b]">
              <label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-[#d4d4d4] bg-white px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
              <label>To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-[#d4d4d4] bg-white px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
            </div> : null}
          </div>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={`Sales · ${rangeLabels[range].toLowerCase()}`} value={loading || !report ? "—" : money(report.summary.revenue)} delta={report ? `${report.summary.salesCount} completed sales` : "Loading"} tone="green"/>
          <MetricCard label="Units sold" value={loading || !report ? "—" : report.summary.units.toLocaleString("en-KE")} delta={report ? `${report.summary.tradeIns} with a trade-in` : "Loading"} tone="neutral"/>
          <MetricCard label="Average sale" value={loading || !report ? "—" : money(report.summary.averageSale)} delta="Per completed sale" tone="neutral"/>
          <MetricCard label="Top seller" value={report?.byStaff[0]?.name ?? "—"} delta={report?.byStaff[0] ? money(report.byStaff[0].revenue) : "No sales yet"} tone="neutral"/>
        </div>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4"/>Sales goals</h3><span className="text-xs text-[#69746c]">Progress over each goal’s own period</span></div>
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {report?.goals.map((goal) => <div key={goal.id} className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3.5">
              <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b6b]">{periodLabels[goal.period]}</p><p className="mt-1 text-xs font-semibold text-[#111111]">{goal.label ?? (goal.period === "CUSTOM" ? `${dateLabel(goal.from)} – ${dateLabel(new Date(new Date(goal.to).getTime() - 1).toISOString())}` : `Goal ${money(goal.amount)}`)}</p></div>{report.canManageGoals ? <button type="button" onClick={() => void removeGoal(goal.id)} aria-label="Remove goal" className="rounded-md p-1 text-[#9a9a9a] hover:bg-white hover:text-[#a15d3d]"><Trash2 className="h-3.5 w-3.5"/></button> : null}</div>
              <p className="mt-3 text-lg font-semibold tabular-nums tracking-[-.03em]">{money(goal.achieved)} <span className="text-xs font-medium text-[#6b6b6b]">of {money(goal.amount)}</span></p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e5e5]"><div className={`h-full rounded-full ${goal.percent >= 100 ? "bg-[#2f7d4f]" : "bg-[#111111]"}`} style={{ width: `${Math.min(100, goal.percent)}%` }}/></div>
              <p className="mt-1.5 text-[11px] text-[#6b6b6b]">{goal.percent}% reached · {goal.unitsSold}{goal.unitsTarget ? ` / ${goal.unitsTarget}` : ""} units · {goal.salesCount} sales</p>
            </div>)}
            {report && !report.goals.length ? <p className="text-sm text-[#69746c] md:col-span-2 xl:col-span-4">No goals yet.{report.canManageGoals ? " Set a daily, weekly, monthly or custom-dates goal below." : ""}</p> : null}
          </div>
          {report?.canManageGoals ? <form onSubmit={saveGoal} className="flex flex-wrap items-end gap-2 border-t border-[#e8ebe8] px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[.1em] text-[#6b6b6b]">
            <label>Goal type<select value={goalPeriod} onChange={(event) => setGoalPeriod(event.target.value as Goal["period"])} className="mt-1 block rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]">{(Object.keys(periodLabels) as Goal["period"][]).map((period) => <option key={period} value={period}>{periodLabels[period]}</option>)}</select></label>
            <label>Sales goal (KES)<input name="amount" type="number" required min={1} step={1} placeholder="500000" className="mt-1 block w-36 rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
            <label>Units <span className="normal-case tracking-normal">(optional)</span><input name="unitsTarget" type="number" min={1} step={1} placeholder="10" className="mt-1 block w-24 rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
            {goalPeriod === "CUSTOM" ? <>
              <label>From<input name="goalFrom" type="date" required defaultValue={todayKey()} className="mt-1 block rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
              <label>To<input name="goalTo" type="date" required defaultValue={todayKey()} className="mt-1 block rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
            </> : null}
            <label>Name <span className="normal-case tracking-normal">(optional)</span><input name="label" maxLength={80} placeholder="December push" className="mt-1 block w-40 rounded-lg border border-[#d4d4d4] bg-white px-2 py-2 text-xs font-normal normal-case tracking-normal text-[#111111]"/></label>
            <button disabled={savingGoal} className="rounded-lg bg-[#111111] px-3.5 py-2 text-xs font-semibold normal-case tracking-normal text-white disabled:opacity-60">{savingGoal ? "Saving…" : "Save goal"}</button>
            <p className="w-full text-[10px] font-normal normal-case tracking-normal text-[#8a8a8a]">A new daily, weekly or monthly goal replaces the previous one of that type.</p>
          </form> : null}
        </section>

        {report && report.daily.length > 1 ? <section className="rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4"/>Sales by day</h3><span className="text-sm font-semibold tabular-nums">{money(report.summary.revenue)}</span></div>
          <div className="flex h-48 items-end gap-1 overflow-x-auto px-4 pb-3 pt-4">
            {report.daily.map((day) => <div key={day.date} className="group flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1" title={`${day.date} · ${money(day.revenue)} · ${day.sales} sales`}>
              <div className="flex h-32 w-full items-end rounded-t bg-[#f5f5f5]"><div className="w-full rounded-t bg-gradient-to-t from-[#2d2d2d] to-[#6b6b6b] group-hover:brightness-125" style={{ height: `${Math.max(2, (day.revenue / maxDaily) * 100)}%` }}/></div>
              <span className="text-[9px] text-[#8a8a8a]">{day.date.slice(8)}</span>
            </div>)}
          </div>
        </section> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><UsersRound className="h-4 w-4"/>Sales by team member</h3><span className="text-xs text-[#69746c]">{report?.byStaff.length ?? 0} people</span></div>
            <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Team member</th><th className="px-4 py-3 text-right font-medium">Sales</th><th className="px-4 py-3 text-right font-medium">Units</th><th className="px-4 py-3 text-right font-medium">Value sold</th></tr></thead><tbody className="divide-y divide-[#e5e5e5]">
              {report?.byStaff.map((staff) => <tr key={staff.id}><td className="px-4 py-3 font-medium">{staff.name}</td><td className="px-4 py-3 text-right tabular-nums">{staff.sales}</td><td className="px-4 py-3 text-right tabular-nums">{staff.units}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(staff.revenue)}</td></tr>)}
              {report && !report.byStaff.length ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[#69746c]">No completed sales in this period.</td></tr> : null}
            </tbody></table></div>
          </section>
          <section className="rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">By product type</h3></div>
            <div className="divide-y divide-[#e5e5e5]">
              {report?.byCategory.map((row) => <div key={row.category} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-medium">{row.category}</p><p className="mt-0.5 text-xs text-[#69746c]">{row.units} units</p></div><span className="text-sm font-semibold tabular-nums">{money(row.revenue)}</span></div>)}
              {report && !report.byCategory.length ? <p className="px-4 py-6 text-sm text-[#69746c]">Nothing sold yet in this period.</p> : null}
            </div>
          </section>
        </div>

        {report?.finance ? <section className="rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4"/>Financial position</h3><span className="text-xs text-[#69746c]">M-Pesa collections settle to {report.finance.settlementBank}</span></div>
          <div className="grid gap-px bg-[#e5e5e5] sm:grid-cols-2 xl:grid-cols-4">
            {[
              ...["MPESA", "CASH", "CARD"].map((method) => ({ label: `${methodLabels[method]} collected`, value: report.finance!.collectedByMethod.find((row) => row.method === method)?.amount ?? 0 })),
              { label: "Lipa installments collected", value: report.finance.lipaCollections },
              { label: "Gross profit on sales", value: report.finance.grossProfit },
              { label: "Trade-in value given", value: report.finance.tradeInValue },
              { label: "Outstanding Lipa balances", value: report.finance.outstandingLipa },
            ].map((item) => <div key={item.label} className="bg-white px-4 py-3.5"><p className="text-xs text-[#69746c]">{item.label}</p><p className="mt-1 text-base font-semibold tabular-nums">{money(item.value)}</p></div>)}
          </div>
        </section> : null}

        <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Items sold and by whom</h3><span className="text-xs text-[#69746c]">Latest 60 sales</span></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Item</th><th className="px-4 py-3 text-right font-medium">Qty</th><th className="px-4 py-3 text-right font-medium">Value</th><th className="px-4 py-3 font-medium">Paid by</th><th className="px-4 py-3 font-medium">Sold by</th><th className="px-4 py-3 font-medium">Customer</th></tr></thead><tbody className="divide-y divide-[#e5e5e5]">
            {report?.lines.map((line, index) => <tr key={`${line.saleId}-${index}`}><td className="whitespace-nowrap px-4 py-3 text-xs text-[#69746c]">{new Date(line.createdAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</td><td className="px-4 py-3"><span className="font-medium">{line.product}</span> <span className="ml-1 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">{conditionLabels[line.condition] ?? line.condition}</span></td><td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(line.total)}</td><td className="px-4 py-3 text-xs">{line.paymentMethod === "CREDIT" ? "Lipa Mdogo Mdogo" : line.paymentMethod.replace("_", " ")}</td><td className="px-4 py-3">{line.cashier}</td><td className="px-4 py-3 text-[#69746c]">{line.customer ?? "Walk-in"}</td></tr>)}
            {report && !report.lines.length ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#69746c]">No items sold in this period.</td></tr> : null}
          </tbody></table></div>
        </section>
      </div>
    </AppShell>
  );
}
