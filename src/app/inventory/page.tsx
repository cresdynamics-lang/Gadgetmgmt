"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";

type InventoryItem = {
  id: string;
  stockOnHand: number;
  reservedStock: number;
  reorderLevel: number;
  lastUpdatedAt: string;
  product: { id: string; sku: string; name: string; category: string; brand: string | null; costPrice: number; sellingPrice: number };
};

type Movement = {
  id: string;
  type: "RECEIPT" | "SALE" | "ADJUSTMENT";
  quantity: number;
  reference: string | null;
  createdAt: string;
  product: { name: string; sku: string };
  user: { name: string };
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [addingProduct, setAddingProduct] = useState(false);

  async function refreshInventory() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load inventory.");
    setItems(data.items);
    setMovements(data.movements);
  }

  useEffect(() => {
    async function loadInventory() {
      try {
        await refreshInventory();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load inventory.");
      } finally {
        setLoading(false);
      }
    }

    void loadInventory();
  }, []);

  const filteredItems = useMemo(() => items.filter((item) => `${item.product.name} ${item.product.sku} ${item.product.category}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const stockUnits = items.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStockCount = items.filter((item) => item.stockOnHand - item.reservedStock <= item.reorderLevel).length;
  const stockValue = items.reduce((sum, item) => sum + item.stockOnHand * item.product.costPrice, 0);

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: data.get("productId"), quantity: Number(data.get("quantity")), reference: data.get("reference"), note: data.get("note") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      await refreshInventory();
      form.reset();
      setReceiving(false);
      setNotice("Stock received and recorded in the movement ledger.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Stock receipt failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setUpProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: data.get("sku"),
          name: data.get("name"),
          category: data.get("category"),
          brand: data.get("brand"),
          costPrice: Number(data.get("costPrice")),
          sellingPrice: Number(data.get("sellingPrice")),
          reorderLevel: Number(data.get("reorderLevel")),
          openingStock: Number(data.get("openingStock")),
          reference: data.get("reference"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Product could not be created.");
      await refreshInventory();
      form.reset();
      setAddingProduct(false);
      setNotice(`${result.name} (${result.sku}) was added to this branch.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Product could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Stock control</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Inventory</h2></div>
          <button type="button" onClick={() => { setReceiving((current) => !current); setError(""); }} disabled={!items.length} className="inline-flex items-center gap-2 bg-[#173a2b] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#24513a] disabled:opacity-40"><ArrowDownToLine className="h-4 w-4" /> Receive stock</button>
          <button type="button" onClick={() => { setAddingProduct((current) => !current); setError(""); }} className="border border-[#cbd5cc] px-3.5 py-2.5 text-sm font-semibold text-[#284a34] hover:bg-[#edf3e9]">Add product</button>
        </div>

        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

        <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-3">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">Units on hand</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : stockUnits.toLocaleString("en-KE")}</p></div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r"><p className="text-xs text-[#69746c]">At or below reorder level</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : lowStockCount}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[#69746c]">Cost value · listed stock</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : money(stockValue)}</p></div>
        </div>

        {receiving ? <form onSubmit={receiveStock} className="border border-[#dfe4df] bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold">Receive supplier stock</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium text-[#526057]">Product<select name="productId" required className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm text-[#17211b]"><option value="">Choose product</option>{items.map((item) => <option key={item.product.id} value={item.product.id}>{item.product.name} · {item.product.sku}</option>)}</select></label>
            <label className="text-xs font-medium text-[#526057]">Quantity received<input name="quantity" type="number" min="1" max="10000" step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Supplier invoice / reference<input name="reference" maxLength={100} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Note <span className="font-normal">(optional)</span><input name="note" maxLength={300} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReceiving(false)} className="border border-[#d6ddd6] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#173a2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Recording…" : "Record receipt"}</button></div>
        </form> : null}

        {addingProduct ? <form onSubmit={setUpProduct} className="border border-[#dfe4df] bg-white p-4">
          <h3 className="mb-4 text-sm font-semibold">Set up a product at this branch</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium text-[#526057]">Product name<input name="name" required minLength={2} maxLength={160} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">SKU<input name="sku" required minLength={2} maxLength={64} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm uppercase" /></label>
            <label className="text-xs font-medium text-[#526057]">Category<input name="category" required minLength={2} maxLength={80} placeholder="Smartphone, accessory…" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">Brand <span className="font-normal">(optional)</span><input name="brand" maxLength={80} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">Cost price (KES)<input name="costPrice" type="number" min="0" max="2000000000" step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">Selling price (KES)<input name="sellingPrice" type="number" min="1" max="2000000000" step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">Reorder level<input name="reorderLevel" type="number" min="0" max="100000" step="1" defaultValue="0" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057]">Opening stock<input name="openingStock" type="number" min="0" max="100000" step="1" defaultValue="0" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-medium text-[#526057] sm:col-span-2">Supplier invoice / opening-stock reference <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAddingProduct(false)} className="border border-[#d6ddd6] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#173a2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creating…" : "Create product"}</button></div>
        </form> : null}

        <section className="border border-[#dfe4df] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe8] p-3.5">
            <h3 className="text-sm font-semibold">Branch stock</h3>
            <div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search inventory" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or category" className="w-full border border-[#d6ddd6] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#315d3f]" /></div>
          </div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">SKU</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 text-right font-medium">On hand</th><th className="px-4 py-3 text-right font-medium">Reserved</th><th className="px-4 py-3 text-right font-medium">Available</th><th className="px-4 py-3 text-right font-medium">Cost</th><th className="px-4 py-3 font-medium">Stock status</th></tr></thead>
            <tbody className="divide-y divide-[#edf0ed]">
              {loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading live branch stock…</td></tr> : filteredItems.map((item) => {
                const available = item.stockOnHand - item.reservedStock;
                const low = available <= item.reorderLevel;
                return <tr key={item.id} className="hover:bg-[#f9faf8]"><td className="px-4 py-3 font-medium">{item.product.name}</td><td className="px-4 py-3 font-mono text-xs text-[#69746c]">{item.product.sku}</td><td className="px-4 py-3 text-[#69746c]">{item.product.category}</td><td className="px-4 py-3 text-right tabular-nums">{item.stockOnHand}</td><td className="px-4 py-3 text-right tabular-nums">{item.reservedStock}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{available}</td><td className="px-4 py-3 text-right tabular-nums">{money(item.product.costPrice)}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-xs ${low ? "text-[#995338]" : "text-[#42684a]"}`}><span className={`h-1.5 w-1.5 ${low ? "bg-[#bd724e]" : "bg-[#739464]"}`} />{low ? "Reorder" : "In stock"}</span></td></tr>;
              })}
              {!loading && !filteredItems.length ? <tr><td colSpan={8} className="px-4 py-9 text-center"><p className="text-sm font-semibold">{items.length ? "No matching stock records" : "No stock records for this branch"}</p><p className="mt-1 text-sm text-[#69746c]">{items.length ? "Try another search." : "Products must be configured for this branch before stock can be received."}</p></td></tr> : null}
            </tbody>
          </table></div>
        </section>

        <section className="border border-[#dfe4df] bg-white">
          <div className="flex items-center justify-between border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent stock movements</h3><span className="text-xs text-[#69746c]">Latest 20</span></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Movement</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 text-right font-medium">Units</th><th className="px-4 py-3 font-medium">Recorded by</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">
            {movements.map((movement) => <tr key={movement.id}><td className="px-4 py-3 text-[#69746c]">{new Date(movement.createdAt).toLocaleString("en-KE")}</td><td className="px-4 py-3">{movement.type === "RECEIPT" ? "Receipt" : movement.type === "SALE" ? "Sale" : "Adjustment"}</td><td className="px-4 py-3 font-medium">{movement.product.name}</td><td className="px-4 py-3 font-mono text-xs text-[#69746c]">{movement.reference ?? "—"}</td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${movement.quantity > 0 ? "text-[#42684a]" : "text-[#8a5149]"}`}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td><td className="px-4 py-3 text-[#69746c]">{movement.user.name}</td></tr>)}
            {!loading && !movements.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[#69746c]">No recorded stock movements yet.</td></tr> : null}
          </tbody></table></div>
        </section>
      </div>
    </AppShell>
  );
}
