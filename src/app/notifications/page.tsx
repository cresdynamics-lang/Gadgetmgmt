"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Notification = { id: string; channel: "EMAIL" | "SMS"; status: "QUEUED" | "PROCESSING" | "SENT" | "FAILED" | "SKIPPED"; kind: string; recipient: string; subject: string | null; body: string; attempts: number; sentAt: string | null; lastError: string | null; createdAt: string; branchId: string };
type PaymentReview = { id: string; amount: number; mpesaReceipt: string | null; createdAt: string; creditPlan: { customer: { name: string }; product: { name: string }; branch: { name: string } } | null; sale: { invoiceNumber: string; branch: { name: string }; customer: { name: string } | null; saleItems: { product: { name: string } }[] } | null };
const date = (value: string) => new Date(value).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function NotificationsPage() {
  const [messages, setMessages] = useState<Notification[]>([]);
  const [counts, setCounts] = useState({ queued: 0, sent: 0, failed: 0 });
  const [paymentReviews, setPaymentReviews] = useState<PaymentReview[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reconciling, setReconciling] = useState("");

  async function refresh() {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load notification history.");
    setMessages(result.messages);
    setPaymentReviews(result.paymentReviews);
    setCounts(result.counts);
  }

  async function reconcile(requestId: string) {
    setReconciling(requestId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/payment-requests/${requestId}/reconcile`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be reconciled.");
      await refresh();
      setNotice("The verified payment and sale have been reconciled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be reconciled.");
    } finally { setReconciling(""); }
  }

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load notification history."));
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return <AppShell><div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Customer communication</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Messages & alerts</h2></div><button type="button" onClick={() => void refresh().catch((cause) => setError(cause.message))} className="border border-[#d6ddd6] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#35513c] hover:bg-[#f5f8f5]">Refresh status</button></div>
    {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}
    <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-3"><div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Queued / sending</p><p className="mt-1 text-xl font-semibold tabular-nums">{counts.queued}</p></div><div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Sent</p><p className="mt-1 text-xl font-semibold tabular-nums">{counts.sent}</p></div><div className="px-4 py-4"><p className="text-xs text-[#69746c]">Needs attention</p><p className="mt-1 text-xl font-semibold tabular-nums">{counts.failed + paymentReviews.length}</p></div></div>
    {paymentReviews.length ? <section className="overflow-hidden rounded-xl border border-[#e8cfc4] bg-[#fffefa]"><div className="border-b border-[#f0dfd8] bg-[#fff7f3] px-4 py-3.5"><h3 className="text-sm font-semibold text-[#784c40]">M-Pesa payments needing reconciliation</h3><p className="mt-1 text-xs text-[#8b6a60]">Safaricom confirmed these payments, but the account needs a staff review before it can be finalized. Verify each receipt against the statement.</p></div><div className="divide-y divide-[#f0e6e1]">{paymentReviews.map((item) => { const label = item.creditPlan ? `${item.creditPlan.customer.name} · ${item.creditPlan.product.name}` : item.sale ? `${item.sale.customer?.name ?? "Walk-in sale"} · ${item.sale.saleItems.map((line) => line.product.name).join(", ")}` : item.id; return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><p className="text-sm font-semibold text-[#4a3a35]">{label}</p><p className="mt-1 text-xs text-[#796d67]">{item.creditPlan?.branch.name ?? item.sale?.branch.name} · {money(item.amount)} · Receipt {item.mpesaReceipt ?? "missing"} · {date(item.createdAt)}</p></div><button type="button" disabled={reconciling === item.id} onClick={() => void reconcile(item.id)} className="rounded-lg border border-[#dec9bf] bg-white px-3 py-2 text-xs font-semibold text-[#784c40] hover:bg-[#fff7f3] disabled:opacity-50">{reconciling === item.id ? "Checking…" : "Reconcile verified payment"}</button></div>; })}</div></section> : null}
    <section className="overflow-hidden border border-[#dfe4df] bg-white"><div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold text-[#344438]">Recent delivery activity</h3><p className="mt-1 text-xs text-[#7c8176]">Scheduled reminders and daily owner reports. Failed messages retry automatically up to five times.</p></div><div className="divide-y divide-[#edf0ed]">{messages.map((message) => <article key={message.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${message.status === "SENT" ? "bg-[#eaf6ed] text-[#367d50]" : message.status === "FAILED" ? "bg-[#fff0ed] text-[#a54f40]" : "bg-[#f5eddd] text-[#876b3e]"}`}>{message.status}</span><span className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#78847a]">{message.channel} · {message.kind.replaceAll("_", " ")}</span><span className="truncate text-[10px] text-[#919990]">{message.recipient}</span></div>{message.subject ? <p className="mt-2 text-xs font-semibold text-[#39483a]">{message.subject}</p> : null}<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#69746c]">{message.body}</p>{message.lastError ? <p className="mt-2 text-[10px] text-[#a54f40]">{message.lastError}</p> : null}</div><div className="text-[10px] text-[#92988f] sm:text-right"><p>{date(message.createdAt)}</p>{message.sentAt ? <p className="mt-1">Delivered {date(message.sentAt)}</p> : <p className="mt-1">Attempt {message.attempts} of 5</p>}</div></article>)}{!messages.length ? <div className="px-4 py-12 text-center"><p className="text-sm font-semibold text-[#354638]">No messages yet</p><p className="mt-1 text-xs text-[#7c8176]">Opted-in customer reminders and daily reports will appear here after the scheduled job runs.</p></div> : null}</div></section>
  </div></AppShell>;
}
