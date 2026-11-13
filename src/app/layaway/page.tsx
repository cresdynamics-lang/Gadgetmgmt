"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import Link from "next/link";
import { downloadLayawayPaymentReceipt } from "@/lib/receipt-pdf";

type LayawayStatus = "ACTIVE" | "READY_FOR_PICKUP" | "FULFILLED";
type Customer = { id: string; name: string; phone: string };
type Payment = { id: string; amount: number; method: string; reference: string | null; createdAt: string; receivedBy: { name: string } };
type Order = {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: LayawayStatus;
  createdAt: string;
  fulfilledAt: string | null;
  customer: Customer;
  branch: { name: string };
  payments: Payment[];
  sale: { invoiceNumber: string } | null;
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const statusLabel: Record<LayawayStatus, string> = {
  ACTIVE: "Paying",
  READY_FOR_PICKUP: "Ready for pickup",
  FULFILLED: "Collected",
};

export default function LayawayPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/layaway", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load layaway orders.");
    setOrders(data);
  }

  useEffect(() => {
    async function load() {
      try {
        await refresh();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load layaway orders.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const visibleOrders = filter === "OPEN" ? orders.filter((order) => order.status !== "FULFILLED") : orders;
  const selected = orders.find((order) => order.id === selectedId) ?? visibleOrders[0] ?? orders[0];
  const activeCount = orders.filter((order) => order.status === "ACTIVE").length;
  const readyCount = orders.filter((order) => order.status === "READY_FOR_PICKUP").length;
  const openBalance = orders.filter((order) => order.status !== "FULFILLED").reduce((sum, order) => sum + order.balance, 0);

  async function recordInstallment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/layaway/${selected.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(formData.get("amount")), method: formData.get("method"), reference: formData.get("reference") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Installment could not be recorded.");
      await refresh();
      form.reset();
      setNotice(data.status === "READY_FOR_PICKUP" ? "Balance cleared. This order is ready for pickup." : `Payment recorded. Remaining balance: ${money(data.balance)}.`);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Installment could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function fulfillOrder() {
    if (!selected || saving || !window.confirm(`Confirm that ${selected.customer.name} has collected ${selected.quantity} × ${selected.productName}?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/layaway/${selected.id}/fulfill`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Order could not be fulfilled.");
      await refresh();
      setNotice(`Customer handover recorded. Receipt ${data.invoiceNumber}.`);
    } catch (fulfillmentError) {
      setError(fulfillmentError instanceof Error ? fulfillmentError.message : "Order could not be fulfilled.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">Legacy account close-out</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Existing layaway commitments</h2></div>
          <p className="text-sm text-[var(--foreground)]">New layaway orders are disabled</p>
        </div>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8a5a12] bg-[var(--panel)] px-4 py-3.5"><p className="max-w-2xl text-xs leading-5 text-[var(--warning-text)]">This legacy workflow is retired. Finish any existing customer balances here; use Lipa Mdogo Mdogo for all new installment purchases.</p><Link href="/credit" className="shrink-0 rounded-lg bg-[#0a7d56] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#111111]">Open Lipa accounts</Link></section>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#0a7d56] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]">{notice}</p> : null}

        <div className="grid border-y border-[var(--border)] bg-[var(--panel)] sm:grid-cols-3">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[var(--foreground)]">Paying</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : activeCount}</p></div>
          <div className="border-b border-[var(--border)] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[var(--foreground)]">Ready for pickup</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : readyCount}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[var(--foreground)]">Remaining on open plans</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : money(openBalance)}</p></div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="min-w-0 border border-[var(--border)] bg-[var(--panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5"><h3 className="text-sm font-semibold">Layaway orders</h3><div className="flex border border-[var(--border)] text-xs"><button type="button" aria-pressed={filter === "OPEN"} onClick={() => setFilter("OPEN")} className={`px-3 py-1.5 ${filter === "OPEN" ? "bg-[#0a0a0a] text-white" : "bg-[var(--panel)]"}`}>Open</button><button type="button" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")} className={`px-3 py-1.5 ${filter === "ALL" ? "bg-[#0a0a0a] text-white" : "bg-[var(--panel)]"}`}>All</button></div></div>
            {loading ? <p className="p-5 text-sm text-[var(--foreground)]">Loading layaway orders…</p> : visibleOrders.length ? <div className="divide-y divide-[var(--border)]">{visibleOrders.map((order) => <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-l-2 px-4 py-3.5 text-left transition-colors hover:bg-[var(--background)] ${selected?.id === order.id ? "border-[#0a7d56] bg-[var(--accent-soft)]" : "border-transparent"}`}><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[var(--foreground)]">{order.customer.name} · {order.productName}</span><span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{order.quantity} unit{order.quantity === 1 ? "" : "s"} · {order.productSku} · {order.branch.name}</span><span className="mt-2 inline-flex rounded-full bg-[var(--panel)] px-2 py-0.5 text-[9px] font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)]">{statusLabel[order.status]} · {order.payments.length} payment{order.payments.length === 1 ? "" : "s"}</span><span className="mt-2 block h-1 overflow-hidden rounded-full bg-[var(--background)]"><span className="block h-full rounded-full bg-gradient-to-r from-[#0a7d56] to-[#0fa36e]" style={{ width: `${Math.min(100, order.totalAmount ? (order.amountPaid / order.totalAmount) * 100 : 0)}%` }}/></span></span><span className="text-right"><span className="block text-sm font-bold tabular-nums text-[var(--foreground)]">{money(order.balance)}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">remaining</span></span></button>)}</div> : <p className="p-6 text-sm text-[var(--foreground)]">{filter === "OPEN" && orders.length ? "No open layaway orders." : "No layaway orders yet."}</p>}
          </section>

          <section className="min-w-0 border border-[var(--border)] bg-[var(--panel)]">
            {selected ? <>
              <div className="border-b border-[var(--border)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--foreground)]">{selected.branch.name} · {new Date(selected.createdAt).toLocaleDateString("en-KE")}</p><h3 className="mt-1 text-lg font-semibold">{selected.customer.name}</h3><p className="mt-1 text-sm text-[var(--foreground)]">{selected.customer.phone}</p></div><span className={`border px-2 py-1 text-xs font-semibold ${selected.status === "FULFILLED" ? "border-[var(--border)] text-[var(--foreground)]" : selected.status === "READY_FOR_PICKUP" ? "border-[#0fa36e] bg-[var(--accent-soft)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--foreground)]"}`}>{statusLabel[selected.status]}</span></div><p className="mt-4 text-sm font-medium">{selected.quantity} × {selected.productName}</p><p className="mt-1 text-xs text-[var(--foreground)]">{selected.productSku} · price locked at {money(selected.unitPrice)} each</p><div className="mt-4 grid grid-cols-3 border-y border-[var(--border)] py-3 text-sm"><div><p className="text-xs text-[var(--foreground)]">Total</p><p className="mt-1 font-semibold">{money(selected.totalAmount)}</p></div><div><p className="text-xs text-[var(--foreground)]">Paid</p><p className="mt-1 font-semibold">{money(selected.amountPaid)}</p></div><div><p className="text-xs text-[var(--foreground)]">Balance</p><p className="mt-1 font-semibold">{money(selected.balance)}</p></div></div>{selected.sale ? <p className="mt-3 text-xs text-[var(--accent-text)]">Collected · receipt {selected.sale.invoiceNumber}</p> : null}</div>
              {selected.status === "ACTIVE" ? <form onSubmit={recordInstallment} className="border-b border-[var(--border)] p-4"><h4 className="text-sm font-semibold">Record installment</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-[var(--foreground)]">Amount received (KES)<input name="amount" type="number" min="1" max={selected.balance} step="1" required className="mt-1 w-full border border-[var(--border)] px-3 py-2.5 text-sm" /></label><label className="text-xs font-medium text-[var(--foreground)]">Method<select name="method" className="mt-1 w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select></label><label className="text-xs font-medium text-[var(--foreground)] sm:col-span-2">Payment reference <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className="mt-1 w-full border border-[var(--border)] px-3 py-2.5 text-sm" /></label></div><div className="mt-3 flex justify-end"><button disabled={saving} className="bg-[#0a0a0a] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-[#6b6b66]">{saving ? "Recording…" : "Record installment"}</button></div></form> : null}
              {selected.status === "READY_FOR_PICKUP" ? <div className="border-b border-[var(--border)] p-4"><p className="text-sm text-[var(--foreground)]">Paid in full. Confirm the customer has received the reserved item to complete the sale and release the stock.</p><button type="button" disabled={saving} onClick={() => void fulfillOrder()} className="mt-3 bg-[#0a0a0a] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-[#6b6b66]">{saving ? "Completing…" : "Confirm customer collected item"}</button></div> : null}
              <div className="p-4"><h4 className="text-sm font-semibold">Payment history</h4>{selected.payments.length ? <div className="mt-2 divide-y divide-[#f4f4f2]">{selected.payments.map((payment, index) => { const balanceAfterPayment = selected.totalAmount - selected.payments.slice(0, index + 1).reduce((sum, item) => sum + item.amount, 0); return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-xs text-[var(--foreground)]">{new Date(payment.createdAt).toLocaleString("en-KE")} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span><span className="flex items-center gap-3"><strong className="text-xs">{money(payment.amount)}</strong><button type="button" title="Download installment receipt PDF" aria-label={`Download receipt for ${money(payment.amount)} installment`} onClick={() => downloadLayawayPaymentReceipt(selected, payment, Math.max(0, balanceAfterPayment))} className="grid h-8 w-8 place-items-center border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)]"><Download className="h-4 w-4" /></button></span></div>; })}</div> : <p className="mt-2 text-sm text-[var(--foreground)]">No payments recorded.</p>}</div>
            </> : <div className="grid min-h-64 place-items-center p-5 text-center"><div><p className="text-sm font-semibold">Select a layaway order</p><p className="mt-1 text-sm text-[var(--foreground)]">Order and payment details will appear here.</p></div></div>}
          </section>
        </div>
      </div>
    </>
  );
}
