"use client";

import { Activity, Clock3, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { roleNames } from "@/lib/access";

type ActivityUser = { name: string; email: string; role: string } | null;
type ActivityRow = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  user: ActivityUser;
  sessionDuration: string | null;
};
type SessionRow = {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  duration: string;
  active: boolean;
  presence: "live" | "left" | "signed-out";
  eventCount: number;
  user: ActivityUser;
};

const actionLabels: Record<string, string> = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  SALE_CREATED: "Sale",
  TRADE_IN_ACCEPTED: "Trade-in",
  STOCK_RECEIVED: "Stock received",
  PRODUCT_CREATED: "Product added",
  CREDIT_PAYMENT: "Lipa payment",
  STAFF_CREATED: "Staff created",
  POLICY_UPDATED: "Policy updated",
  PERMISSIONS_UPDATED: "Permissions",
  APPROVAL_REQUESTED: "Approval asked",
  APPROVAL_GRANTED: "Approval used",
  SALES_GOAL_UPDATED: "Sales goal",
  TRADE_IN_STOCKED: "Trade-in stocked",
  MPESA_PROMPT_SENT: "M-Pesa prompt",
  PRICE_UPDATED: "Price updated",
  WEBSITE_VISIBILITY: "Website listing",
  AI_QUESTION: "AI assistant",
};

const presenceLabels: Record<SessionRow["presence"], string> = {
  live: "Live",
  left: "Left",
  "signed-out": "Signed out",
};

const moneyTime = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadActivity() {
      try {
        const response = await fetch("/api/activity", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Activity could not be loaded.");
        setEvents(data.events);
        setSessions(data.sessions);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Activity could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 15_000);
    const onLive = () => void loadActivity();
    window.addEventListener("gadgethub:live", onLive);
    return () => { window.clearInterval(timer); window.removeEventListener("gadgethub:live", onLive); };
  }, []);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(0,0,0,.035)] sm:px-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Super admin</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Activity</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-[#77837a]">Who signed in, what they did, when they left or signed out, and how long they stayed.</p>
        </div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e5e5e5] px-4 py-3.5">
            <LogIn className="h-4 w-4 text-[#2d2d2d]" />
            <div>
              <h3 className="text-sm font-semibold">Who logged in</h3>
              <p className="mt-0.5 text-[11px] text-[#819087]">Sign-in, last seen, signed out, or left by closing the app</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f5f5f5] text-[11px] uppercase tracking-[.08em] text-[#6b6b6b]">
                <tr>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Signed in</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="px-4 py-3 font-medium">How long</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e5e5]">
                {sessions.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{item.user?.name ?? "Unknown"}</p>
                      <p className="mt-0.5 text-[11px] text-[#819087]">{item.user?.email} · {roleNames[item.user?.role ?? ""] ?? item.user?.role}</p>
                    </td>
                    <td className="px-4 py-3 text-[#526057]">{moneyTime(item.startedAt)}</td>
                    <td className="px-4 py-3 text-[#526057]">{moneyTime(item.lastSeenAt)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                        <Clock3 className="h-3.5 w-3.5" />
                        {item.duration}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.presence === "live" ? "bg-[#111111] text-white" : item.presence === "left" ? "bg-[#fff2e8] text-[#8a4b2f]" : "bg-[#e5e5e5] text-[#2d2d2d]"}`}>
                        {presenceLabels[item.presence ?? (item.active ? "live" : "signed-out")]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[#526057]">{item.eventCount}</td>
                  </tr>
                ))}
                {!loading && !sessions.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No sign-ins recorded yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e5e5e5] px-4 py-3.5">
            <Activity className="h-4 w-4 text-[#2d2d2d]" />
            <div>
              <h3 className="text-sm font-semibold">What happened</h3>
              <p className="mt-0.5 text-[11px] text-[#819087]">Every recorded action, the person, and the time</p>
            </div>
          </div>
          <div className="divide-y divide-[#e5e5e5]">
            {events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em]">{actionLabels[event.action] ?? event.action}</span>
                    <p className="text-sm font-semibold text-[#111111]">{event.summary}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-[#819087]">
                    {event.user?.name ?? "System"} · {roleNames[event.user?.role ?? ""] ?? event.user?.role ?? "unassigned"}
                    {event.sessionDuration ? ` · session ${event.sessionDuration}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-[#69746c]">{moneyTime(event.createdAt)}</p>
              </div>
            ))}
            {loading ? <p className="px-4 py-8 text-center text-sm text-[#69746c]">Loading activity…</p> : null}
            {!loading && !events.length ? <p className="px-4 py-8 text-center text-sm text-[#69746c]">No activity recorded yet. Sign-ins and sales will appear here.</p> : null}
          </div>
        </section>
        <p className="flex items-center gap-1.5 text-[11px] text-[#8a958c]"><ShieldCheck className="h-3.5 w-3.5"/>Visible only to the super admin permission set.</p>
      </div>
    </AppShell>
  );
}
