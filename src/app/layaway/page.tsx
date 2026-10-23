"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
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
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Legacy account close-out</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Existing layaway commitments</h2></div>
          <p className="text-sm text-[#66736a]">New layaway orders are disabled</p>
        </div>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8e1d1] bg-[#fffdf8] px-4 py-3.5"><p className="max-w-2xl text-xs leading-5 text-[#766b54]">This legacy workflow is retired. Finish any existing customer balances here; use Lipa Mdogo Mdogo for all new installment purchases.</p><Link href="/credit" className="shrink-0 rounded-lg bg-[#1a1a1a] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1a1a1a]">Open Lipa accounts</Link></section>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="grid border-y border-[#e5e5e5] bg-white sm:grid-cols-3">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Paying</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : activeCount}</p></div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Ready for pickup</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : readyCount}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[#69746c]">Remaining on open plans</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : money(openBalance)}</p></div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <section className="min-w-0 border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Layaway orders</h3><div className="flex border border-[#c4c4c4] text-xs"><button type="button" aria-pressed={filter === "OPEN"} onClick={() => setFilter("OPEN")} className={`px-3 py-1.5 ${filter === "OPEN" ? "bg-[#111111] text-white" : "bg-white"}`}>Open</button><button type="button" aria-pressed={filter === "ALL"} onClick={() => setFilter("ALL")} className={`px-3 py-1.5 ${filter === "ALL" ? "bg-[#111111] text-white" : "bg-white"}`}>All</button></div></div>
            {loading ? <p className="p-5 text-sm text-[#69746c]">Loading layaway orders…</p> : visibleOrders.length ? <div className="divide-y divide-[#e8ebe8]">{visibleOrders.map((order) => <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-l-2 px-4 py-3.5 text-left transition-colors hover:bg-[#f5f5f5] ${selected?.id === order.id ? "border-[#2d2d2d] bg-[#f5f5f5]" : "border-transparent"}`}><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[#1a1a1a]">{order.customer.name} · {order.productName}</span><span className="mt-1 block truncate text-[10px] text-[#89968d]">{order.quantity} unit{order.quantity === 1 ? "" : "s"} · {order.productSku} · {order.branch.name}</span><span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-[#4a4a4a] ring-1 ring-[#e5e5e5]">{statusLabel[order.status]} · {order.payments.length} payment{order.payments.length === 1 ? "" : "s"}</span><span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#e5e5e5]"><span className="block h-full rounded-full bg-gradient-to-r from-[#4a4a4a] to-[#a3a3a3]" style={{ width: `${Math.min(100, order.totalAmount ? (order.amountPaid / order.totalAmount) * 100 : 0)}%` }}/></span></span><span className="text-right"><span className="block text-sm font-bold tabular-nums text-[#1a1a1a]">{money(order.balance)}</span><span className="mt-1 block text-[10px] text-[#89968d]">remaining</span></span></button>)}</div> : <p className="p-6 text-sm text-[#69746c]">{filter === "OPEN" && orders.length ? "No open layaway orders." : "No layaway orders yet."}</p>}
          </section>

          <section className="min-w-0 border border-[#e5e5e5] bg-white">
            {selected ? <>
              <div className="border-b border-[#e8ebe8] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4a4a4a]">{selected.branch.name} · {new Date(selected.createdAt).toLocaleDateString("en-KE")}</p><h3 className="mt-1 text-lg font-semibold">{selected.customer.name}</h3><p className="mt-1 text-sm text-[#69746c]">{selected.customer.phone}</p></div><span className={`border px-2 py-1 text-xs font-semibold ${selected.status === "FULFILLED" ? "border-[#c4c4c4] text-[#69746c]" : selected.status === "READY_FOR_PICKUP" ? "border-[#a3a3a3] bg-[#f5f5f5] text-[#1a1a1a]" : "border-[#c4c4c4] text-[#526057]"}`}>{statusLabel[selected.status]}</span></div><p className="mt-4 text-sm font-medium">{selected.quantity} × {selected.productName}</p><p className="mt-1 text-xs text-[#69746c]">{selected.productSku} · price locked at {money(selected.unitPrice)} each</p><div className="mt-4 grid grid-cols-3 border-y border-[#e8ebe8] py-3 text-sm"><div><p className="text-xs text-[#69746c]">Total</p><p className="mt-1 font-semibold">{money(selected.totalAmount)}</p></div><div><p className="text-xs text-[#69746c]">Paid</p><p className="mt-1 font-semibold">{money(selected.amountPaid)}</p></div><div><p className="text-xs text-[#69746c]">Balance</p><p className="mt-1 font-semibold">{money(selected.balance)}</p></div></div>{selected.sale ? <p className="mt-3 text-xs text-[#1a1a1a]">Collected · receipt {selected.sale.invoiceNumber}</p> : null}</div>
              {selected.status === "ACTIVE" ? <form onSubmit={recordInstallment} className="border-b border-[#e8ebe8] p-4"><h4 className="text-sm font-semibold">Record installment</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-[#526057]">Amount received (KES)<input name="amount" type="number" min="1" max={selected.balance} step="1" required className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm" /></label><label className="text-xs font-medium text-[#526057]">Method<select name="method" className="mt-1 w-full border border-[#c4c4c4] bg-white px-3 py-2.5 text-sm"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select></label><label className="text-xs font-medium text-[#526057] sm:col-span-2">Payment reference <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm" /></label></div><div className="mt-3 flex justify-end"><button disabled={saving} className="bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-[#aab5ac]">{saving ? "Recording…" : "Record installment"}</button></div></form> : null}
              {selected.status === "READY_FOR_PICKUP" ? <div className="border-b border-[#e8ebe8] p-4"><p className="text-sm text-[#1a1a1a]">Paid in full. Confirm the customer has received the reserved item to complete the sale and release the stock.</p><button type="button" disabled={saving} onClick={() => void fulfillOrder()} className="mt-3 bg-[#111111] px-4 py-2.5 text-sm font-semibold text-white disabled:bg-[#aab5ac]">{saving ? "Completing…" : "Confirm customer collected item"}</button></div> : null}
              <div className="p-4"><h4 className="text-sm font-semibold">Payment history</h4>{selected.payments.length ? <div className="mt-2 divide-y divide-[#e5e5e5]">{selected.payments.map((payment, index) => { const balanceAfterPayment = selected.totalAmount - selected.payments.slice(0, index + 1).reduce((sum, item) => sum + item.amount, 0); return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-xs text-[#69746c]">{new Date(payment.createdAt).toLocaleString("en-KE")} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span><span className="flex items-center gap-3"><strong className="text-xs">{money(payment.amount)}</strong><button type="button" title="Download installment receipt PDF" aria-label={`Download receipt for ${money(payment.amount)} installment`} onClick={() => downloadLayawayPaymentReceipt(selected, payment, Math.max(0, balanceAfterPayment))} className="grid h-8 w-8 place-items-center border border-[#c4c4c4] text-[#1a1a1a] hover:bg-[#f5f5f5]"><Download className="h-4 w-4" /></button></span></div>; })}</div> : <p className="mt-2 text-sm text-[#69746c]">No payments recorded.</p>}</div>
            </> : <div className="grid min-h-64 place-items-center p-5 text-center"><div><p className="text-sm font-semibold">Select a layaway order</p><p className="mt-1 text-sm text-[#69746c]">Order and payment details will appear here.</p></div></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
