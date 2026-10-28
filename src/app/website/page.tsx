"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";

type Listing = {
  id: string;
  sku: string;
  name: string;
  category: string;
  configuration: string | null;
  condition: string;
  colour: string | null;
  productGroup: string | null;
  websiteProductId: string | null;
  websiteVariantKey: string | null;
  sellingPrice: number;
  costPrice: number | null;
  showOnWebsite: boolean;
  available: number;
  stockOnHand: number;
};

type WebsiteOrder = {
  id: string;
  externalId: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillment: string;
  subtotalKes: number;
  catalogKes: number;
  paidAmount: number;
  paymentMethod: string | null;
  paymentRef: string | null;
  paidAt: string | null;
  createdAt: string;
  items: { name: string; qty: number; kes: number }[];
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function WebsiteCatalogPage() {
  const [tab, setTab] = useState<"catalog" | "orders">("catalog");
  const [items, setItems] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canEditPrices, setCanEditPrices] = useState(false);
  const [canToggleWebsite, setCanToggleWebsite] = useState(false);
  const [priceDraft, setPriceDraft] = useState<{ productId: string; sellingPrice: string } | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);
  const [togglingId, setTogglingId] = useState("");

  async function loadCatalog() {
    const response = await fetch("/api/website/listings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load the website catalog.");
    setItems(data.items);
    setCanEditPrices(Boolean(data.canEditPrices));
    setCanToggleWebsite(Boolean(data.canToggleWebsite));
  }

  async function loadOrders() {
    const response = await fetch("/api/website/orders", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load website orders.");
    setOrders(data.orders);
  }

  useEffect(() => {
    async function load() {
      try {
        await Promise.all([loadCatalog(), loadOrders()]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load website data.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = useMemo(
    () => items.filter((item) => `${item.name} ${item.sku} ${item.category} ${item.websiteProductId ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );
  const listedCount = items.filter((item) => item.showOnWebsite).length;

  async function savePrice() {
    if (!priceDraft) return;
    setSavingPrice(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/website/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: priceDraft.productId, sellingPrice: Math.trunc(Number(priceDraft.sellingPrice)) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The price could not be saved.");
      setItems((current) => current.map((item) => item.id === result.id ? { ...item, sellingPrice: result.sellingPrice } : item));
      setPriceDraft(null);
      setNotice("Price saved. gadgethubke.com uses this price on the next catalog refresh.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The price could not be saved.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function toggleWebsite(item: Listing) {
    setTogglingId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/website/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.id, showOnWebsite: !item.showOnWebsite }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Website visibility could not be saved.");
      setItems((current) => current.map((row) => row.id === result.id ? { ...row, showOnWebsite: result.showOnWebsite } : row));
      setNotice(result.showOnWebsite ? `${item.name} is now listed on gadgethubke.com.` : `${item.name} is hidden from gadgethubke.com.`);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Website visibility could not be saved.");
    } finally {
      setTogglingId("");
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Public store</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Website catalog</h2>
            <p className="mt-1 text-sm text-[#69746c]">Prices and the On website / Hidden buttons here are what gadgethubke.com shows. Inventory stock decides whether a listed item is in stock.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#69746c]"><Globe className="h-4 w-4" />{loading ? "—" : `${listedCount} listed · ${items.length} mapped`}</div>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("catalog")} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === "catalog" ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d]"}`}>Catalog</button>
          <button type="button" onClick={() => setTab("orders")} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === "orders" ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d]"}`}>Website orders</button>
        </div>

        {tab === "catalog" ? (
          <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe8] p-3.5">
              <h3 className="text-sm font-semibold">Live website prices</h3>
              <div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search website catalog" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or model" className="w-full border border-[#c4c4c4] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#1a1a1a]" /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Condition</th>
                    <th className="px-4 py-3 font-medium">Website id</th>
                    <th className="px-4 py-3 text-right font-medium">Available</th>
                    <th className="px-4 py-3 text-right font-medium">Selling price</th>
                    <th className="px-4 py-3 font-medium">Website</th>
                    {canEditPrices ? <th className="px-4 py-3"><span className="sr-only">Price</span></th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {loading ? <tr><td colSpan={canEditPrices ? 8 : 7} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading website catalog…</td></tr> : filtered.map((item) => {
                    const editing = priceDraft?.productId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-[#f5f5f5]">
                        <td className="px-4 py-3 font-medium">{item.name}<span className="mt-1 block font-mono text-[10px] font-normal text-[#69746c]">{item.sku}</span></td>
                        <td className="px-4 py-3 text-[#69746c]">{item.category}</td>
                        <td className="px-4 py-3 text-[#69746c]">{item.condition === "EX_UK" ? "Ex-UK" : "New"}{item.colour ? ` · ${item.colour}` : ""}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#69746c]">{item.websiteProductId}/{item.websiteVariantKey}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.available}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{editing ? <input autoFocus aria-label={`Selling price for ${item.name}`} type="number" inputMode="numeric" min={1} value={priceDraft.sellingPrice} onChange={(event) => setPriceDraft({ ...priceDraft, sellingPrice: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void savePrice(); if (event.key === "Escape") setPriceDraft(null); }} className="h-10 w-28 rounded-lg border border-[#111111] px-2 text-right text-sm font-semibold" /> : money(item.sellingPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-2">{canToggleWebsite ? <button type="button" disabled={togglingId === item.id} onClick={() => void toggleWebsite(item)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${item.showOnWebsite ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d] hover:bg-white"}`}>{togglingId === item.id ? "Saving…" : item.showOnWebsite ? "On website" : "Hidden"}</button> : <span className="text-xs text-[#69746c]">{item.showOnWebsite ? "On website" : "Hidden"}</span>}</td>
                        {canEditPrices ? <td className="whitespace-nowrap px-4 py-2 text-right">{editing ? <span className="inline-flex gap-1.5"><button type="button" disabled={savingPrice || !(Number(priceDraft.sellingPrice) > 0)} onClick={() => void savePrice()} className="min-h-10 rounded-lg bg-[#111111] px-3 text-xs font-semibold text-white disabled:opacity-50">{savingPrice ? "Saving…" : "Save"}</button><button type="button" onClick={() => setPriceDraft(null)} className="min-h-10 rounded-lg border border-[#c4c4c4] px-3 text-xs font-semibold">Cancel</button></span> : <button type="button" onClick={() => setPriceDraft({ productId: item.id, sellingPrice: String(item.sellingPrice) })} className="min-h-10 rounded-lg border border-[#c4c4c4] px-3 text-xs font-semibold text-[#2d2d2d] hover:bg-white">Edit price</button>}</td> : null}
                      </tr>
                    );
                  })}
                  {!loading && !filtered.length ? <tr><td colSpan={canEditPrices ? 8 : 7} className="px-4 py-9 text-center text-sm text-[#69746c]">No website-mapped products yet. Run npm run db:sync-website-catalog.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Orders from gadgethubke.com</h3></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading website orders…</td></tr> : orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 font-mono text-xs">{order.externalId}<span className="mt-1 block text-[10px] text-[#69746c]">{new Date(order.createdAt).toLocaleString("en-KE")}</span></td>
                      <td className="px-4 py-3">{order.customerName}<span className="mt-1 block text-xs text-[#69746c]">{order.customerPhone}</span></td>
                      <td className="px-4 py-3 text-xs text-[#69746c]">{order.items.map((item) => `${item.qty}× ${item.name}`).join(", ")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(order.subtotalKes)}</td>
                      <td className="px-4 py-3 text-xs">{order.paymentMethod || "—"}{order.paymentRef ? <span className="mt-1 block font-mono text-[10px] text-[#69746c]">{order.paymentRef}</span> : null}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${order.status === "paid" ? "bg-[#111111] text-white" : "bg-[#f5f5f5] text-[#2d2d2d]"}`}>{order.status}</span></td>
                    </tr>
                  ))}
                  {!loading && !orders.length ? <tr><td colSpan={6} className="px-4 py-9 text-center text-sm text-[#69746c]">No website checkouts have been copied here yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
