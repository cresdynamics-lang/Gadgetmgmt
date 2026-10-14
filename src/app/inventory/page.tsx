"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, Check, Download, FileText, Package, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { downloadInventoryReceipt, type InventoryReceiptData } from "@/lib/receipt-pdf";

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
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [lastReceipt, setLastReceipt] = useState<InventoryReceiptData | null>(null);

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
  const receiveMatches = useMemo(() => items.filter((item) => `${item.product.name} ${item.product.sku} ${item.product.category} ${item.product.brand ?? ""}`.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 30), [items, productSearch]);
  const selectedProduct = items.find((item) => item.product.id === selectedProductId) ?? null;
  const stockUnits = items.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStockCount = items.filter((item) => item.stockOnHand - item.reservedStock <= item.reorderLevel).length;
  const stockValue = items.reduce((sum, item) => sum + item.stockOnHand * item.product.costPrice, 0);

  async function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setError("Search for and select a product before recording the stock receipt.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProductId, quantity: Number(data.get("quantity")), reference: data.get("reference"), note: data.get("note") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      const quantity = Number(data.get("quantity"));
      setLastReceipt({
        id: result.movement.id,
        createdAt: result.movement.createdAt,
        branchName: result.branchName,
        receivedBy: result.receivedBy,
        reference: result.reference,
        note: result.note,
        quantity,
        previousStock: result.previousStock,
        newStock: result.stockOnHand,
        product: selectedProduct!.product,
      });
      await refreshInventory();
      form.reset();
      setSelectedProductId("");
      setProductSearch("");
      setReceiving(false);
      setNotice("Stock received and recorded. Your goods received note is ready to download.");
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

        {lastReceipt ? <section className="inventory-receipt-ready flex flex-wrap items-center justify-between gap-4 border border-[#dce8de] bg-white p-4 sm:px-5" role="status">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e7f1e9] text-[#397a67]"><FileText className="h-4.5 w-4.5"/></span><div className="min-w-0"><p className="text-sm font-semibold text-[#2e4034]">Goods received note is ready</p><p className="mt-1 truncate text-xs text-[#77847a]">GRN-{lastReceipt.id.slice(-8).toUpperCase()} · {lastReceipt.product.name} · +{lastReceipt.quantity} units</p></div></div>
          <button type="button" onClick={() => downloadInventoryReceipt(lastReceipt)} className="inline-flex items-center gap-2 rounded-lg bg-[#244d3f] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#326653]"><Download className="h-3.5 w-3.5"/>Download receipt</button>
        </section> : null}

        {receiving ? <form onSubmit={receiveStock} className="inventory-receive-form border border-[#dfe4df] bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf4ef] text-[#45755d]"><Package className="h-4 w-4"/></span><div><h3 className="text-sm font-semibold text-[#2d4134]">Receive supplier stock</h3><p className="mt-1 text-xs text-[#7e897f]">Search the catalog, record quantities, and create a downloadable goods received note.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative text-xs font-medium text-[#526057] sm:col-span-2 xl:col-span-1" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setProductPickerOpen(false); }}>
              <label htmlFor="receive-product-search">Product</label>
              <div className="relative mt-1.5"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#849187]"/><input id="receive-product-search" role="combobox" aria-autocomplete="list" aria-expanded={productPickerOpen} aria-controls="receive-product-list" autoComplete="off" value={productSearch} onFocus={() => setProductPickerOpen(true)} onChange={(event) => { setProductSearch(event.target.value); setSelectedProductId(""); setProductPickerOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setProductPickerOpen(false); if (event.key === "Enter" && productPickerOpen && receiveMatches.length) { event.preventDefault(); setSelectedProductId(receiveMatches[0].product.id); setProductSearch(`${receiveMatches[0].product.name} · ${receiveMatches[0].product.sku}`); setProductPickerOpen(false); } }} placeholder="Search name, SKU or brand" className="w-full rounded-lg border border-[#d6ddd6] bg-white py-2.5 pl-9 pr-3 text-sm font-normal text-[#17211b] outline-none focus:border-[#5d9275] focus:ring-2 focus:ring-[#e7f1e9]"/>
                {productPickerOpen ? <div id="receive-product-list" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-[#e0e7df] bg-white p-1.5 shadow-[0_14px_35px_rgba(31,54,41,.15)]">
                  {receiveMatches.length ? receiveMatches.map((item) => <button key={item.product.id} type="button" role="option" aria-selected={selectedProductId === item.product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedProductId(item.product.id); setProductSearch(`${item.product.name} · ${item.product.sku}`); setProductPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-[#f2f7f3] focus:bg-[#f2f7f3] focus:outline-none"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#33463a]">{item.product.name}</span><span className="mt-1 block truncate text-[10px] text-[#819087]">{item.product.sku} · {item.product.brand || item.product.category} · {item.stockOnHand} on hand</span></span>{selectedProductId === item.product.id ? <Check className="h-4 w-4 shrink-0 text-[#43836b]"/> : null}</button>) : <p className="px-3 py-4 text-center text-xs text-[#7d887e]">No matching products. Try a different name or SKU.</p>}
                  {items.length > 30 && receiveMatches.length === 30 ? <p className="border-t border-[#edf0ec] px-3 py-2 text-[10px] text-[#8b948b]">Showing the first 30 matches. Refine your search to find another item.</p> : null}
                </div> : null}
              </div>
              <input type="hidden" name="productId" value={selectedProductId}/>
              {selectedProduct ? <p className="mt-1.5 text-[10px] font-medium text-[#58806a]">Selected · {selectedProduct.product.category} · current stock {selectedProduct.stockOnHand}</p> : <p className="mt-1.5 text-[10px] font-normal text-[#8a948b]">Type a product name, SKU, category, or brand.</p>}
            </div>
            <label className="text-xs font-medium text-[#526057]">Quantity received<input name="quantity" type="number" min="1" max="10000" step="1" required className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Supplier invoice / reference<input name="reference" maxLength={100} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
            <label className="text-xs font-medium text-[#526057]">Note <span className="font-normal">(optional)</span><input name="note" maxLength={300} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b]" /></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0ec] pt-4"><p className="text-[10px] text-[#818d83]">Stock levels update as soon as the receipt is recorded.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setReceiving(false)} className="rounded-lg border border-[#d6ddd6] bg-white px-3.5 py-2 text-sm font-medium text-[#59685d] hover:bg-[#f7f8f5]">Cancel</button><button disabled={saving || !selectedProductId} className="rounded-lg bg-[#244d3f] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#326653] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Recording…" : "Record receipt"}</button></div></div>
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
                return <tr key={item.id} className="hover:bg-[#f9faf8]"><td className="px-4 py-3 font-medium">{item.product.name}</td><td className="px-4 py-3 font-mono text-xs text-[#69746c]">{item.product.sku}</td><td className="px-4 py-3 text-[#69746c]">{item.product.category}</td><td className="px-4 py-3 text-right tabular-nums">{item.stockOnHand}</td><td className="px-4 py-3 text-right tabular-nums">{item.reservedStock}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{available}</td><td className="px-4 py-3 text-right tabular-nums">{money(item.product.costPrice)}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${low ? "bg-[#fff1ed] text-[#a85644]" : "bg-[#ebf6ed] text-[#39794e]"}`}><span className={`h-1.5 w-1.5 rounded-full ${low ? "bg-[#bd724e]" : "bg-[#739464]"}`} />{low ? "Reorder" : "In stock"}</span></td></tr>;
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
