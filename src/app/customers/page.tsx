"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, UserRoundPlus } from "lucide-react";

import { AppShell } from "@/components/app-shell";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: "ACTIVE" | "INACTIVE" | "CREDIT_HOLD";
  creditLimit: number;
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

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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
            <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="border border-[#d6ddd6] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#173a2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save customer"}</button></div>
          </form>
        ) : null}

        <div className="grid min-h-[520px] border border-[#dfe4df] bg-white lg:grid-cols-[330px_minmax(0,1fr)]">
          <section className="border-b border-[#dfe4df] lg:border-b-0 lg:border-r">
            <div className="border-b border-[#e8ebe8] p-3">
              <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search customers" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone or email" className="w-full border border-[#d6ddd6] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#315d3f]" /></div>
            </div>
            {loading ? <p className="p-5 text-sm text-[#69746c]">Loading customer records…</p> : filtered.length ? (
              <div className="max-h-[600px] divide-y divide-[#e8ebe8] overflow-y-auto">
                {filtered.map((customer) => <button key={customer.id} type="button" onClick={() => setSelectedId(customer.id)} className={`w-full px-4 py-3 text-left hover:bg-[#f6f8f5] ${selected?.id === customer.id ? "border-l-2 border-[#315d3f] bg-[#f1f5ee]" : "border-l-2 border-transparent"}`}>
                  <span className="block text-sm font-semibold">{customer.name}</span><span className="mt-1 block text-xs text-[#69746c]">{customer.phone}</span><span className="mt-2 flex items-center justify-between text-[11px] text-[#69746c]"><span>{customer.branch.name}</span><span>{customer._count.sales} sales</span></span>
                </button>)}
              </div>
            ) : <div className="p-5"><p className="text-sm font-semibold">{customers.length ? "No matching customers" : "No customer records yet"}</p><p className="mt-1 text-sm text-[#69746c]">{customers.length ? "Try another search." : "Create a customer record to attach purchases and account history."}</p></div>}
          </section>

          <section className="min-w-0 p-5 sm:p-6">
            {selected ? <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8ebe8] pb-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#607266]">Customer profile</p><h3 className="mt-1 text-xl font-semibold">{selected.name}</h3><p className="mt-1 text-sm text-[#69746c]">{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p></div>
                <span className={`border px-2 py-1 text-xs font-medium ${selected.status === "ACTIVE" ? "border-[#c8d8bf] bg-[#f1f6ed] text-[#31533a]" : selected.status === "CREDIT_HOLD" ? "border-[#e5c7a9] bg-[#fff7eb] text-[#815324]" : "border-[#dfe4df] bg-[#f4f5f2] text-[#69746c]"}`}>{selected.status.replace("_", " ")}</span>
              </div>
              <div className="grid gap-3 border-b border-[#e8ebe8] py-5 sm:grid-cols-4">
                <div><p className="text-xs text-[#69746c]">Branch</p><p className="mt-1 text-sm font-medium">{selected.branch.name}</p></div>
                <div><p className="text-xs text-[#69746c]">Lifetime transactions</p><p className="mt-1 text-sm font-medium">{selected._count.sales}</p></div>
                <div><p className="text-xs text-[#69746c]">Credit plans</p><p className="mt-1 text-sm font-medium">{selected._count.creditPlans}</p></div>
                <div><p className="text-xs text-[#69746c]">Credit limit</p><p className="mt-1 text-sm font-medium">{money(selected.creditLimit)}</p></div>
              </div>
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
