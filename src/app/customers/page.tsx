"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CreditCard, Plus, Search, UserRoundPlus } from "lucide-react";

import { AppShell } from "@/components/app-shell";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE" | "CREDIT_HOLD";
  creditLimit: number;
  smsRemindersEnabled: boolean;
  emailRemindersEnabled: boolean;
  remindersConsentAt: string | null;
  createdAt: string;
  branch: { name: string };
  _count: { sales: number; creditPlans: number };
  sales: {
    id: string;
    invoiceNumber: string;
    total: number;
    paymentMethod: string;
    createdAt: string;
    saleItems: { product: { name: string }; quantity: number }[];
  }[];
};
type CustomerCreditAccount = {
  id: string;
  totalAmount: number;
  depositAmount: number;
  balance: number;
  installmentCount: number;
  termMonths: number;
  nextDueDate: string;
  status: "ACTIVE" | "DUE_SOON" | "OVERDUE" | "PAID_OFF";
  createdAt: string;
  branch: { name: string };
  product: { name: string; sku: string };
  sale: { payments: { id: string; amount: number; method: string; reference: string | null; createdAt: string }[] } | null;
  payments: { id: string; amount: number; method: string; reference: string | null; createdAt: string }[];
  installments: { id: string; sequence: number; amount: number; paidAmount: number; dueDate: string; paidAt: string | null }[];
  paymentRequests: { id: string; amount: number; purpose: string; status: string; mpesaReceipt: string | null; paidAt: string | null; createdAt: string }[];
  paymentSubmissions: { id: string; amount: number; reference: string; createdAt: string }[];
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditAccounts, setCreditAccounts] = useState<CustomerCreditAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      try {
        const response = await fetch("/api/customers", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load customers.");
        setCustomers(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load customers.");
      } finally {
        setLoading(false);
      }
    }
    void loadCustomers();
  }, []);

  const selected = customers.find((customer) => customer.id === selectedId) ?? customers[0];
  const filtered = customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!selected) {
      setCreditAccounts([]);
      setAccountsLoading(false);
      return;
    }
    let active = true;
    setAccountsLoading(true);
    const refreshCreditAccounts = async (initial = false) => {
      try {
        const response = await fetch(`/api/customers/${selected.id}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the customer’s Lipa accounts.");
        if (active) {
          setCreditAccounts(data.creditPlans);
          setAccountsError("");
        }
      } catch (loadError) {
        if (active) setAccountsError(loadError instanceof Error ? loadError.message : "Could not load the customer’s Lipa accounts.");
      } finally {
        if (active && initial) setAccountsLoading(false);
      }
    };
    void refreshCreditAccounts(true);
    const timer = window.setInterval(() => void refreshCreditAccounts(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selected?.id]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          phone: formData.get("phone"),
          email: formData.get("email"),
          creditLimit: Number(formData.get("creditLimit") || 0),
          smsRemindersEnabled: formData.get("smsRemindersEnabled") === "on",
          emailRemindersEnabled: formData.get("emailRemindersEnabled") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Customer could not be saved.");

      const refreshed = await fetch("/api/customers", { cache: "no-store" });
      if (refreshed.ok) setCustomers(await refreshed.json());
      setSelectedId(data.id);
      setAdding(false);
      form.reset();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReminderPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsRemindersEnabled: formData.get("smsRemindersEnabled") === "on", emailRemindersEnabled: formData.get("emailRemindersEnabled") === "on" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Reminder preferences could not be saved.");
      setCustomers((current) => current.map((customer) => customer.id === result.id ? { ...customer, ...result } : customer));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reminder preferences could not be saved.");
    } finally { setSaving(false); }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Customer accounts</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customers <span className="ml-1 text-base font-normal text-[#69746c]">{customers.length}</span></h2></div>
          <button type="button" onClick={() => { setAdding((current) => !current); setError(""); }} className="inline-flex items-center gap-2 bg-[#173a2b] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#24513a]"><Plus className="h-4 w-4" /> Add customer</button>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

        {adding ? (
          <form onSubmit={createCustomer} className="border border-[#dfe4df] bg-white p-4">
            <div className="mb-4 flex items-center gap-2"><UserRoundPlus className="h-4 w-4 text-[#315d3f]" /><h3 className="text-sm font-semibold">New customer record</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-[#526057]">Full name<input name="name" required minLength={2} maxLength={120} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Phone<input name="phone" required minLength={7} maxLength={30} autoComplete="tel" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Email <span className="font-normal">(optional)</span><input name="email" type="email" maxLength={254} autoComplete="email" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Credit limit (KES)<input name="creditLimit" type="number" min="0" step="1" defaultValue="0" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
            </div>
            <div className="mt-4 rounded-lg border border-[#e8ebe8] bg-[#fafbf8] p-3"><p className="text-xs font-semibold text-[#405345]">Payment reminders</p><p className="mt-1 text-[10px] leading-4 text-[#78847a]">Enable only channels the customer has agreed to receive payment reminders on.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="smsRemindersEnabled" type="checkbox" className="accent-[#315d3f]"/> SMS to phone</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="emailRemindersEnabled" type="checkbox" className="accent-[#315d3f]"/> Email</label></div></div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="border border-[#d6ddd6] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#173a2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save customer"}</button></div>
          </form>
        ) : null}

        <div className="customer-workspace grid min-h-[520px] overflow-hidden rounded-[20px] border border-[#e5ece6] bg-white shadow-[0_8px_30px_rgba(27,47,35,.045)] lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="border-b border-[#dfe4df] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#e8ebe8] p-3">
              <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone or email" className="w-full border border-[#d6ddd6] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#315d3f]" /></div>
            </div>
            {loading ? <p className="p-5 text-sm text-[#69746c]">Loading customer records…</p> : filtered.length ? (
              <div className="max-h-[600px] divide-y divide-[#e8ebe8] overflow-y-auto">
                {filtered.map((customer) => <button key={customer.id} type="button" onClick={() => setSelectedId(customer.id)} className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-[#f7faf7] ${selected?.id === customer.id ? "border-l-2 border-[#39815a] bg-[#f0f7f1]" : "border-l-2 border-transparent"}`}>
                  <span className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-bold ${selected?.id === customer.id ? "bg-[#dcefe0] text-[#326747]" : "bg-[#f0f4f0] text-[#788a7c]"}`}>{customer.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-[#2d4033]">{customer.name}</span><span className="mt-0.5 block text-[10px] text-[#8a968e]">{customer.phone}</span></span><span className="ml-auto text-[10px] font-medium text-[#87958c]">{customer._count.sales}</span></span><span className="mt-2 flex items-center justify-between pl-12 text-[10px] text-[#89968d]"><span>{customer.branch.name}</span><span>purchases</span></span>
                </button>)}
              </div>
            ) : <div className="p-5"><p className="text-sm font-semibold">{customers.length ? "No matching customers" : "No customer records yet"}</p><p className="mt-1 text-sm text-[#69746c]">{customers.length ? "Try another search." : "Create a customer record to attach purchases and account history."}</p></div>}
          </section>

          <section className="min-w-0 p-5 sm:p-6">
            {selected ? <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8ebe8] pb-5">
                <div className="flex items-center gap-3.5"><span className="grid h-14 w-14 place-items-center rounded-[19px] bg-gradient-to-br from-[#e5f2e7] to-[#d5e9da] text-lg font-semibold tracking-tight text-[#326247] ring-1 ring-[#d6e7d9]">{selected.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#779080]">Customer profile</p><h3 className="mt-1 text-xl font-semibold tracking-[-.035em] text-[#253b2d]">{selected.name}</h3><p className="mt-1 text-xs text-[#819087]">{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p></div></div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border-0 px-3 py-1.5 text-[10px] font-semibold ${selected.status === "ACTIVE" ? "bg-[#eaf6ed] text-[#367d50]" : selected.status === "CREDIT_HOLD" ? "bg-[#fff4e5] text-[#91662c]" : "bg-[#f1f3f1] text-[#718078]"}`}><span className={`h-1.5 w-1.5 rounded-full ${selected.status === "ACTIVE" ? "bg-[#50a56c]" : selected.status === "CREDIT_HOLD" ? "bg-[#d3a34f]" : "bg-[#9ba69e]"}`}/>{selected.status.replace("_", " ")}</span>
              </div>
              <div className="grid gap-2.5 border-b border-[#e8ebe8] py-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-[#e9efea] bg-[#fafcfa] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Branch</p><p className="mt-2 truncate text-xs font-semibold text-[#354b3b]">{selected.branch.name}</p></div>
                <div className="rounded-xl border border-[#e9efea] bg-[#fafcfa] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Lifetime transactions</p><p className="mt-2 text-[17px] font-bold tracking-[-.04em] text-[#354b3b]">{selected._count.sales}</p></div>
                <div className="rounded-xl border border-[#e9efea] bg-[#fafcfa] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Credit plans</p><p className="mt-2 text-[17px] font-bold tracking-[-.04em] text-[#354b3b]">{selected._count.creditPlans}</p></div>
                <div className="rounded-xl border border-[#e3eee5] bg-[#f4f9f4] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#779080]">Credit limit</p><p className="mt-2 truncate text-xs font-bold text-[#326747]">{money(selected.creditLimit)}</p></div>
              </div>
              <section className="mt-5 overflow-hidden rounded-2xl border border-[#e4eae3] bg-[#fbfcf9]" aria-labelledby="customer-lipa-heading">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ede6] bg-white px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5ed] text-[#477452]"><CreditCard className="h-4 w-4"/></span><div><h4 id="customer-lipa-heading" className="text-sm font-semibold text-[#304135]">Lipa Mdogo Mdogo</h4><p className="mt-1 text-[10px] text-[#879187]">Repayments, due dates and account activity for {selected.name}</p></div></div>
                  {!accountsLoading && !accountsError ? <span className="rounded-full bg-[#f1f4ef] px-2.5 py-1 text-[10px] font-semibold text-[#66756a]">{creditAccounts.length} account{creditAccounts.length === 1 ? "" : "s"}</span> : null}
                </div>
                {accountsLoading ? <p className="px-5 py-8 text-center text-xs text-[#879187]">Loading payment history…</p> : accountsError && !creditAccounts.length ? <p role="alert" className="m-4 rounded-lg border border-[#f0ded8] bg-[#fffaf8] px-3 py-2.5 text-xs text-[#914c3d]">{accountsError}</p> : creditAccounts.length ? <div className="space-y-3 p-3 sm:p-4">
                  {accountsError ? <p role="status" className="rounded-lg bg-[#fffaf0] px-3 py-2 text-[10px] text-[#8a6938]">Showing the latest saved activity. Live refresh is temporarily unavailable.</p> : null}
                  {creditAccounts.map((account) => {
                    const repaid = account.totalAmount - account.balance;
                    const paidInstallments = account.installments.filter((installment) => installment.paidAt).length;
                    const overdueInstallments = account.installments.filter((installment) => !installment.paidAt && new Date(installment.dueDate) < new Date());
                    const alertRequests = account.paymentRequests.filter((request) => request.status === "REVIEW" || request.status === "PROCESSING");
                    const paymentHistory = [
                      ...(account.sale?.payments ?? []).map((payment) => ({ ...payment, paymentKind: "Deposit" })),
                      ...account.payments.map((payment) => ({ ...payment, paymentKind: "Installment" })),
                    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
                    return <article key={account.id} className="overflow-hidden rounded-xl border border-[#e5eae3] bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0eb] p-4">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h5 className="truncate text-[13px] font-semibold text-[#304135]">{account.product.name}</h5><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${account.status === "PAID_OFF" ? "bg-[#f0f3f0] text-[#758177]" : account.status === "OVERDUE" || overdueInstallments.length ? "bg-[#fff0ed] text-[#a35442]" : "bg-[#eaf6ed] text-[#367d50]"}`}>{account.status === "PAID_OFF" ? "Paid off" : overdueInstallments.length ? "Payment overdue" : account.status.replace("_", " ")}</span></div><p className="mt-1 text-[10px] text-[#879187]">{account.branch.name} · {account.product.sku} · {account.termMonths}-month plan · started {new Date(account.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p></div>
                        <div className="text-left sm:text-right"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#8a978e]">Balance remaining</p><p className="mt-1 text-lg font-bold tracking-tight text-[#294533]">{money(account.balance)}</p></div>
                      </div>
                      <div className="px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3 text-[10px]"><span className="font-medium text-[#637267]">{money(repaid)} paid of {money(account.totalAmount)}</span><span className="text-[#879187]">{paidInstallments} / {account.installmentCount} installments</span></div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf1eb]"><div className="h-full rounded-full bg-[#65a475] transition-all" style={{ width: `${account.totalAmount > 0 ? Math.min(100, (repaid / account.totalAmount) * 100) : 0}%` }}/></div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="inline-flex items-center gap-1.5 text-[10px] text-[#758177]"><CalendarClock className="h-3.5 w-3.5"/>{account.status === "PAID_OFF" ? "No balance due" : `Next due ${new Date(account.nextDueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`}</p><Link href={`/credit?account=${account.id}`} className="inline-flex items-center gap-1 rounded-lg border border-[#dfe8df] bg-[#fafcf9] px-2.5 py-1.5 text-[10px] font-semibold text-[#3d684a] hover:bg-[#eff6ef]">Open account in Lipa<ArrowRight className="h-3 w-3"/></Link></div>
                      </div>
                      <div className="grid border-t border-[#edf0eb] lg:grid-cols-2">
                        <div className="border-b border-[#edf0eb] p-4 lg:border-b-0 lg:border-r"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.13em] text-[#88948a]">Installment schedule</p><div className="max-h-44 space-y-1 overflow-y-auto">{account.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#fafbf8] px-2.5 py-2"><span className="min-w-0"><span className="block text-[10px] font-medium text-[#45564a]">Payment {installment.sequence} · {new Date(installment.dueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>{installment.paidAmount > 0 && installment.paidAmount < installment.amount ? <span className="mt-0.5 block text-[9px] text-[#829087]">Part paid: {money(installment.paidAmount)}</span> : null}</span><span className={`shrink-0 text-[10px] font-semibold ${installment.paidAt ? "text-[#39724f]" : new Date(installment.dueDate) < new Date() ? "text-[#a35442]" : "text-[#69766c]"}`}>{installment.paidAt ? "Paid" : money(installment.amount - installment.paidAmount)}</span></div>)}</div></div>
                        <div className="p-4"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.13em] text-[#88948a]">Payment history <span className="font-normal normal-case tracking-normal">· latest {paymentHistory.length}</span></p>{paymentHistory.length ? <div className="max-h-44 divide-y divide-[#edf0eb] overflow-y-auto">{paymentHistory.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0"><span className="block text-[10px] font-medium text-[#45564a]">{new Date(payment.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} · {payment.paymentKind} · {payment.method}</span><span className="mt-0.5 block truncate text-[9px] text-[#89948b]">{payment.reference ? `Reference ${payment.reference}` : "No transaction reference"}</span></span><span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#354b3b]">{money(payment.amount)}</span></div>)}</div> : <p className="py-4 text-[10px] text-[#89948b]">No payments recorded yet.</p>}</div>
                      </div>
                      {account.paymentSubmissions.length || alertRequests.length ? <div className="border-t border-[#f0e8dc] bg-[#fffdf8] px-4 py-3">{account.paymentSubmissions.map((submission) => <p key={submission.id} className="text-[10px] text-[#8a6938]">Reference {submission.reference} for {money(submission.amount)} is waiting for verification.</p>)}{alertRequests.map((request) => <p key={request.id} className="text-[10px] text-[#8a6938]">{request.status === "REVIEW" ? "M-Pesa payment needs reconciliation" : "M-Pesa payment is processing"} · {money(request.amount)}{request.mpesaReceipt ? ` · Receipt ${request.mpesaReceipt}` : ""}</p>)}</div> : null}
                    </article>;
                  })}
                </div> : <div className="px-5 py-7 text-center"><p className="text-xs font-semibold text-[#4b5d4e]">No Lipa accounts for this customer</p><p className="mt-1 text-[10px] text-[#89948b]">When this customer purchases on installments, their balance and payment history will appear here.</p></div>}
              </section>
              <form onSubmit={saveReminderPreferences} className="mt-5 rounded-xl border border-[#e6ebe5] bg-[#fafbf8] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-[#354638]">Payment reminder preferences</h4><p className="mt-1 max-w-xl text-[11px] leading-5 text-[#79837a]">Enable only the channels this customer has agreed to use. These are service reminders about their payment plan.</p></div><button disabled={saving} className="rounded-lg bg-[#254936] px-3.5 py-2 text-[11px] font-semibold text-white disabled:opacity-60">Save preferences</button></div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2"><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="smsRemindersEnabled" type="checkbox" defaultChecked={selected.smsRemindersEnabled} className="accent-[#315d3f]"/> SMS · {selected.phone}</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="emailRemindersEnabled" type="checkbox" defaultChecked={selected.emailRemindersEnabled} disabled={!selected.email} className="accent-[#315d3f]"/> Email{selected.email ? ` · ${selected.email}` : " · add an email first"}</label></div>
                {selected.remindersConsentAt ? <p className="mt-2 text-[10px] text-[#92988f]">Consent recorded {new Date(selected.remindersConsentAt).toLocaleDateString("en-KE")}</p> : null}
              </form>
              <div className="pt-5">
                <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-semibold">Recent purchases</h4><span className="text-xs text-[#69746c]">Most recent 6</span></div>
                {selected.sales.length ? <div className="divide-y divide-[#e8ebe8] border-y border-[#e8ebe8]">
                  {selected.sales.map((sale) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div><p className="text-sm font-medium">{sale.saleItems.map((item) => `${item.product.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", ") || "Sale"}</p><p className="mt-1 text-xs text-[#69746c]">{sale.invoiceNumber} · {new Date(sale.createdAt).toLocaleDateString("en-KE")}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold">{money(sale.total)}</p><p className="mt-1 text-xs text-[#69746c]">{sale.paymentMethod}</p></div>
                  </div>)}
                </div> : <p className="border-y border-[#e8ebe8] py-8 text-center text-sm text-[#69746c]">No completed purchases linked to this customer.</p>}
              </div>
            </> : <div className="grid h-full min-h-64 place-items-center text-center"><div><p className="text-sm font-semibold">Select a customer</p><p className="mt-1 text-sm text-[#69746c]">Choose a record or create a new one.</p></div></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
