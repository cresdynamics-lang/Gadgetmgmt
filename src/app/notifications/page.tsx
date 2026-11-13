"use client";

import { notificationResponse } from "@/lib/notification-response";
import { useSession } from "next-auth/react";
import { canUseCapability, sessionGrants } from "@/lib/access";
import { useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowUpRight, Check, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, Smartphone, Wallet } from "lucide-react";
import { StaffInbox } from "./staff-inbox";
type Notification = { id: string; channel: "EMAIL" | "SMS" | "WHATSAPP"; status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED"; kind: string; recipient: string; subject: string | null; body: string; attempts: number; sentAt: string | null; lastError: string | null; createdAt: string; branchId: string };
type PaymentReview = { id: string; amount: number; receivedAmount: number | null; mpesaReceipt: string | null; createdAt: string; creditPlan: { customer: { name: string }; product: { name: string }; branch: { name: string } } | null; sale: { invoiceNumber: string; branch: { name: string }; customer: { name: string } | null; saleItems: { product: { name: string } }[] } | null };
type JobRun = { id: string; status: "RUNNING" | "SUCCEEDED" | "FAILED"; startedAt: string; finishedAt: string | null; errorMessage: string | null; updatedPlans?: number; queuedReminders?: number; queuedDigests?: number; sentCount?: number; failedCount?: number };
type Automation = { schedule: string; cronSecretConfigured: boolean; publicHttpsUrl: boolean; providers: { email: boolean; sms: boolean; whatsapp: boolean; mpesaStk: boolean; mpesaC2b: boolean } } | null;

const date = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function NotificationsPage() {
  const { data: session } = useSession();
  const canManage = canUseCapability(session?.user.role ?? "", "notifications", sessionGrants(session?.user.role ?? "", session?.user.pages, session?.user.capabilities));
  const [messages, setMessages] = useState<Notification[]>([]);
  const [counts, setCounts] = useState({ queued: 0, sent: 0, failed: 0 });
  const [paymentReviews, setPaymentReviews] = useState<PaymentReview[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [automation, setAutomation] = useState<Automation>(null);
  const [runIsFresh, setRunIsFresh] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reconciling, setReconciling] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const result = await notificationResponse<{ messages: Notification[]; paymentReviews: PaymentReview[]; counts: { queued: number; sent: number; failed: number }; jobRuns?: JobRun[]; automation?: Automation; jobHealthFresh?: boolean }>(response);
      setMessages(result.messages);
      setPaymentReviews(result.paymentReviews);
      setCounts(result.counts);
      setJobRuns(result.jobRuns ?? []);
      setAutomation(result.automation ?? null);
      setRunIsFresh(Boolean(result.jobHealthFresh));
      setError("");
    } finally { setRefreshing(false); }
  }

  async function reconcile(requestId: string, existingReceipt: string | null) {
    setReconciling(requestId); setError(""); setNotice("");
    try {
      const receipt = existingReceipt ?? window.prompt("Enter the exact M-Pesa receipt from the statement for this payment.")?.trim().toUpperCase();
      if (!receipt || !/^[A-Z0-9]{6,20}$/.test(receipt)) throw new Error("Enter a valid M-Pesa receipt from the statement.");
      if (!window.confirm(`Confirm the receipt and KES payment against the M-Pesa statement? Receipt: ${receipt}`)) return;
      const response = await fetch(`/api/payment-requests/${requestId}/reconcile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified: true, receipt }) });
      await notificationResponse<{ ok: boolean }>(response);
      await refresh(); setNotice("The verified payment and sale have been reconciled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payment could not be reconciled."); }
    finally { setReconciling(""); }
  }

  useEffect(() => {
    if (!canManage) return;
    const initial = window.setTimeout(() => void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load notification history.")), 0);
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [canManage]);

  const latestRun = jobRuns[0];
  const setupItems = automation ? [
    ["Collections secret", automation.cronSecretConfigured], ["Public HTTPS URL", automation.publicHttpsUrl], ["Email delivery", automation.providers.email], ["SMS delivery", automation.providers.sms], ["WhatsApp templates", automation.providers.whatsapp], ["M-Pesa STK", automation.providers.mpesaStk], ["M-Pesa C2B", automation.providers.mpesaC2b],
  ] : [];
  const statCards: { label: string; value: number; Icon: typeof Clock3; color: string; tint: string }[] = [
    { label: "In the queue", value: counts.queued, Icon: Clock3, color: "#8a5a12", tint: "#fdf3df" },
    { label: "Successfully delivered", value: counts.sent, Icon: CheckCircle2, color: "#0a7d56", tint: "#e5f5ee" },
    { label: "Needs your attention", value: counts.failed + paymentReviews.length, Icon: AlertCircle, color: "#b3261e", tint: "#fdeceb" },
  ];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[0_4px_18px_rgb(0_0_0/.035)] sm:px-7">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--foreground)]">Messages &amp; notifications</p><h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Messages &amp; alerts</h2><p className="mt-1.5 max-w-xl text-sm text-[var(--foreground)]">Read in-app alerts, send messages, and manage email and device notifications.</p></div>
      <button type="button" onClick={() => { window.dispatchEvent(new Event("notifications-refresh")); if (canManage) void refresh().catch((cause) => setError(cause.message)); }} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[#6b6b66] hover:bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing" : "Refresh status"}</button>
    </div>
    {error ? <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#b3261e] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--danger-text)]"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p> : null}
    {notice ? <p role="status" className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-text)]"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</p> : null}

    <StaffInbox />

    {canManage ? <>
    <div className="grid gap-3 sm:grid-cols-3">
      {statCards.map(({ label, value, Icon, color, tint }) => <article key={label} className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-[0_3px_12px_rgb(0_0_0/.025)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgb(0_0_0/.07)]"><div className="flex items-center justify-between"><p className="text-xs font-medium text-[var(--foreground)]">{label}</p><span className="grid h-9 w-9 place-items-center rounded-xl" style={{ color, backgroundColor: tint }}><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)] tabular-nums">{value}</p><div className="absolute inset-x-0 bottom-0 h-[2px] opacity-70" style={{ backgroundColor: color }} /></article>)}
    </div>

    <section className="overflow-hidden rounded-2xl border border-[#0a7d56] bg-[#0a0a0a] text-white shadow-[0_14px_38px_rgb(0_0_0/.15)]" aria-labelledby="automation-health-heading">
      <div className="relative overflow-hidden px-5 py-5 sm:px-7 sm:py-6"><div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10 bg-[#6b6b66]/10 blur-2xl" /><div className="relative flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-[var(--muted)]"><Activity className="h-4 w-4" /></span><h3 id="automation-health-heading" className="text-base font-semibold tracking-tight">Automation health</h3><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${runIsFresh ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "bg-[#b7791f] text-[#b7791f]"}`}>{runIsFresh ? "On schedule" : "Check setup"}</span></div><p className="mt-3 max-w-2xl text-sm leading-6 text-[#e6e6e2]">Payment reminders, overdue follow-ups and owner summaries are monitored here.</p></div>{automation ? <div className="rounded-xl border border-white/15 bg-white/[.07] px-3.5 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Run schedule</p><p className="mt-1 text-xs font-semibold text-white">Daily <span className="px-1 text-[var(--muted)]">·</span>{automation.schedule}</p></div> : null}</div>
        <div className="relative mt-5 grid gap-3 md:grid-cols-[1.2fr_.8fr]"><div className="rounded-xl border border-white/10 bg-white/[.07] p-4"><div className="flex items-center gap-2 text-[var(--muted)]"><Clock3 className="h-3.5 w-3.5" /><p className="text-[9px] font-bold uppercase tracking-[.14em]">Last collections run</p></div><p className="mt-2 text-sm font-semibold text-white">{latestRun?.finishedAt ? date(latestRun.finishedAt) : latestRun?.status === "RUNNING" ? "Currently running" : "No run recorded yet"}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{latestRun ? `${latestRun.status.toLowerCase()} · started ${date(latestRun.startedAt)}` : "Scheduled for 07:30 East Africa Time"}</p>{latestRun?.errorMessage ? <p className="mt-2 text-[10px] text-[var(--danger-text)]">{latestRun.errorMessage}</p> : null}</div>
          {latestRun && latestRun.updatedPlans !== undefined ? <div className="grid grid-cols-2 gap-2">{[["Accounts updated", latestRun.updatedPlans], ["Reminders queued", latestRun.queuedReminders], ["Messages delivered", latestRun.sentCount], ["Delivery failures", latestRun.failedCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[.07] px-3 py-2.5"><p className="text-[9px] text-[var(--muted)]">{String(label)}</p><p className="mt-1 text-lg font-semibold tabular-nums text-white">{Number(value ?? 0)}</p></div>)}</div> : <div className="flex items-center gap-3 rounded-xl border border-[#b7791f]/30 bg-[#8a5a12]/15 p-4"><AlertCircle className="h-4 w-4 shrink-0 text-[#b7791f]" /><p className="text-xs leading-5 text-[#b7791f]">{latestRun?.status === "FAILED" ? "The last run failed. Review server logs and configuration." : "No successful scheduled run has been recorded yet. A fresh run will appear here when the job completes."}</p></div>}
        </div></div>
      {automation ? <div className="border-t border-white/10 bg-black/10 px-5 py-4 sm:px-7"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-[9px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">Provider and deployment setup</h4><p className="text-[9px] text-[var(--muted)]">Configuration presence only; secret values are never shown.</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{setupItems.map(([name, ready]) => <div key={String(name)} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[.045] px-3 py-2"><span className="text-[10px] text-[#e6e6e2]">{String(name)}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${ready ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "bg-white/10 text-[var(--muted)]"}`}>{ready ? <Check className="h-2.5 w-2.5" /> : null}{ready ? "Ready" : "Missing"}</span></div>)}</div></div> : null}
    </section>

    {paymentReviews.length ? <section className="overflow-hidden rounded-2xl border border-[#8a5a12] bg-[var(--panel)] shadow-[0_6px_20px_rgb(0_0_0/.04)]"><div className="flex items-start gap-3 border-b border-[var(--border)] bg-[var(--warning-soft)] px-5 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--warning-soft)] text-[var(--warning-text)]"><Wallet className="h-4 w-4" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[var(--warning-text)]">Payments to reconcile</h3><span className="rounded-full bg-[var(--panel)] px-2 py-0.5 text-[9px] font-bold text-[var(--warning-text)] ring-1 ring-[#8a5a12]">{paymentReviews.length} pending</span></div><p className="mt-1 text-xs leading-5 text-[var(--warning-text)]">Match each receipt and amount against the M-Pesa statement before applying payment.</p></div></div><div className="divide-y divide-[var(--border)]">{paymentReviews.map((item) => { const label = item.creditPlan ? `${item.creditPlan.customer.name} · ${item.creditPlan.product.name}` : item.sale ? `${item.sale.customer?.name ?? "Walk-in sale"} · ${item.sale.saleItems.map((line) => line.product.name).join(", ")}` : item.id; return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--warning-text)]">{label}</p><p className="mt-1 text-[11px] text-[var(--warning-text)]">{item.creditPlan?.branch.name ?? item.sale?.branch.name} · {money(item.amount)}{item.receivedAmount !== null ? ` · Received ${money(item.receivedAmount)}` : ""} · Receipt {item.mpesaReceipt ?? "not received"}</p><p className="mt-1 text-[10px] text-[var(--warning-text)]">{date(item.createdAt)}</p></div><button type="button" disabled={reconciling === item.id} onClick={() => void reconcile(item.id, item.mpesaReceipt)} className="inline-flex items-center gap-2 rounded-xl border border-[#8a5a12] bg-[var(--panel)] px-3.5 py-2.5 text-xs font-semibold text-[var(--warning-text)] transition hover:bg-[var(--warning-soft)] disabled:opacity-50">{reconciling === item.id ? "Verifying…" : "Verify & reconcile"}<ArrowUpRight className="h-3.5 w-3.5" /></button></div>; })}</div></section> : null}

    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_4px_18px_rgb(0_0_0/.03)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">Recent delivery activity</h3><p className="mt-1 text-xs text-[var(--muted)]">Scheduled reminders and owner reports. Failed messages retry automatically up to five times.</p></div><span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[9px] font-semibold text-[var(--foreground)]">Auto-refreshes every 30 sec</span></div>
      <div className="divide-y divide-[#f4f4f2]">{messages.map((message) => { const ChannelIcon = message.channel === "EMAIL" ? Mail : message.channel === "WHATSAPP" ? MessageCircle : Smartphone; const sent = message.status === "SENT"; const failed = message.status === "FAILED"; return <article key={message.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-[var(--panel)] sm:grid-cols-[minmax(0,1fr)_150px]"><div className="flex min-w-0 gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${message.channel === "WHATSAPP" ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : message.channel === "EMAIL" ? "bg-[var(--background)] text-[var(--foreground)]" : "bg-[var(--background)] text-[var(--warning-text)]"}`}><ChannelIcon className="h-4 w-4" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${sent ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : failed ? "bg-[var(--danger-soft)] text-[var(--danger-text)]" : "bg-[var(--warning-soft)] text-[var(--warning-text)]"}`}>{message.status}</span><span className="text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--muted)]">{message.channel} · {message.kind.replaceAll("_", " ")}</span><span className="truncate text-[10px] text-[var(--muted)]">{message.recipient}</span></div>{message.subject ? <p className="mt-2 text-xs font-semibold text-[var(--foreground)]">{message.subject}</p> : null}<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--foreground)]">{message.body}</p>{message.lastError ? <p className="mt-2 rounded-lg bg-[var(--danger-soft)] px-2.5 py-2 text-[10px] text-[var(--danger-text)]">{message.lastError}</p> : null}</div></div><div className="pl-12 text-[10px] text-[var(--muted)] sm:pl-0 sm:text-right"><p>{date(message.createdAt)}</p><p className="mt-1">{message.sentAt ? `Delivered ${date(message.sentAt)}` : `Attempt ${message.attempts} of 5`}</p></div></article>; })}{!messages.length ? <div className="px-5 py-14 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[var(--background)] text-[var(--foreground)]"><MessageCircle className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-[var(--foreground)]">No messages yet</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--muted)]">Opted-in customer reminders and daily reports will appear here after the scheduled job runs.</p></div> : null}</div>
    </section>
    </> : null}
  </div>;
}
