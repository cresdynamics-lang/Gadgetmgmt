"use client";

import { AlertCircle, CheckCircle2, Download, FileText, Mail, MailX, Search, Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AppShell } from "@/components/app-shell";
import { kenyaDateTime } from "@/lib/kenya-time";
import { paymentLabel } from "@/lib/payment-labels";

type Invoice = {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  kind: "INVOICE" | "RECEIPT";
  status: string;
  paymentMethod: string;
  total: number;
  paid: number;
  balance: number;
  cashier: string;
  customer: { name: string; phone: string; email: string | null } | null;
  items: string;
  email: { recipient: string; status: string; at: string; error: string | null; sentCount: number } | null;
};

type Range = "today" | "week" | "month" | "all";

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const ranges: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All" },
];

function EmailState({ invoice }: { invoice: Invoice }) {
  const email = invoice.email;
  if (email?.status === "SENT") {
    return <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2f6b43]"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Emailed to {email.recipient}{email.sentCount > 1 ? ` · ${email.sentCount}×` : ""}</span></span>;
  }
  if (email?.status === "FAILED") {
    return <span title={email.error ?? undefined} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#a15d3d]"><AlertCircle className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Email to {email.recipient} failed</span></span>;
  }
  if (email) {
    return <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6b6b6b]"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Sending to {email.recipient}…</span></span>;
  }
  if (invoice.status === "PENDING") return <span className="text-[11px] text-[#6b6b6b]">Sent once payment clears</span>;
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8a8a8a]"><MailX className="h-3.5 w-3.5 shrink-0" />{invoice.customer?.email ? "Not emailed yet" : "No email on file"}</span>;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [range, setRange] = useState<Range>("month");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [emailing, setEmailing] = useState<{ id: string; email: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ ...(range === "all" ? {} : { range }), ...(search ? { q: search } : {}) });
      const response = await fetch(`/api/invoices?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Invoices could not be loaded.");
      setInvoices(data.invoices);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Invoices could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [range, search]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailing || sending) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/pos/${emailing.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailing.email.trim() ? { email: emailing.email.trim() } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The email could not be sent.");
      setNotice(`PDF emailed to ${data.recipient}.`);
      setEmailing(null);
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const emailed = invoices.filter((invoice) => invoice.email?.status === "SENT").length;
  const missing = invoices.filter((invoice) => invoice.status !== "PENDING" && invoice.email?.status !== "SENT").length;

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Sales</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Invoices & receipts</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#69746c]">Every sale’s GadgetHub PDF. It is emailed to the customer automatically when the sale is recorded; download or send it again from here.</p>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white text-center">
            <div className="px-4 py-2.5"><p className="text-[10px] uppercase tracking-[.1em] text-[#848b81]">Shown</p><p className="mt-0.5 text-lg font-semibold tabular-nums">{loading ? "—" : invoices.length}</p></div>
            <div className="border-x border-[#e5e5e5] px-4 py-2.5"><p className="text-[10px] uppercase tracking-[.1em] text-[#848b81]">Emailed</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-[#2f6b43]">{loading ? "—" : emailed}</p></div>
            <div className="px-4 py-2.5"><p className="text-[10px] uppercase tracking-[.1em] text-[#848b81]">Not emailed</p><p className="mt-0.5 text-lg font-semibold tabular-nums text-[#a15d3d]">{loading ? "—" : missing}</p></div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
            {ranges.map((option) => <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => setRange(option.value)} className={`px-3.5 py-2 text-xs font-semibold ${range === option.value ? "bg-[#111111] text-white" : "text-[#4a4a4a] hover:bg-[#f5f5f5]"}`}>{option.label}</button>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }} className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search invoices</span>
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice number, customer, phone or IMEI" className="w-full rounded-xl border border-[#c4c4c4] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#111111]" />
            </label>
            <button type="submit" className="rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white">Find</button>
          </form>
        </div>

        {error ? <p role="alert" className="rounded-xl border border-[#f0d4cc] bg-[#fff6f3] px-4 py-3 text-sm text-[#9b4a3d]">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-[#cfe3d5] bg-[#f1f8f3] px-4 py-3 text-sm text-[#2f6b43]">{notice}</p> : null}

        <div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
          {loading ? <p className="p-8 text-sm text-[#69746c]">Loading invoices…</p> : !invoices.length ? (
            <div className="grid min-h-48 place-items-center p-8 text-center"><div><FileText className="mx-auto h-6 w-6 text-[#9aa69d]" /><p className="mt-3 text-sm font-semibold">No sales in this view</p><p className="mt-1 text-xs text-[#848b81]">Try another period or search.</p></div></div>
          ) : (
            <ul className="divide-y divide-[#eeece4]">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${invoice.kind === "INVOICE" ? "bg-[#fff2e8] text-[#8a4b2f]" : "bg-[#f5f5f5] text-[#2d2d2d]"}`}>{invoice.kind === "INVOICE" ? "Invoice" : "Receipt"}</span>
                        <span className="font-mono text-xs font-semibold text-[#111111]">{invoice.invoiceNumber}</span>
                        <span className="text-[11px] text-[#848b81]">{kenyaDateTime(invoice.createdAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-[#1a1a1a]">{invoice.items || "Sale"}</p>
                      <p className="mt-0.5 text-xs text-[#69746c]">{invoice.customer ? `${invoice.customer.name} · ${invoice.customer.phone}` : "Walk-in customer"} · {paymentLabel(invoice.paymentMethod)} · by {invoice.cashier}</p>
                      <div className="mt-1.5 max-w-full"><EmailState invoice={invoice} /></div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{money(invoice.total)}</p>
                        {invoice.balance > 0 ? <p className="text-[11px] font-medium text-[#a15d3d]">{money(invoice.balance)} due</p> : <p className="text-[11px] text-[#848b81]">Paid in full</p>}
                      </div>
                      <div className="flex gap-1.5">
                        <a href={`/api/pos/${invoice.id}/receipt`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c4c4c4] bg-white px-3 text-[11px] font-semibold text-[#2d2d2d] hover:border-[#111111]"><Download className="h-3.5 w-3.5" />PDF</a>
                        {invoice.status !== "PENDING" ? <button type="button" onClick={() => setEmailing(emailing?.id === invoice.id ? null : { id: invoice.id, email: invoice.customer?.email ?? invoice.email?.recipient ?? "" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#111111] px-3 text-[11px] font-semibold text-white"><Send className="h-3.5 w-3.5" />{invoice.email?.status === "SENT" ? "Resend" : "Email"}</button> : null}
                      </div>
                    </div>
                  </div>
                  {emailing?.id === invoice.id ? (
                    <form onSubmit={sendEmail} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3">
                      <label className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Send the PDF to
                        <input type="email" required autoFocus value={emailing.email} onChange={(event) => setEmailing({ ...emailing, email: event.target.value })} placeholder="customer@example.com" className="mt-1 w-full rounded-lg border border-[#c4c4c4] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#111111]" />
                      </label>
                      <button type="submit" disabled={sending} className="min-h-9 rounded-lg bg-[#111111] px-4 text-xs font-semibold text-white disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
                      <button type="button" onClick={() => setEmailing(null)} className="min-h-9 rounded-lg border border-[#c4c4c4] px-3 text-xs font-semibold">Cancel</button>
                      {invoice.customer && !invoice.customer.email ? <p className="w-full text-[10px] text-[#879287]">This address is also saved on {invoice.customer.name}’s account.</p> : null}
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
