"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { InventoryUpdate } from "@/components/inventory-update";
import { kenyaDateTime } from "@/lib/kenya-time";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [canEditPrices, setCanEditPrices] = useState(false);
  const [canToggleWebsite, setCanToggleWebsite] = useState(false);

  async function loadCatalog() {
    const response = await fetch("/api/website/listings", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load the website catalog.");
    setItems(data.items);
    setCanEditPrices(Boolean(data.canEditPrices));
    setCanToggleWebsite(Boolean(data.canToggleWebsite));
    setUpdatedAt(kenyaDateTime(new Date()));
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
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load website data.");
      } finally {
        setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const listedCount = items.filter((item) => item.showOnWebsite).length;
  const updateItems = items.map((item) => ({
    stockOnHand: item.stockOnHand,
    reservedStock: Math.max(0, item.stockOnHand - item.available),
    product: {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      condition: item.condition,
      colour: item.colour,
      configuration: item.configuration,
      productGroup: item.productGroup,
      sellingPrice: item.sellingPrice,
      showOnWebsite: item.showOnWebsite,
      websiteProductId: item.websiteProductId,
      websiteVariantKey: item.websiteVariantKey,
    },
  }));

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Public store</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Website admin</h2>
            <p className="mt-1 text-sm text-[#69746c]">This is the live gadgethubke.com catalog: New and Ex-UK prices, stock and On website / Hidden. Same fields as website admin. Inventory Update writes the same data.</p>
            {updatedAt ? <p className="mt-2 text-xs text-[#69746c]">Last refresh {updatedAt} · updates every 5 seconds</p> : null}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#69746c]"><Globe className="h-4 w-4" />{loading ? "—" : `${listedCount} listed · ${items.length} mapped`}</div>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("catalog")} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === "catalog" ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d]"}`}>Website admin</button>
          <button type="button" onClick={() => setTab("orders")} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === "orders" ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d]"}`}>Website orders</button>
        </div>

        {tab === "catalog" ? (
          <InventoryUpdate
            items={updateItems}
            canEditPrices={canEditPrices}
            canToggleWebsite={canToggleWebsite}
            websiteOnlyLocked
            title="Website admin"
            description="New (KES), Ex-UK (KES), stock and On website / Hidden — the same live data gadgethubke.com uses."
            onSaved={async () => { await Promise.all([loadCatalog(), loadOrders()]); }}
            onError={setError}
            onNotice={setNotice}
          />
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
                      <td className="px-4 py-3 font-mono text-xs">{order.externalId}<span className="mt-1 block text-[10px] text-[#69746c]">{kenyaDateTime(order.createdAt)}</span></td>
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
