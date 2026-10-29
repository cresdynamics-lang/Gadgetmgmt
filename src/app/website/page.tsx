"use client";

import { useEffect, useState, type ReactNode } from "react";
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

type LiveVisitor = { id: string; device: string; page: string; path?: string; from: string; onSite: string };
type LiveRow = { label: string; count: number };
type LiveActivity = { when: string; text: string };
type LiveSnapshot = {
  now?: number;
  last5Min?: number;
  lookingAtProduct?: number;
  inCart?: number;
  atCheckout?: number;
  devices?: { Phone?: number; Tablet?: number; Computer?: number };
  visitors?: LiveVisitor[];
  sources?: LiveRow[];
  pages?: LiveRow[];
  activity?: LiveActivity[];
  today?: { visitors?: number; pageviews?: number; whatsapp?: number; cartAdds?: number };
  updatedAt?: string;
};

type WebsiteMessage = {
  id: string;
  externalId: string;
  kind: string;
  name: string;
  phone: string;
  topic: string | null;
  body: string | null;
  orderRef: string | null;
  createdAt: string;
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function WebsiteCatalogPage() {
  const [tab, setTab] = useState<"live" | "catalog" | "orders" | "messages">("live");
  const [items, setItems] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [messages, setMessages] = useState<WebsiteMessage[]>([]);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveStale, setLiveStale] = useState(true);
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
  }

  async function loadOrders() {
    const response = await fetch("/api/website/orders", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load website orders.");
    setOrders(data.orders);
  }

  async function loadLive() {
    const response = await fetch("/api/website/live", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load live visitors.");
    setLive((data.live as LiveSnapshot | null) ?? null);
    setLiveStale(Boolean(data.stale));
  }

  async function loadMessages() {
    const response = await fetch("/api/website/messages", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load website messages.");
    setMessages(data.messages);
  }

  useEffect(() => {
    async function load() {
      try {
        await Promise.all([loadCatalog(), loadOrders()]);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load website data.");
      }
      try {
        await Promise.all([loadLive(), loadMessages()]);
      } catch {
        /* Live visitors and messages are copied from the website; catalog still works if that feed is down. */
      } finally {
        setUpdatedAt(kenyaDateTime(new Date()));
        setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const listedCount = items.filter((item) => item.showOnWebsite).length;
  const today = live?.today ?? {};
  const visitors = live?.visitors ?? [];
  const sources = live?.sources ?? [];
  const pages = live?.pages ?? [];
  const activity = live?.activity ?? [];
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Operations</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Website admin</h2>
            <p className="mt-1 text-sm text-[#69746c]">This operations app is standalone. Catalog, stock and prices here stay in ops — they do not change gadgethubke.com.</p>
            {updatedAt ? <p className="mt-2 text-xs text-[#69746c]">Last refresh {updatedAt}{liveStale ? " · waiting for a live visitor ping from the website" : ""}</p> : null}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#69746c]"><Globe className="h-4 w-4" />{loading ? "—" : `${live?.now ?? 0} live · ${listedCount} listed`}</div>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="On the site now" value={live?.now ?? 0} hint={`${live?.last5Min ?? 0} in the last 5 minutes`} />
          <Stat label="Looking at a product" value={live?.lookingAtProduct ?? 0} />
          <Stat label="With items in the cart" value={live?.inCart ?? 0} />
          <Stat label="At checkout" value={live?.atCheckout ?? 0} />
          <Stat label="Visitors today" value={today.visitors ?? 0} />
          <Stat label="Pages opened today" value={today.pageviews ?? 0} />
          <Stat label="Added to cart today" value={today.cartAdds ?? 0} />
          <Stat label="WhatsApp taps today" value={today.whatsapp ?? 0} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "live"} onClick={() => setTab("live")}>Live visitors</TabButton>
          <TabButton active={tab === "catalog"} onClick={() => setTab("catalog")}>Website admin</TabButton>
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>Website orders</TabButton>
          <TabButton active={tab === "messages"} onClick={() => setTab("messages")}>Messages</TabButton>
        </div>

        {tab === "live" ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
              <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Who is here <span className="ml-2 rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#69746c]">anonymous</span></h3></div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Visitor</th>
                      <th className="px-4 py-3 font-medium">Device</th>
                      <th className="px-4 py-3 font-medium">Looking at</th>
                      <th className="px-4 py-3 font-medium">Came from</th>
                      <th className="px-4 py-3 font-medium">On site</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e5e5]">
                    {visitors.length ? visitors.map((visitor) => (
                      <tr key={`${visitor.id}-${visitor.page}`}>
                        <td className="px-4 py-3">Visitor {visitor.id}</td>
                        <td className="px-4 py-3">{visitor.device}</td>
                        <td className="px-4 py-3">{visitor.page}</td>
                        <td className="px-4 py-3 text-[#69746c]">{visitor.from}</td>
                        <td className="px-4 py-3 tabular-nums">{visitor.onSite}</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="px-4 py-9 text-center text-sm text-[#69746c]">{liveStale ? "The website has not sent a live ping yet." : "Nobody on the site right now."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
                <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Where they came from</h3></div>
                <CountTable rows={sources} empty="No visitors right now." />
              </section>
              <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
                <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Pages open now</h3></div>
                <CountTable rows={pages} empty="No visitors right now." />
              </section>
            </div>
            <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
              <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Live activity</h3></div>
              <ul className="divide-y divide-[#e5e5e5]">
                {activity.length ? activity.map((item) => (
                  <li key={`${item.when}-${item.text}`} className="flex gap-4 px-4 py-3 text-sm">
                    <span className="w-20 shrink-0 text-xs text-[#69746c]">{item.when}</span>
                    <span>{item.text}</span>
                  </li>
                )) : <li className="px-4 py-9 text-center text-sm text-[#69746c]">No activity in the last 30 minutes.</li>}
              </ul>
            </section>
          </div>
        ) : null}

        {tab === "catalog" ? (
          <InventoryUpdate
            items={updateItems}
            canEditPrices={canEditPrices}
            canToggleWebsite={canToggleWebsite}
            websiteOnlyLocked
            title="Website admin"
            description="New (KES), Ex-UK (KES) and stock for this operations branch only. Changes here do not update gadgethubke.com."
            onSaved={async () => { await Promise.all([loadCatalog(), loadOrders()]); }}
            onError={setError}
            onNotice={setNotice}
          />
        ) : null}

        {tab === "orders" ? (
          <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Website orders</h3></div>
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
        ) : null}

        {tab === "messages" ? (
          <section className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
            <div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Contact, newsletter and track-order messages</h3></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#e8ebe8] bg-[#f5f5f5] text-xs text-[#66736a]">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {loading ? <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading messages…</td></tr> : messages.map((message) => (
                    <tr key={message.id}>
                      <td className="px-4 py-3 text-xs text-[#69746c]">{kenyaDateTime(message.createdAt)}</td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase">{message.kind}</td>
                      <td className="px-4 py-3">{message.name}<span className="mt-1 block text-xs text-[#69746c]">{message.phone}</span></td>
                      <td className="px-4 py-3 text-sm">{message.topic || message.orderRef || message.body || "—"}<span className="mt-1 block text-xs text-[#69746c]">{message.body && (message.topic || message.orderRef) ? message.body : ""}</span></td>
                    </tr>
                  ))}
                  {!loading && !messages.length ? <tr><td colSpan={4} className="px-4 py-9 text-center text-sm text-[#69746c]">No website messages have been copied here yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4">
      <p className="text-xs text-[#69746c]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#69746c]">{hint}</p> : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${active ? "bg-[#111111] text-white" : "border border-[#c4c4c4] text-[#2d2d2d]"}`}>{children}</button>
  );
}

function CountTable({ rows, empty }: { rows: LiveRow[]; empty: string }) {
  return (
    <table className="min-w-full text-left text-sm">
      <tbody className="divide-y divide-[#e5e5e5]">
        {rows.length ? rows.map((row) => (
          <tr key={row.label}>
            <td className="px-4 py-3">{row.label}</td>
            <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.count}</td>
          </tr>
        )) : <tr><td className="px-4 py-9 text-center text-sm text-[#69746c]">{empty}</td></tr>}
      </tbody>
    </table>
  );
}
