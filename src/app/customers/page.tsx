"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowRight, AlertCircle, CalendarClock, ChevronLeft, ChevronRight, CreditCard, Mail, Pencil, Phone, Plus, Search, UserRoundPlus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { creditProgress } from "@/lib/credit-progress";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE" | "CREDIT_HOLD";
  creditLimit: number;
  reliabilityScore: number;
  smsRemindersEnabled: boolean;
  emailRemindersEnabled: boolean;
  whatsappRemindersEnabled: boolean;
  remindersConsentAt: string | null;
  whatsappConsentAt: string | null;
  createdAt: string;
  branch: { name: string };
  _count: { sales: number; creditPlans: number };
  openBalance: number;
  activePlanCount: number;
  overduePlanCount: number;
  nextDueDate: string | null;
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
  imei: string | null;
  totalAmount: number;
  lateFeeAmount: number;
  depositAmount: number;
  balance: number;
  installmentCount: number;
  termMonths: number;
  nextDueDate: string;
  status: "ACTIVE" | "DUE_SOON" | "DUE" | "GRACE" | "LATE_1" | "LATE_2" | "LATE_3" | "RECOVERY" | "OVERDUE" | "PAID_OFF";
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
const nairobiDay = (value: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

export default function CustomersPage() {
  const { data: session } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, attention: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 30, total: 0, pages: 1 });
  const [creditAccounts, setCreditAccounts] = useState<CustomerCreditAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, filter, page: String(page) });
        const response = await fetch(`/api/customers?${params}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load customers.");
        setCustomers(data.customers);
        setSummary(data.summary);
        setPagination(data.pagination);
        setSelectedId((current) => data.customers.some((customer: Customer) => customer.id === current) ? current : data.customers[0]?.id ?? "");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load customers.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, filter, page, reloadKey]);

  const selected = customers.find((customer) => customer.id === selectedId) ?? customers[0];
  const selectedCustomerId = selected?.id;

  useEffect(() => {
    if (!selectedCustomerId) {
      return;
    }
    let active = true;
    const refreshCreditAccounts = async (initial = false) => {
      try {
        const response = await fetch(`/api/customers/${selectedCustomerId}`, { cache: "no-store" });
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
  }, [selectedCustomerId]);

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
          whatsappRemindersEnabled: formData.get("whatsappRemindersEnabled") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Customer could not be saved.");

      setAccountsLoading(true);
      setSelectedId(data.id);
      setQuery("");
      setFilter("ALL");
      setPage(1);
      setReloadKey((key) => key + 1);
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
        body: JSON.stringify({ smsRemindersEnabled: formData.get("smsRemindersEnabled") === "on", emailRemindersEnabled: formData.get("emailRemindersEnabled") === "on", whatsappRemindersEnabled: formData.get("whatsappRemindersEnabled") === "on" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Reminder preferences could not be saved.");
      setCustomers((current) => current.map((customer) => customer.id === result.id ? { ...customer, ...result } : customer));
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Reminder preferences could not be saved.");
    } finally { setSaving(false); }
  }

  async function saveCustomerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/customers/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.get("name"), phone: formData.get("phone"), email: formData.get("email"), creditLimit: Number(formData.get("creditLimit") || 0), status: formData.get("status") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Customer profile could not be saved.");
      const contactChanged = selected.phone !== result.phone || selected.email !== result.email;
      setCustomers((current) => current.map((customer) => customer.id === result.id ? { ...customer, ...result } : customer));
      setReloadKey((key) => key + 1);
      setEditingProfile(false);
      setNotice(contactChanged ? "Profile saved. Reminder consent was cleared for any changed contact detail." : "Customer profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer profile could not be saved.");
    } finally { setSaving(false); }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="customer-hero flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(0,0,0,.035)] sm:px-7">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Customer accounts</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customers <span className="ml-1 text-base font-normal text-[#69746c]">{summary.total}</span></h2><p className="mt-1.5 text-sm text-[#77837a]">Know every customer, account and next step.</p></div>
          <button type="button" onClick={() => { setAdding((current) => !current); setError(""); }} className="inline-flex items-center gap-2 bg-[#111111] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#1a1a1a]"><Plus className="h-4 w-4" /> Add customer</button>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="customer-stats grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#829087]">All customers</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[#111111]">{summary.total}</p><p className="mt-1 text-xs text-[#839087]">Across your permitted branches</p></div>
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#829087]">Active</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[#2d2d2d]">{summary.active}</p><p className="mt-1 text-xs text-[#839087]">Available for sales and service</p></div>
          <div className="rounded-2xl border border-[#eadfd6] bg-[#fffdfa] p-4"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#927858]">Needs attention</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[#8d5d39]">{summary.attention}</p><p className="mt-1 text-xs text-[#928575]">Credit hold or late Lipa account</p></div>
        </div>

        {adding ? (
          <form onSubmit={createCustomer} className="border border-[#e5e5e5] bg-white p-4">
            <div className="mb-4 flex items-center gap-2"><UserRoundPlus className="h-4 w-4 text-[#1a1a1a]" /><h3 className="text-sm font-semibold">New customer record</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-xs font-medium text-[#526057]">Full name<input name="name" required minLength={2} maxLength={120} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Phone<input name="phone" required minLength={7} maxLength={30} autoComplete="tel" className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Email <span className="font-normal">(optional)</span><input name="email" type="email" maxLength={254} autoComplete="email" className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
              <label className="space-y-1 text-xs font-medium text-[#526057]">Credit limit (KES)<input name="creditLimit" type="number" min="0" step="1" defaultValue="0" className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
            </div>
            <div className="mt-4 rounded-lg border border-[#e8ebe8] bg-[#f5f5f5] p-3"><p className="text-xs font-semibold text-[#2d2d2d]">Payment reminders</p><p className="mt-1 text-[10px] leading-4 text-[#78847a]">Enable only channels the customer has explicitly agreed to receive payment reminders on.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="smsRemindersEnabled" type="checkbox" className="accent-[#1a1a1a]"/> SMS to phone</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="emailRemindersEnabled" type="checkbox" className="accent-[#1a1a1a]"/> Email</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="whatsappRemindersEnabled" type="checkbox" className="accent-[#1a1a1a]"/> WhatsApp</label></div></div>
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="border border-[#c4c4c4] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#111111] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save customer"}</button></div>
          </form>
        ) : null}

        <div className="customer-workspace grid min-h-[520px] overflow-hidden rounded-[20px] border border-[#e5e5e5] bg-white shadow-[0_8px_30px_rgba(0,0,0,.045)] lg:grid-cols-[350px_minmax(0,1fr)]">
          <section className="border-b border-[#e5e5e5] lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-[#e8ebe8] p-3">
              <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search customers" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, phone or email" className="w-full rounded-xl border border-[#c4c4c4] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#1a1a1a]" /></div>
              <div className="flex flex-wrap gap-1.5" aria-label="Filter customers">
                {[ ["ALL", "All"], ["ATTENTION", "Needs attention"], ["ACTIVE", "Active"], ["CREDIT_HOLD", "Credit hold"], ["INACTIVE", "Inactive"] ].map(([value, label]) => <button key={value} type="button" onClick={() => { setFilter(value); setPage(1); }} aria-pressed={filter === value} className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold transition ${filter === value ? "bg-[#1a1a1a] text-white" : "bg-[#f5f5f5] text-[#67766b] hover:bg-[#e5e5e5]"}`}>{label}</button>)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#859087]"><span>{pagination.total} matching customer{pagination.total === 1 ? "" : "s"}</span><span>Newest activity</span></div>
            </div>
            {loading ? <p className="p-5 text-sm text-[#69746c]">Loading customer records…</p> : customers.length ? (
              <div className="max-h-[600px] divide-y divide-[#e8ebe8] overflow-y-auto">
                {customers.map((customer) => <button key={customer.id} type="button" onClick={() => { setAccountsLoading(true); setSelectedId(customer.id); }} className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-[#f5f5f5] ${selected?.id === customer.id ? "border-l-2 border-[#2d2d2d] bg-[#f5f5f5]" : "border-l-2 border-transparent"}`}>
                  <span className="flex items-center gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[10px] font-bold ${selected?.id === customer.id ? "bg-[#e5e5e5] text-[#2d2d2d]" : "bg-[#f5f5f5] text-[#788a7c]"}`}>{customer.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold text-[#1a1a1a]">{customer.name}</span><span className="mt-0.5 block text-[10px] text-[#8a968e]">{customer.phone}</span></span><span className="text-[10px] font-medium text-[#87958c]">{customer.status.replace("_", " ")}</span></span>
                  <span className="mt-2 flex items-center justify-between pl-12 text-[10px]"><span className="text-[#89968d]">{customer.overduePlanCount ? <span className="inline-flex items-center gap-1 font-semibold text-[#a15d47]"><AlertCircle className="h-3 w-3"/>{customer.overduePlanCount} late plan{customer.overduePlanCount === 1 ? "" : "s"}</span> : customer.activePlanCount ? `${customer.activePlanCount} open plan${customer.activePlanCount === 1 ? "" : "s"}` : `${customer._count.sales} purchase${customer._count.sales === 1 ? "" : "s"}`}</span><span className="font-semibold tabular-nums text-[#2d2d2d]">{customer.openBalance ? money(customer.openBalance) : customer.branch.name}</span></span>
                </button>)}
              </div>
            ) : <div className="p-5"><p className="text-sm font-semibold">{summary.total ? "No matching customers" : "No customer records yet"}</p><p className="mt-1 text-sm text-[#69746c]">{summary.total ? "Try another search or filter." : "Create a customer record to attach purchases and account history."}</p></div>}
            <div className="flex items-center justify-between border-t border-[#e8ebe8] px-3 py-2.5"><span className="text-[10px] text-[#829087]">Page {pagination.page} of {pagination.pages}</span><div className="flex gap-1"><button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5e5] text-[#4a4a4a] disabled:opacity-40"><ChevronLeft className="h-4 w-4"/></button><button type="button" aria-label="Next page" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => current + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e5e5] text-[#4a4a4a] disabled:opacity-40"><ChevronRight className="h-4 w-4"/></button></div></div>
          </section>

          <section className="min-w-0 p-5 sm:p-6">
            {selected ? <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8ebe8] pb-5">
                <div className="flex items-center gap-3.5"><span className="grid h-14 w-14 place-items-center rounded-[19px] bg-gradient-to-br from-[#e5e5e5] to-[#e5e5e5] text-lg font-semibold tracking-tight text-[#2d2d2d] ring-1 ring-[#e5e5e5]">{selected.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6b6b6b]">Customer profile · {selected.branch.name}</p><h3 className="mt-1 text-xl font-semibold tracking-[-.035em] text-[#111111]">{selected.name}</h3><p className="mt-1 text-xs text-[#819087]">{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p></div></div>
                <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border-0 px-3 py-1.5 text-[10px] font-semibold ${selected.status === "ACTIVE" ? "bg-[#f5f5f5] text-[#2d2d2d]" : selected.status === "CREDIT_HOLD" ? "bg-[#fff4e5] text-[#91662c]" : "bg-[#f1f3f1] text-[#718078]"}`}><span className={`h-1.5 w-1.5 rounded-full ${selected.status === "ACTIVE" ? "bg-[#4a4a4a]" : selected.status === "CREDIT_HOLD" ? "bg-[#d3a34f]" : "bg-[#9ba69e]"}`}/>{selected.status.replace("_", " ")}</span>
                  <a href={`tel:${selected.phone}`} aria-label={`Call ${selected.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e5e5] px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-[#f5f5f5]"><Phone className="h-3.5 w-3.5"/>Call</a>
                  {selected.email ? <a href={`mailto:${selected.email}`} aria-label={`Email ${selected.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e5e5] px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-[#f5f5f5]"><Mail className="h-3.5 w-3.5"/>Email</a> : null}
                  {selected.whatsappRemindersEnabled && selected.whatsappConsentAt ? <a href={`https://wa.me/${selected.phone.replace(/\D/g, "").replace(/^0/, "254")}`} target="_blank" rel="noreferrer" aria-label={`Open WhatsApp chat with ${selected.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-[#e5e5e5]">WhatsApp</a> : null}
                  {selected.activePlanCount > 0 ? <a href="#customer-lipa-heading" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-[#e5e5e5]">Lipa accounts</a> : null}
                  <Link href={`/sales?customer=${selected.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 text-[11px] font-semibold text-white hover:bg-[#1a1a1a]"><Plus className="h-3.5 w-3.5"/>Start sale</Link>
                  {(session?.user.role === "OWNER" || session?.user.role === "BRANCH_MANAGER") ? <button type="button" onClick={() => setEditingProfile((value) => !value)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e5e5] px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-[#f5f5f5]"><Pencil className="h-3.5 w-3.5"/>{editingProfile ? "Close" : "Edit"}</button> : null}
                </div>
              </div>
              {editingProfile ? <form key={selected.id} onSubmit={saveCustomerProfile} className="my-4 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-4"><div className="mb-3"><h4 className="text-sm font-semibold text-[#1a1a1a]">Edit customer details</h4><p className="mt-1 text-[10px] text-[#7c887f]">Customer status and credit limit changes are restricted to managers and owners.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><label className="text-[11px] font-medium text-[#617066]">Full name<input name="name" required minLength={2} maxLength={120} defaultValue={selected.name} className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm"/></label><label className="text-[11px] font-medium text-[#617066]">Phone<input name="phone" required minLength={7} maxLength={30} defaultValue={selected.phone} className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm"/></label><label className="text-[11px] font-medium text-[#617066]">Email<input name="email" type="email" maxLength={254} defaultValue={selected.email ?? ""} className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm"/></label><label className="text-[11px] font-medium text-[#617066]">Credit limit (KES)<input name="creditLimit" type="number" min="0" step="1" defaultValue={selected.creditLimit} className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm"/></label><label className="text-[11px] font-medium text-[#617066]">Account status<select name="status" defaultValue={selected.status} className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="CREDIT_HOLD">Credit hold</option></select></label></div><div className="mt-3 flex justify-end"><button disabled={saving} className="rounded-lg bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button></div></form> : null}
              <div className="grid gap-2.5 border-b border-[#e8ebe8] py-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#6b6b6b]">Open Lipa balance</p><p className="mt-2 truncate text-[17px] font-bold tracking-tight text-[#2d2d2d]">{money(selected.openBalance)}</p><p className="mt-1 text-[10px] text-[#879187]">{selected.activePlanCount} active plan{selected.activePlanCount === 1 ? "" : "s"}</p></div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Next payment</p><p className="mt-2 text-sm font-bold text-[#1a1a1a]">{selected.nextDueDate ? new Date(selected.nextDueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "No payment due"}</p><p className="mt-1 text-[10px] text-[#879187]">{selected.overduePlanCount ? `${selected.overduePlanCount} late plan${selected.overduePlanCount === 1 ? "" : "s"} · review needed` : "Based on open Lipa plans"}</p></div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Lifetime purchases</p><p className="mt-2 text-[17px] font-bold tracking-tight text-[#1a1a1a]">{selected._count.sales}</p><p className="mt-1 text-[10px] text-[#879187]">{selected._count.creditPlans} Lipa plan{selected._count.creditPlans === 1 ? "" : "s"} · all time</p></div>
                <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><p className="text-[9px] font-semibold uppercase tracking-[.11em] text-[#8a978e]">Credit limit · reliability</p><p className="mt-2 text-sm font-bold text-[#1a1a1a]">{money(selected.creditLimit)}</p><p className="mt-1 text-[10px] text-[#879187]">Payment history score {selected.reliabilityScore} / 100</p></div>
              </div>
              <section className="mt-5 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#f5f5f5]" aria-labelledby="customer-lipa-heading">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] bg-white px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f5f5f5] text-[#2d2d2d]"><CreditCard className="h-4 w-4"/></span><div><h4 id="customer-lipa-heading" className="text-sm font-semibold text-[#1a1a1a]">Lipa Mdogo Mdogo</h4><p className="mt-1 text-[10px] text-[#879187]">Repayments, due dates and account activity for {selected.name}</p></div></div>
                  {!accountsLoading && !accountsError ? <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold text-[#66756a]">{creditAccounts.length} account{creditAccounts.length === 1 ? "" : "s"}</span> : null}
                </div>
                {accountsLoading ? <p className="px-5 py-8 text-center text-xs text-[#879187]">Loading payment history…</p> : accountsError && !creditAccounts.length ? <p role="alert" className="m-4 rounded-lg border border-[#f0ded8] bg-[#fffaf8] px-3 py-2.5 text-xs text-[#914c3d]">{accountsError}</p> : creditAccounts.length ? <div className="space-y-3 p-3 sm:p-4">
                  {accountsError ? <p role="status" className="rounded-lg bg-[#fffaf0] px-3 py-2 text-[10px] text-[#8a6938]">Showing the latest saved activity. Live refresh is temporarily unavailable.</p> : null}
                  {creditAccounts.map((account) => {
                    const { totalObligation, paidToDate: repaid, percent: progressPercent } = creditProgress(account.totalAmount, account.balance, account.lateFeeAmount);
                    const paidInstallments = account.installments.filter((installment) => installment.paidAt).length;
                    const overdueInstallments = account.installments.filter((installment) => !installment.paidAt && nairobiDay(installment.dueDate) < nairobiDay(new Date()));
                    const alertRequests = account.paymentRequests.filter((request) => request.status === "REVIEW" || request.status === "PROCESSING");
                    const paymentHistory = [
                      ...(account.sale?.payments ?? []).map((payment) => ({ ...payment, paymentKind: "Deposit" })),
                      ...account.payments.map((payment) => ({ ...payment, paymentKind: "Installment" })),
                    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
                    return <article key={account.id} className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5e5e5] p-4">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h5 className="truncate text-[13px] font-semibold text-[#1a1a1a]">{account.product.name}</h5><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${account.status === "PAID_OFF" ? "bg-[#f5f5f5] text-[#758177]" : account.status === "OVERDUE" || overdueInstallments.length ? "bg-[#fff0ed] text-[#a35442]" : "bg-[#f5f5f5] text-[#2d2d2d]"}`}>{account.status === "PAID_OFF" ? "Paid off" : overdueInstallments.length ? "Payment overdue" : account.status.replace("_", " ")}</span></div><p className="mt-1 text-[10px] text-[#879187]">{account.branch.name} · {account.product.sku} · {account.termMonths}-month plan · started {new Date(account.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}{account.imei ? ` · IMEI ${account.imei}` : ""}</p></div>
                        <div className="text-left sm:text-right"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-[#8a978e]">Balance remaining</p><p className="mt-1 text-lg font-bold tracking-tight text-[#1a1a1a]">{money(account.balance)}</p></div>
                      </div>
                      <div className="px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3 text-[10px]"><span className="font-medium text-[#637267]">{money(repaid)} paid of {money(totalObligation)}{account.lateFeeAmount ? ` · includes ${money(account.lateFeeAmount)} late fee` : ""}</span><span className="text-[#879187]">{paidInstallments} / {account.installmentCount} installments</span></div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e5e5]"><div className="h-full rounded-full bg-[#6b6b6b] transition-all" style={{ width: `${progressPercent}%` }}/></div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="inline-flex items-center gap-1.5 text-[10px] text-[#758177]"><CalendarClock className="h-3.5 w-3.5"/>{account.status === "PAID_OFF" ? "No balance due" : `Next due ${new Date(account.nextDueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`}</p><Link href={`/credit?account=${account.id}`} className="inline-flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] px-2.5 py-1.5 text-[10px] font-semibold text-[#2d2d2d] hover:bg-[#f5f5f5]">Open account in Lipa<ArrowRight className="h-3 w-3"/></Link></div>
                      </div>
                      <div className="grid border-t border-[#e5e5e5] lg:grid-cols-2">
                        <div className="border-b border-[#e5e5e5] p-4 lg:border-b-0 lg:border-r"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.13em] text-[#88948a]">Installment schedule</p><div className="max-h-44 space-y-1 overflow-y-auto">{account.installments.map((installment) => <div key={installment.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f5f5] px-2.5 py-2"><span className="min-w-0"><span className="block text-[10px] font-medium text-[#2d2d2d]">Payment {installment.sequence} · {new Date(installment.dueDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>{installment.paidAmount > 0 && installment.paidAmount < installment.amount ? <span className="mt-0.5 block text-[9px] text-[#829087]">Part paid: {money(installment.paidAmount)}</span> : null}</span><span className={`shrink-0 text-[10px] font-semibold ${installment.paidAt ? "text-[#2d2d2d]" : new Date(installment.dueDate) < new Date() ? "text-[#a35442]" : "text-[#69766c]"}`}>{installment.paidAt ? "Paid" : money(installment.amount - installment.paidAmount)}</span></div>)}</div></div>
                        <div className="p-4"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.13em] text-[#88948a]">Payment history <span className="font-normal normal-case tracking-normal">· latest {paymentHistory.length}</span></p>{paymentHistory.length ? <div className="max-h-44 divide-y divide-[#e5e5e5] overflow-y-auto">{paymentHistory.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0"><span className="block text-[10px] font-medium text-[#2d2d2d]">{new Date(payment.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} · {payment.paymentKind} · {payment.method}</span><span className="mt-0.5 block truncate text-[9px] text-[#89948b]">{payment.reference ? `Reference ${payment.reference}` : "No transaction reference"}</span></span><span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#1a1a1a]">{money(payment.amount)}</span></div>)}</div> : <p className="py-4 text-[10px] text-[#89948b]">No payments recorded yet.</p>}</div>
                      </div>
                      {account.paymentSubmissions.length || alertRequests.length ? <div className="border-t border-[#f0e8dc] bg-[#fffdf8] px-4 py-3">{account.paymentSubmissions.map((submission) => <p key={submission.id} className="text-[10px] text-[#8a6938]">Reference {submission.reference} for {money(submission.amount)} is waiting for verification.</p>)}{alertRequests.map((request) => <p key={request.id} className="text-[10px] text-[#8a6938]">{request.status === "REVIEW" ? "M-Pesa payment needs reconciliation" : "M-Pesa payment is processing"} · {money(request.amount)}{request.mpesaReceipt ? ` · Receipt ${request.mpesaReceipt}` : ""}</p>)}</div> : null}
                    </article>;
                  })}
                </div> : <div className="px-5 py-7 text-center"><p className="text-xs font-semibold text-[#2d2d2d]">No Lipa accounts for this customer</p><p className="mt-1 text-[10px] text-[#89948b]">When this customer purchases on installments, their balance and payment history will appear here.</p></div>}
              </section>
              <form onSubmit={saveReminderPreferences} className="mt-5 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-[#1a1a1a]">Payment reminder preferences</h4><p className="mt-1 max-w-xl text-[11px] leading-5 text-[#79837a]">Enable only the channels this customer has agreed to use. These are service reminders about their payment plan.</p></div><button disabled={saving} className="rounded-lg bg-[#1a1a1a] px-3.5 py-2 text-[11px] font-semibold text-white disabled:opacity-60">Save preferences</button></div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2"><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="smsRemindersEnabled" type="checkbox" defaultChecked={selected.smsRemindersEnabled} className="accent-[#1a1a1a]"/> SMS · {selected.phone}</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="emailRemindersEnabled" type="checkbox" defaultChecked={selected.emailRemindersEnabled} disabled={!selected.email} className="accent-[#1a1a1a]"/> Email{selected.email ? ` · ${selected.email}` : " · add an email first"}</label><label className="flex items-center gap-2 text-xs text-[#526057]"><input name="whatsappRemindersEnabled" type="checkbox" defaultChecked={selected.whatsappRemindersEnabled} className="accent-[#1a1a1a]"/> WhatsApp · {selected.phone}</label></div>
                {selected.remindersConsentAt ? <p className="mt-2 text-[10px] text-[#92988f]">SMS/email consent recorded {new Date(selected.remindersConsentAt).toLocaleDateString("en-KE")}</p> : null}{selected.whatsappConsentAt ? <p className="mt-1 text-[10px] text-[#92988f]">WhatsApp consent recorded {new Date(selected.whatsappConsentAt).toLocaleDateString("en-KE")}</p> : null}
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
