"use client";

import { AppShell } from "@/components/app-shell";
import { useEffect, useState, type FormEvent } from "react";

type CreditPlan = {
  id: string;
  totalAmount: number;
  depositAmount: number;
  balance: number;
  installmentCount: number;
  nextDueDate: string;
  status: "ACTIVE" | "DUE_SOON" | "OVERDUE" | "PAID_OFF";
  customer: { id: string; name: string; phone: string };
  product: { name: string; sku: string };
  branch: { name: string };
  payments: { id: string; amount: number; method: string; reference: string | null; createdAt: string }[];
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const statusName = (status: CreditPlan["status"]) => status.replace("_", " ");

export default function CreditPage() {
  const [plans, setPlans] = useState<CreditPlan[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshPlans() {
    const response = await fetch("/api/credit", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load credit accounts.");
    setPlans(data);
  }

  useEffect(() => {
    async function loadPlans() {
      try {
        await refreshPlans();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load credit accounts.");
      } finally {
        setLoading(false);
      }
    }
    void loadPlans();
  }, []);

  const selected = plans.find((plan) => plan.id === selectedId && plan.status !== "PAID_OFF") ?? plans.find((plan) => plan.status !== "PAID_OFF");
  const outstanding = plans.filter((plan) => plan.status !== "PAID_OFF");
  const overdue = outstanding.filter((plan) => plan.status === "OVERDUE" || new Date(plan.nextDueDate) < new Date());
  const totalBalance = outstanding.reduce((sum, plan) => sum + plan.balance, 0);

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditPlanId: selected.id, amount: Number(data.get("amount")), method: data.get("method"), reference: data.get("reference") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be recorded.");
      await refreshPlans();
      form.reset();
      setNotice(`Payment recorded. Remaining balance: ${money(result.balance)}.`);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Payment could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Customer credit</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Credit ledger</h2></div><span className="text-sm text-[#69746c]">Live account balances and payments</span></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

        <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-3">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Open accounts</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : outstanding.length}</p></div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Outstanding balance</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : money(totalBalance)}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[#69746c]">Overdue accounts</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : overdue.length}</p></div>
        </div>

        <section className="border border-[#dfe4df] bg-white">
          <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit accounts</h3></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 text-right font-medium">Original</th><th className="px-4 py-3 text-right font-medium">Balance</th><th className="px-4 py-3 font-medium">Next due</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">
            {plans.map((plan) => <tr key={plan.id} className={selected?.id === plan.id ? "bg-[#f5f8f2]" : ""}><td className="px-4 py-3"><p className="font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[#69746c]">{plan.customer.phone}</p></td><td className="px-4 py-3">{plan.product.name}</td><td className="px-4 py-3 text-[#69746c]">{plan.branch.name}</td><td className="px-4 py-3 text-right tabular-nums">{money(plan.totalAmount)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(plan.balance)}</td><td className="px-4 py-3 text-[#69746c]">{new Date(plan.nextDueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3"><span className={`text-xs ${plan.status === "OVERDUE" || (plan.status !== "PAID_OFF" && new Date(plan.nextDueDate) < new Date()) ? "text-[#995338]" : plan.status === "PAID_OFF" ? "text-[#69746c]" : "text-[#42684a]"}`}>{statusName(plan.status)}</span></td><td className="px-4 py-3">{plan.status !== "PAID_OFF" ? <button type="button" onClick={() => setSelectedId(plan.id)} className="text-xs font-semibold text-[#315d3f] underline underline-offset-4">Record payment</button> : <span className="text-xs text-[#69746c]">Settled</span>}</td></tr>)}
            {!loading && !plans.length ? <tr><td colSpan={8} className="px-4 py-10 text-center"><p className="text-sm font-semibold">No credit accounts recorded</p><p className="mt-1 text-sm text-[#69746c]">Accounts will appear here when a credit sale is created.</p></td></tr> : null}
          </tbody></table></div>
        </section>

        {selected ? <form onSubmit={recordPayment} className="border border-[#dfe4df] bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Record an installment</h3><p className="mt-1 text-xs text-[#69746c]">{selected.customer.name} · Balance {money(selected.balance)}</p></div><select aria-label="Credit account" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="border border-[#d6ddd6] bg-white px-3 py-2 text-sm">{outstanding.map((plan) => <option key={plan.id} value={plan.id}>{plan.customer.name} · {plan.product.name}</option>)}</select></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-[#526057]">Amount received (KES)<input name="amount" type="number" min="1" max={selected.balance} step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Method<select name="method" className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select></label>
            <label className="text-xs font-medium text-[#526057]">Payment reference <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
          </div>
          <div className="mt-4 flex justify-end"><button disabled={saving} className="bg-[#173a2b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Recording…" : "Record payment"}</button></div>
        </form> : null}

        {selected?.payments.length ? <section className="border border-[#dfe4df] bg-white"><div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent installments · {selected.customer.name}</h3></div><div className="divide-y divide-[#edf0ed]">{selected.payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-3 px-4 py-3 text-sm"><span className="text-[#69746c]">{new Date(payment.createdAt).toLocaleString("en-KE")} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span><strong>{money(payment.amount)}</strong></div>)}</div></section> : null}
      </div>
    </AppShell>
  );
}
