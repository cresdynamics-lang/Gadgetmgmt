"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { roleNames } from "@/lib/access";

type Range = "day" | "week" | "month";
type Performance = {
  member: { name: string; email: string; role: string; status: string; branch: { name: string } | null };
  range: string;
  sales: number;
  units: number;
  revenue: number;
  receipts: number;
  profit: number | null;
  goals: { id: string; period: string; label: string | null; amount: number; achieved: number; percent: number; unitsTarget: number | null }[];
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const ranges: { id: Range; label: string }[] = [{ id: "day", label: "Today" }, { id: "week", label: "This week" }, { id: "month", label: "This month" }];

export default function StaffPerformancePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#69746c]">Loading the team member…</div>}>
      <StaffPerformance />
    </Suspense>
  );
}

function StaffPerformance() {
  const [memberId, setMemberId] = useState("");
  const [range, setRange] = useState<Range>("day");
  const [data, setData] = useState<Performance | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.location.pathname.split("/").filter(Boolean).pop() || "";
    setMemberId(id);
  }, []);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/staff/${memberId}/performance?range=${range}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Performance could not be loaded.");
      setData(body);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Performance could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [memberId, range]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div className="space-y-5">
        <Link href="/staff" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4a4a4a]"><ArrowLeft className="h-3.5 w-3.5" />Staff</Link>
        <div className="border-b border-[#e2e6e2] pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Team</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{data?.member.name ?? "Team member"}</h2>
          <p className="mt-1 text-sm text-[#69746c]">{data ? `${roleNames[data.member.role] ?? data.member.role} · ${data.member.branch?.name ?? "No branch"} · ${data.member.email}` : "Loading their record…"}</p>
        </div>
        <div className="flex gap-2">
          {ranges.map((option) => (
            <button key={option.id} type="button" aria-pressed={range === option.id} onClick={() => setRange(option.id)} className={`min-h-10 rounded-full border px-4 text-xs font-semibold ${range === option.id ? "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#2d2d2d]"}`}>{option.label}</button>
          ))}
        </div>
        {error ? <p role="alert" className="rounded-xl border border-[#f0d4cc] bg-[#fff6f3] px-4 py-3 text-sm text-[#9b4a3d]">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Sales", loading || !data ? "—" : String(data.sales)],
            ["Products sold", loading || !data ? "—" : String(data.units)],
            ["Value sold", loading || !data ? "—" : money(data.revenue)],
            ["Profit", loading || !data ? "—" : data.profit === null ? "Hidden" : money(data.profit)],
          ].map(([label, value]) => (
            <section key={label} className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#6b6b6b]">{label}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-[11px] text-[#69746c]">{data?.range ?? ""}</p>
            </section>
          ))}
        </div>
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h3 className="text-sm font-semibold">Engagement</h3>
          <p className="mt-2 text-sm text-[#4a4a4a]">{loading || !data ? "Loading…" : `${data.receipts} stock ${data.receipts === 1 ? "receipt" : "receipts"} and ${data.sales} ${data.sales === 1 ? "sale" : "sales"} in ${data.range.toLowerCase()}.`}</p>
        </section>
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <h3 className="text-sm font-semibold">Goals set for this person</h3>
          {data?.goals.length ? <ul className="mt-3 space-y-3">{data.goals.map((goal) => (
            <li key={goal.id}>
              <p className="text-xs font-semibold text-[#111111]">{goal.label || goal.period} · {money(goal.achieved)} of {money(goal.amount)}</p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e5e5e5]"><div className={`h-full rounded-full ${goal.percent >= 100 ? "bg-[#2f7d4f]" : "bg-[#111111]"}`} style={{ width: `${Math.min(100, goal.percent)}%` }} /></div>
              <p className="mt-1 text-[11px] text-[#6b6b6b]">{goal.percent}% reached{goal.percent >= 100 ? " · achieved" : ""}</p>
            </li>
          ))}</ul> : <p className="mt-2 text-sm text-[#69746c]">{loading ? "Loading…" : "No personal goal yet. Set one from Sales reports and choose this team member."}</p>}
        </section>
      </div>
    </AppShell>
  );
}
