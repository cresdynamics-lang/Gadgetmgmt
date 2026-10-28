"use client";

import { useState, type ReactNode } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

/*
 * Dashboard charts. Colours follow the dataviz reference palette (light mode):
 * one blue for single-measure charts, blue/orange/aqua in fixed order for payment
 * methods (validated: CVD ΔE 9.2, normal ΔE 27.6), and the reserved status colours,
 * always with an icon and label, for Lipa account health.
 */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;

const kes = (value: number) => `KES ${value.toLocaleString("en-KE")}`;
const shortKes = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);

/** Every chart can be read as a plain table too. */
function TableView({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return <details className="border-t border-[#efefef] px-4 py-2 text-xs text-[#6b6b6b]">
    <summary className="cursor-pointer select-none py-1 font-medium">Show as table</summary>
    <div className="overflow-x-auto"><table className="mt-2 min-w-full text-left">
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{headers.map((header, index) => <th key={header} className={`py-1.5 pr-3 font-semibold text-[#2d2d2d] ${index ? "text-right" : ""}`}>{header}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[#f2f2f2]">{row.map((cell, index) => <td key={index} className={`py-1.5 pr-3 tabular-nums ${index ? "text-right" : ""}`}>{cell}</td>)}</tr>)}</tbody>
    </table></div>
  </details>;
}

export function ChartPanel({ title, subtitle, figure, children }: { title: string; subtitle?: string; figure?: string; children: ReactNode }) {
  return <section className="dashboard-panel overflow-hidden rounded-[18px] border border-[#e5e5e5] bg-white">
    <div className="flex items-start justify-between gap-3 border-b border-[#efefef] px-4 py-3.5">
      <div className="min-w-0"><h3 className="text-sm font-semibold text-[#111111]">{title}</h3>{subtitle ? <p className="mt-0.5 text-xs text-[#6b6b6b]">{subtitle}</p> : null}</div>
      {figure ? <span className="shrink-0 text-sm font-semibold tabular-nums text-[#111111]">{figure}</span> : null}
    </div>
    {children}
  </section>;
}

/** Daily sales as columns with a 7-day average line on the same scale, and a hover / focus readout. */
export function DailySalesChart({ days }: { days: { date: string; label: string; value: number; count: number; average: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((day) => Math.max(day.value, day.average)));
  const ticks = [0, 0.5, 1].map((share) => Math.round(max * share));
  const shown = active === null ? null : days[active];
  const labelEvery = days.length > 14 ? 7 : 1;
  const x = (index: number) => ((index + 0.5) / days.length) * 100;
  const y = (value: number) => 100 - (value / max) * 100;
  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-[11px]">
      <div className="flex items-center gap-3 text-[#4a4a4a]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[0] }}/>Daily sales</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-4 rounded-full" style={{ background: SERIES[1] }}/>7-day average</span>
      </div>
      <div className="min-h-4 text-right text-[#2d2d2d]" aria-live="polite">
        {shown ? <span><strong className="tabular-nums">{kes(shown.value)}</strong> · {shown.count} {shown.count === 1 ? "sale" : "sales"} · avg {kes(shown.average)} · {shown.date}</span> : <span className="text-[#8a8a8a]">Hover a day for details</span>}
      </div>
    </div>
    <div className="px-4 pb-2 pt-2">
      <div className="flex h-48 gap-2">
        <div className="flex flex-col justify-between pb-5 pt-1 text-right text-[10px] tabular-nums text-[#8a8a8a]">{[...ticks].reverse().map((tick) => <span key={tick}>{shortKes(tick)}</span>)}</div>
        <div className="relative flex flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-1 bottom-5 flex flex-col justify-between">{ticks.map((tick) => <div key={tick} className="border-t border-[#f0f0f0]"/>)}</div>
          <div className="relative flex flex-1 items-end gap-[2px] pt-1" onPointerLeave={() => setActive(null)}>
            {days.map((day, index) => <button key={day.date} type="button" aria-label={`${day.date}: ${kes(day.value)}, ${day.count} sales, 7-day average ${kes(day.average)}`} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="flex h-full min-w-0 flex-1 items-end outline-none">
              <span className="block w-full rounded-t-[4px]" style={{ height: day.value ? `${Math.max(2, (day.value / max) * 100)}%` : "2px", background: day.value ? SERIES[0] : "#e5e5e5", opacity: active === null || active === index ? 1 : 0.55, outline: active === index ? "2px solid #111111" : "none", outlineOffset: 1 }}/>
            </button>)}
            <svg className="pointer-events-none absolute inset-x-0 top-1 bottom-0 h-[calc(100%-4px)] w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polyline points={days.map((day, index) => `${x(index)},${y(day.average)}`).join(" ")} fill="none" stroke="#fcfcfb" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
              <polyline points={days.map((day, index) => `${x(index)},${y(day.average)}`).join(" ")} fill="none" stroke={SERIES[1]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
            </svg>
            {shown && active !== null ? <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${x(active)}%`, bottom: `${(shown.average / max) * 100}%`, background: SERIES[1] }}/> : null}
          </div>
          <div className="flex h-5 items-end gap-[2px]">{days.map((day, index) => <span key={day.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[9px] text-[#8a8a8a]">{(days.length - 1 - index) % labelEvery === 0 ? day.label : ""}</span>)}</div>
        </div>
      </div>
    </div>
    <TableView caption="Sales by day" headers={["Day", "Sales", "Value", "7-day average"]} rows={days.map((day) => [day.date, day.count, kes(day.value), kes(day.average)])}/>
  </div>;
}

export type SalesPeriod = { key: string; label: string; value: number; count: number; units: number; tradeIns: number; previousLabel: string; previousValue: number };

/** One sales card with a period toggle (Today by default) instead of a card per period. */
export function SalesPeriodCard({ periods }: { periods: SalesPeriod[] }) {
  const [selected, setSelected] = useState(periods[0]?.key ?? "");
  const period = periods.find((item) => item.key === selected) ?? periods[0];
  if (!period) return null;
  const change = period.previousValue ? Math.round(((period.value - period.previousValue) / period.previousValue) * 100) : null;
  return <section aria-label="Sales" className="metric-card rounded-[18px] border border-[#e5e5e5] bg-white p-4 sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#6b6b6b]">Sales</p>
      <div role="tablist" aria-label="Sales period" className="grid w-full grid-cols-4 gap-1 rounded-xl bg-[#f5f5f5] p-1 sm:flex sm:w-auto">
        {periods.map((item) => <button key={item.key} type="button" role="tab" aria-selected={item.key === period.key} onClick={() => setSelected(item.key)} className={`min-h-9 whitespace-nowrap rounded-lg px-1.5 text-[11px] font-semibold transition sm:px-2.5 ${item.key === period.key ? "bg-[#111111] text-white" : "text-[#4a4a4a] hover:bg-white"}`}>{item.label}</button>)}
      </div>
    </div>
    <p className="mt-3 text-[28px] font-semibold tracking-[-.04em] tabular-nums text-[#111111]">{kes(period.value)}</p>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b6b6b]">
      <span><strong className="text-[#111111]">{period.count}</strong> {period.count === 1 ? "sale" : "sales"}</span>
      <span><strong className="text-[#111111]">{period.units}</strong> {period.units === 1 ? "unit" : "units"}</span>
      <span><strong className="text-[#111111]">{period.tradeIns}</strong> with trade-in</span>
      <span>{period.previousLabel}: <strong className="text-[#111111]">{kes(period.previousValue)}</strong>{change !== null ? <span className={change >= 0 ? "ml-1 text-[#2f7d4f]" : "ml-1 text-[#a15d3d]"}>{change >= 0 ? "▲" : "▼"} {Math.abs(change)}%</span> : null}</span>
    </div>
  </section>;
}

/** Horizontal bars with direct labels. */
export function BarList({ rows, format = "money", empty }: { rows: { label: string; value: number; note?: string }[]; format?: "money" | "units"; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const show = (value: number) => format === "money" ? kes(value) : `${value.toLocaleString("en-KE")} ${value === 1 ? "unit" : "units"}`;
  if (!rows.length) return <p className="px-4 py-8 text-center text-sm text-[#6b6b6b]">{empty}</p>;
  return <div>
    <ul className="space-y-3 px-4 py-4">
      {rows.map((row) => <li key={row.label} title={`${row.label}: ${show(row.value)}${row.note ? ` · ${row.note}` : ""}`}>
        <div className="flex items-baseline justify-between gap-3 text-xs"><span className="truncate font-medium text-[#2d2d2d]">{row.label}</span><span className="shrink-0 tabular-nums text-[#111111]"><strong>{show(row.value)}</strong>{row.note ? <span className="ml-1.5 text-[#8a8a8a]">{row.note}</span> : null}</span></div>
        <div className="mt-1.5 h-2 rounded-full bg-[#f2f2f2]"><div className="h-2 rounded-full" style={{ width: `${row.value ? Math.max(2, (row.value / max) * 100) : 0}%`, background: SERIES[0] }}/></div>
      </li>)}
    </ul>
    <TableView caption="Breakdown" headers={["Item", format === "money" ? "Value" : "Units"]} rows={rows.map((row) => [row.label, show(row.value)])}/>
  </div>;
}

/** Share of a whole, one stacked bar with a labelled legend (2px gaps between segments). */
export function ShareBar({ segments, empty }: { segments: { label: string; value: number }[]; empty: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return <p className="px-4 py-8 text-center text-sm text-[#6b6b6b]">{empty}</p>;
  return <div>
    <div className="px-4 pt-4">
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={segments.map((segment) => `${segment.label} ${kes(segment.value)}`).join(", ")}>
        {segments.map((segment, index) => segment.value ? <div key={segment.label} title={`${segment.label}: ${kes(segment.value)}`} style={{ width: `${(segment.value / total) * 100}%`, background: SERIES[index % SERIES.length] }}/> : null)}
      </div>
      <ul className="mt-3 grid gap-2 pb-4 sm:grid-cols-3">
        {segments.map((segment, index) => <li key={segment.label} className="flex items-start gap-2 text-xs">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[index % SERIES.length] }}/>
          <span><span className="block text-[#6b6b6b]">{segment.label}</span><strong className="tabular-nums text-[#111111]">{kes(segment.value)}</strong><span className="ml-1 text-[#8a8a8a]">{Math.round((segment.value / total) * 100)}%</span></span>
        </li>)}
      </ul>
    </div>
    <TableView caption="Payments by method" headers={["Method", "Amount", "Share"]} rows={segments.map((segment) => [segment.label, kes(segment.value), `${Math.round((segment.value / total) * 100)}%`])}/>
  </div>;
}

const statusIcon = { good: CheckCircle2, warning: Clock3, serious: AlertTriangle, critical: AlertOctagon };

/** Lipa account health: count and balance per state, status colour always paired with icon and label. */
export function StatusBreakdown({ buckets }: { buckets: { key: keyof typeof STATUS; label: string; count: number; amount: number }[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.amount));
  return <div>
    <ul className="divide-y divide-[#f2f2f2] px-4">
      {buckets.map((bucket) => {
        const Icon = statusIcon[bucket.key];
        return <li key={bucket.key} className="py-3" title={`${bucket.label}: ${bucket.count} accounts, ${kes(bucket.amount)}`}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 font-medium text-[#2d2d2d]"><Icon className="h-4 w-4" style={{ color: STATUS[bucket.key] }} aria-hidden/>{bucket.label}</span>
            <span className="tabular-nums text-[#111111]"><strong>{kes(bucket.amount)}</strong><span className="ml-1.5 text-[#8a8a8a]">{bucket.count} {bucket.count === 1 ? "account" : "accounts"}</span></span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-[#f2f2f2]"><div className="h-2 rounded-full" style={{ width: `${bucket.amount ? Math.max(2, (bucket.amount / max) * 100) : 0}%`, background: STATUS[bucket.key] }}/></div>
        </li>;
      })}
    </ul>
    <TableView caption="Lipa accounts by state" headers={["State", "Accounts", "Owed"]} rows={buckets.map((bucket) => [bucket.label, bucket.count, kes(bucket.amount)])}/>
  </div>;
}

/** Progress toward each active sales goal. */
export function GoalBars({ goals }: { goals: { label: string; goal: number; achieved: number }[] }) {
  return <ul className="space-y-3 px-4 py-4">
    {goals.map((goal) => {
      const percent = goal.goal ? Math.round((goal.achieved / goal.goal) * 100) : 0;
      return <li key={goal.label}>
        <div className="flex items-baseline justify-between gap-3 text-xs"><span className="font-medium text-[#2d2d2d]">{goal.label}</span><span className="tabular-nums"><strong>{kes(goal.achieved)}</strong><span className="text-[#8a8a8a]"> of {kes(goal.goal)} · {percent}%</span></span></div>
        <div className="mt-1.5 h-2 rounded-full bg-[#f2f2f2]"><div className="h-2 rounded-full" style={{ width: `${Math.min(100, percent)}%`, background: percent >= 100 ? STATUS.good : SERIES[0] }}/></div>
      </li>;
    })}
  </ul>;
}
