"use client";

import { AppShell } from "@/components/app-shell";
import { useEffect, useState, type FormEvent } from "react";

type CreditPlan = {
  id: string;
  totalAmount: number;
  depositAmount: number;
  balance: number;
  installmentCount: number;
  termMonths: number;
  nextDueDate: string;
  status: "ACTIVE" | "DUE_SOON" | "OVERDUE" | "PAID_OFF";
  customer: { id: string; name: string; phone: string };
  product: { name: string; sku: string };
  branch: { name: string };
  payments: { id: string; amount: number; method: string; reference: string | null; createdAt: string }[];
  installments: { id: string; sequence: number; dueDate: string; amount: number; paidAmount: number; paidAt: string | null }[];
  paymentSubmissions: { id: string; amount: number; reference: string; status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string }[];
  paymentRequests: { id: string; amount: number; mpesaReceipt: string | null; createdAt: string }[];
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
  const [reconciling, setReconciling] = useState("");

  async function refreshPlans() {
    const response = await fetch("/api/credit", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load credit accounts.");
    setPlans(data);
  }

  useEffect(() => {
    const accountId = new URLSearchParams(window.location.search).get("account");
    if (accountId) setSelectedId(accountId);
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
    const refreshTimer = window.setInterval(() => { void refreshPlans().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const selected = plans.find((plan) => plan.id === selectedId && plan.status !== "PAID_OFF") ?? plans.find((plan) => plan.status !== "PAID_OFF");
  const outstanding = plans.filter((plan) => plan.status !== "PAID_OFF");
  const overdue = outstanding.filter((plan) => plan.status === "OVERDUE" || new Date(plan.nextDueDate) < new Date());
  const totalBalance = outstanding.reduce((sum, plan) => sum + plan.balance, 0);
  const pendingSubmissions = plans.flatMap((plan) => plan.paymentSubmissions.filter((submission) => submission.status === "PENDING").map((submission) => ({ ...submission, customer: plan.customer, product: plan.product })));
  const paymentReviews = plans.flatMap((plan) => plan.paymentRequests.map((request) => ({ ...request, customer: plan.customer, product: plan.product })));

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

  async function sharePaymentLink() {
    if (!selected) return;
    setError("");
    try {
      const response = await fetch(`/api/credit/${selected.id}/link`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create a customer link.");
      const link = `${window.location.origin}/pay/${data.token}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt("Copy this secure customer account link", link);
      }
      setNotice("A new secure account link was copied. This replaces the previous customer link.");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not create a customer link.");
    }
  }

  async function createThirdPartyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const amount = Number(new FormData(event.currentTarget).get("amount"));
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/credit/${selected.id}/payment-request`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create a payment request.");
      const link = `${window.location.origin}/request/${result.token}`;
      try { await navigator.clipboard.writeText(link); } catch { window.prompt("Copy this private payment request link", link); }
      setNotice("A private payment link for the selected amount was copied. The payer can enter their own M-Pesa number.");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not create a payment request.");
    }
  }

  async function reviewSubmission(submissionId: string, decision: "APPROVE" | "REJECT") {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/credit/submissions/${submissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be reviewed.");
      await refreshPlans();
      setNotice(decision === "APPROVE" ? "M-Pesa reference verified and payment applied to the account." : "Payment reference declined. The account balance is unchanged.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Payment could not be reviewed.");
    }
  }

  async function reconcilePaymentRequest(requestId: string) {
    setReconciling(requestId);
    setError("");
    try {
      const response = await fetch(`/api/payment-requests/${requestId}/reconcile`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment could not be reconciled.");
      await refreshPlans();
      setNotice("Payment request reconciled with the verified credit ledger.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be reconciled.");
    } finally { setReconciling(""); }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Take home today, pay over time</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Lipa Mdogo Mdogo</h2></div><span className="text-sm text-[#69746c]">Agreements, schedules and payment confirmations</span></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

        <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-3">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Open accounts</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : outstanding.length}</p></div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Outstanding balance</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : money(totalBalance)}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[#69746c]">Overdue accounts</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : overdue.length}</p></div>
        </div>

        {pendingSubmissions.length ? <section className="overflow-hidden rounded-xl border border-[#e8e1d1] bg-[#fffefa]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eee9de] bg-[#faf8f2] px-4 py-3.5"><div><h3 className="text-sm font-semibold text-[#344438]">M-Pesa references awaiting review</h3><p className="mt-1 text-xs text-[#7c8176]">Verify each transaction in your M-Pesa statement before approving.</p></div><span className="rounded-full bg-[#f2ebda] px-2.5 py-1 text-[10px] font-semibold text-[#856b42]">{pendingSubmissions.length} pending</span></div>
          <div className="divide-y divide-[#efede6]">{pendingSubmissions.map((submission) => <div key={submission.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"><div><p className="text-sm font-semibold text-[#354638]">{submission.customer.name} <span className="font-normal text-[#8c8d82]">- {submission.product.name}</span></p><p className="mt-1 text-xs text-[#737a70]">{money(submission.amount)} · Ref {submission.reference} · {new Date(submission.createdAt).toLocaleString("en-KE")}</p></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void reviewSubmission(submission.id, "REJECT")} className="rounded-lg border border-[#e6d7d1] px-3 py-2 text-xs font-semibold text-[#975b4d] hover:bg-[#fff3ef] disabled:opacity-50">Decline</button><button type="button" disabled={saving} onClick={() => void reviewSubmission(submission.id, "APPROVE")} className="rounded-lg bg-[#254936] px-3 py-2 text-xs font-semibold text-white hover:bg-[#315943] disabled:opacity-50">Approve verified payment</button></div></div>)}</div>
        </section> : null}
        {paymentReviews.length ? <section className="overflow-hidden rounded-xl border border-[#e8cfc4] bg-[#fffefa]"><div className="border-b border-[#f0dfd8] bg-[#fff7f3] px-4 py-3.5"><h3 className="text-sm font-semibold text-[#784c40]">M-Pesa payments needing reconciliation</h3><p className="mt-1 text-xs text-[#8b6a60]">M-Pesa confirmed these charges, but the account ledger did not update automatically. Verify each receipt in the statement before reconciling. Payer links are locked against another charge.</p></div><div className="divide-y divide-[#f0e6e1]">{paymentReviews.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><p className="text-sm font-semibold text-[#4a3a35]">{item.customer.name} <span className="font-normal text-[#8c7d77]">· {item.product.name}</span></p><p className="mt-1 text-xs text-[#796d67]">{money(item.amount)} · Receipt {item.mpesaReceipt ?? "pending"} · {new Date(item.createdAt).toLocaleString("en-KE")}</p></div><button type="button" disabled={reconciling === item.id} onClick={() => void reconcilePaymentRequest(item.id)} className="rounded-lg border border-[#dec9bf] bg-white px-3 py-2 text-xs font-semibold text-[#784c40] hover:bg-[#fff7f3] disabled:opacity-50">{reconciling === item.id ? "Checking ledger…" : "Mark reconciled"}</button></div>)}</div></section> : null}
        <section className="border border-[#dfe4df] bg-white">
          <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Credit accounts</h3></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Customer</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Branch</th><th className="px-4 py-3 text-right font-medium">Original</th><th className="px-4 py-3 text-right font-medium">Balance</th><th className="px-4 py-3 font-medium">Next due</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">
            {plans.map((plan) => <tr key={plan.id} className={selected?.id === plan.id ? "bg-[#f5f8f2]" : ""}><td className="px-4 py-3"><p className="font-medium">{plan.customer.name}</p><p className="mt-1 text-xs text-[#69746c]">{plan.customer.phone}</p></td><td className="px-4 py-3">{plan.product.name}</td><td className="px-4 py-3 text-[#69746c]">{plan.branch.name}</td><td className="px-4 py-3 text-right tabular-nums">{money(plan.totalAmount)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(plan.balance)}</td><td className="px-4 py-3 text-[#69746c]">{new Date(plan.nextDueDate).toLocaleDateString("en-KE")}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${plan.status === "OVERDUE" || (plan.status !== "PAID_OFF" && new Date(plan.nextDueDate) < new Date()) ? "bg-[#fff0ed] text-[#aa5543]" : plan.status === "PAID_OFF" ? "bg-[#f1f3f1] text-[#718078]" : "bg-[#eaf6ed] text-[#367d50]"}`}>{statusName(plan.status)}</span></td><td className="px-4 py-3">{plan.status !== "PAID_OFF" ? <button type="button" onClick={() => setSelectedId(plan.id)} className="rounded-lg bg-[#edf6ef] px-3 py-1.5 text-xs font-semibold text-[#315d3f] hover:bg-[#e1f0e5]">Record payment</button> : <span className="text-xs text-[#69746c]">Settled</span>}</td></tr>)}
            {!loading && !plans.length ? <tr><td colSpan={8} className="px-4 py-10 text-center"><p className="text-sm font-semibold">No credit accounts recorded</p><p className="mt-1 text-sm text-[#69746c]">Accounts will appear here when a credit sale is created.</p></td></tr> : null}
          </tbody></table></div>
        </section>

        {selected ? <form onSubmit={recordPayment} className="border border-[#dfe4df] bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Record an installment</h3><p className="mt-1 text-xs text-[#69746c]">{selected.customer.name} · {selected.termMonths}-month plan · Balance {money(selected.balance)}</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Credit account" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="border border-[#d6ddd6] bg-white px-3 py-2 text-sm">{outstanding.map((plan) => <option key={plan.id} value={plan.id}>{plan.customer.name} · {plan.product.name}</option>)}</select><button type="button" onClick={() => void sharePaymentLink()} className="rounded-lg border border-[#d6ddd6] bg-[#faf9f5] px-3 py-2 text-xs font-semibold text-[#35513c] hover:bg-[#f1f0e9]">Copy customer link</button></div></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-[#526057]">Amount received (KES)<input name="amount" type="number" min="1" max={selected.balance} step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Method<select name="method" className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select></label>
            <label className="text-xs font-medium text-[#526057]">Payment reference <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
          </div>
          <div className="mt-4 flex justify-end"><button disabled={saving} className="bg-[#173a2b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Recording…" : "Record payment"}</button></div>
        </form> : null}

        {selected ? <form onSubmit={createThirdPartyRequest} className="flex flex-col gap-4 border border-[#dfe4df] bg-[#fafbf8] p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#718272]">Let someone else pay</p><h3 className="mt-1 text-sm font-semibold text-[#344438]">Create a private M-Pesa payment link</h3><p className="mt-1 text-xs leading-5 text-[#737a70]">The payer sees only the business and requested amount. They enter their own number; the account updates after M-Pesa confirms payment.</p></div>
          <div className="flex w-full gap-2 sm:w-auto"><label className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074] sm:w-36">Amount (KES)<input name="amount" type="number" min="1" max={selected.balance} defaultValue={selected.balance} required className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#17211b]"/></label><button className="self-end bg-[#254936] px-4 py-[11px] text-xs font-semibold text-white transition hover:bg-[#315943]">Copy payer link</button></div>
        </form> : null}

        {selected?.installments.length ? <section className="border border-[#dfe4df] bg-white"><div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Repayment schedule · {selected.termMonths} months</h3><p className="mt-1 text-xs text-[#69746c]">The customer’s shared account page updates as payments are recorded.</p></div><div className="grid gap-px bg-[#eeece4] sm:grid-cols-2 lg:grid-cols-3">{selected.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-3 bg-white px-4 py-3"><span><span className="block text-xs font-semibold text-[#354638]">Payment {installment.sequence}</span><span className="mt-1 block text-[10px] text-[#898c81]">{new Date(installment.dueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span></span><span className="text-right"><span className="block text-xs font-semibold tabular-nums">{money(installment.amount)}</span><span className="mt-1 block text-[9px] uppercase tracking-wider text-[#747b70]">{installment.paidAt ? "Paid" : installment.paidAmount ? "Part paid" : "Upcoming"}</span></span></div>)}</div></section> : null}        {selected?.payments.length ? <section className="border border-[#dfe4df] bg-white"><div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent installments · {selected.customer.name}</h3></div><div className="divide-y divide-[#edf0ed]">{selected.payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-3 px-4 py-3 text-sm"><span className="text-[#69746c]">{new Date(payment.createdAt).toLocaleString("en-KE")} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span><strong>{money(payment.amount)}</strong></div>)}</div></section> : null}
      </div>
    </AppShell>
  );
}
