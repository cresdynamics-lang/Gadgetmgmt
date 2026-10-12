"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Download, Minus, Plus, Search, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { downloadSaleReceipt } from "@/lib/receipt-pdf";

type Product = { id: string; sku: string; name: string; category: string; sellingPrice: number; available: number };
type Customer = { id: string; name: string; phone: string };
type Receipt = {
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  createdAt: string;
  paymentMethod: string;
  branch: { name: string; address: string; phone: string };
  cashier: { name: string };
  customer: { name: string; phone: string } | null;
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string } }[];
  payments: { amount: number; method: string }[];
};
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const paymentMethods = [{ value: "CASH", label: "Cash" }, { value: "MPESA", label: "M-Pesa" }, { value: "CARD", label: "Card" }, { value: "CREDIT", label: "Credit" }, { value: "SPLIT", label: "Split tender" }] as const;

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [firstTenderMethod, setFirstTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("CASH");
  const [secondTenderMethod, setSecondTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function loadCatalogue() {
    const response = await fetch("/api/pos", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load branch catalogue.");
    setProducts(data.products);
    setCustomers(data.customers);
  }

  useEffect(() => {
    async function initialLoad() {
      try {
        await loadCatalogue();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load branch catalogue.");
      } finally {
        setLoading(false);
      }
    }

    void initialLoad();
  }, []);

  const cartItems = Object.entries(cart)
    .map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity }))
    .filter((item): item is { product: Product; quantity: number } => Boolean(item.product));
  const total = cartItems.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  const filteredProducts = products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()));

  function setQuantity(product: Product, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity < 1) delete next[product.id];
      else next[product.id] = Math.min(quantity, product.available);
      return next;
    });
    setReceipt(null);
  }

  async function completeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartItems.length || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map(({ product, quantity }) => ({ productId: product.id, quantity })),
          customerId: customerId || null,
          paymentMethod,
          paymentBreakdown: paymentMethod === "SPLIT" ? [
            { method: firstTenderMethod, amount: Number(paidAmount) },
            { method: secondTenderMethod, amount: total - Number(paidAmount) },
          ] : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sale could not be completed.");
      setReceipt(data);
      setCart({});
      await loadCatalogue();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sale could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Point of sale</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">New sale</h2></div><p className="text-sm text-[#66736a]">Live prices and available stock</p></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {receipt ? <section className="receipt-print border border-[#b8d18b] bg-white p-5 text-sm" aria-label="Sale receipt"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#607266]">{receipt.branch.name}</p><h3 className="mt-1 text-xl font-semibold">Receipt {receipt.invoiceNumber}</h3><p className="mt-1 text-xs text-[#69746c]">{new Date(receipt.createdAt).toLocaleString()} · {receipt.cashier.name}</p><p className="text-xs text-[#69746c]">{receipt.branch.address} · {receipt.branch.phone}</p>{receipt.customer ? <p className="mt-2 text-xs">Customer: {receipt.customer.name} · {receipt.customer.phone}</p> : null}</div><div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={() => window.print()} className="border border-[#ccd6cc] px-3 py-2 text-xs font-semibold hover:bg-[#f4f6f3]">Print</button><button type="button" onClick={() => downloadSaleReceipt(receipt)} className="inline-flex items-center gap-1.5 border border-[#ccd6cc] px-3 py-2 text-xs font-semibold hover:bg-[#f4f6f3]"><Download className="h-3.5 w-3.5" />Download PDF</button><button type="button" onClick={() => setReceipt(null)} className="bg-[#173a2b] px-3 py-2 text-xs font-semibold text-white">New sale</button></div></div><div className="mt-4 divide-y divide-[#e5e9e5] border-y border-[#e5e9e5]">{receipt.saleItems.map((item, index) => <div key={`${item.product.sku}-${index}`} className="flex justify-between gap-4 py-2"><span>{item.quantity} × {item.product.name}<span className="block text-xs text-[#69746c]">{item.product.sku} · {money(item.unitPrice)} each</span></span><strong>{money(item.total)}</strong></div>)}</div><div className="ml-auto mt-3 max-w-xs space-y-1"><p className="flex justify-between font-semibold"><span>Total</span><span>{money(receipt.total)}</span></p>{receipt.payments.map((payment, index) => <p key={`${payment.method}-${index}`} className="flex justify-between text-xs text-[#69746c]"><span>{payment.method}</span><span>{money(payment.amount)}</span></p>)}{receipt.paymentMethod === "CREDIT" ? <p className="flex justify-between text-xs text-[#69746c]"><span>Due</span><span>{money(receipt.total)}</span></p> : null}</div><style jsx global>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } }`}</style></section> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0 border border-[#dfe4df] bg-white">
            <div className="flex flex-col gap-3 border-b border-[#e5e9e5] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or category" className="w-full border border-[#d6ddd6] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#315d3f]" /></div><span className="text-xs text-[#69746c]">{loading ? "Loading catalogue…" : `${filteredProducts.length} products`}</span></div>
            {loading ? <div className="p-8 text-sm text-[#69746c]">Connecting to branch inventory…</div> : filteredProducts.length ? <div className="divide-y divide-[#e8ebe8]">{filteredProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-[#f8faf7]"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#202922]">{product.name}</p><p className="mt-1 text-xs text-[#69746c]">{product.sku} <span className="px-1">·</span> {product.category}</p></div><div className="flex shrink-0 items-center gap-4"><div className="text-right"><p className="text-sm font-medium">{money(product.sellingPrice)}</p><p className={`mt-1 text-xs ${product.available ? "text-[#55734d]" : "text-[#9b4a3d]"}`}>{product.available} available</p></div><button type="button" disabled={product.available < 1 || (cart[product.id] ?? 0) >= product.available} onClick={() => setQuantity(product, (cart[product.id] ?? 0) + 1)} aria-label={`Add ${product.name}`} className="grid h-9 w-9 place-items-center border border-[#ccd6cc] text-[#284a34] hover:border-[#315d3f] hover:bg-[#edf3e9] disabled:cursor-not-allowed disabled:opacity-35"><Plus className="h-4 w-4" /></button></div></div>)}</div> : <div className="p-8"><p className="text-sm font-semibold">{products.length ? "No matching products" : "No products stocked at this branch"}</p><p className="mt-1 text-sm text-[#69746c]">{products.length ? "Try another name or SKU." : "Add products and receive stock into this branch before making a sale."}</p></div>}
          </section>

          <form onSubmit={completeSale} className="h-fit border border-[#dfe4df] bg-white">
            <div className="flex items-center justify-between border-b border-[#e5e9e5] px-4 py-3.5"><h3 className="text-sm font-semibold">Current sale</h3><span className="text-xs text-[#69746c]">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} units</span></div>
            {cartItems.length ? <div className="divide-y divide-[#e8ebe8] px-4">{cartItems.map(({ product, quantity }) => <div key={product.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-[#69746c]">{money(product.sellingPrice)} each</p></div><button type="button" onClick={() => setQuantity(product, 0)} aria-label={`Remove ${product.name}`} className="p-1 text-[#8a5149] hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center border border-[#dfe4df]"><button type="button" onClick={() => setQuantity(product, quantity - 1)} aria-label={`Decrease ${product.name} quantity`} className="grid h-8 w-8 place-items-center hover:bg-[#f4f6f3]"><Minus className="h-3.5 w-3.5" /></button><span className="w-8 text-center text-sm tabular-nums">{quantity}</span><button type="button" disabled={quantity >= product.available} onClick={() => setQuantity(product, quantity + 1)} aria-label={`Increase ${product.name} quantity`} className="grid h-8 w-8 place-items-center hover:bg-[#f4f6f3] disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button></div><span className="text-sm font-semibold tabular-nums">{money(product.sellingPrice * quantity)}</span></div></div>)}</div> : <p className="px-4 py-8 text-center text-sm text-[#69746c]">Add an item to begin checkout.</p>}
            <div className="space-y-4 border-t border-[#e5e9e5] p-4">
              <label className="block space-y-1.5"><span className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Customer <span className="font-normal normal-case tracking-normal">(optional)</span></span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#315d3f]"><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select></label>
              <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#69746c]">Payment method</legend><div className="grid grid-cols-5 border border-[#d6ddd6]">{paymentMethods.map((method) => <button key={method.value} type="button" disabled={method.value === "CREDIT" && !customerId} aria-pressed={paymentMethod === method.value} onClick={() => setPaymentMethod(method.value)} className={`px-1 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${paymentMethod === method.value ? "bg-[#173a2b] text-white" : "bg-white text-[#354139] hover:bg-[#f4f6f3]"}`}>{method.label}</button>)}</div>{paymentMethod === "CREDIT" && !customerId ? <p className="mt-1 text-xs text-[#995338]">Select a customer before choosing credit.</p> : null}</fieldset>
              {paymentMethod === "SPLIT" ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Split tender</p><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="First payment method" value={firstTenderMethod} onChange={(event) => setFirstTenderMethod(event.target.value as typeof firstTenderMethod)} className="border border-[#d6ddd6] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><input aria-label="First payment amount in KES" type="number" min="1" max={Math.max(1, total - 1)} step="1" required value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="w-full border border-[#d6ddd6] px-2 py-2 text-sm" /></div><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="Second payment method" value={secondTenderMethod} onChange={(event) => setSecondTenderMethod(event.target.value as typeof secondTenderMethod)} className="border border-[#d6ddd6] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><p className="border border-[#e5e9e5] bg-[#f8faf7] px-2 py-2 text-sm">{money(Math.max(0, total - Number(paidAmount || 0)))}</p></div>{firstTenderMethod === secondTenderMethod ? <p role="alert" className="text-xs text-red-700">Choose two different payment methods.</p> : null}</div> : null}
              <div className="flex items-end justify-between border-t border-[#e5e9e5] pt-3"><span className="text-sm text-[#69746c]">Total due</span><span className="text-xl font-semibold tabular-nums">{money(total)}</span></div>
              <button type="submit" disabled={!cartItems.length || submitting || (paymentMethod === "CREDIT" && !customerId) || (paymentMethod === "SPLIT" && (!paidAmount || Number(paidAmount) >= total || firstTenderMethod === secondTenderMethod))} className="w-full bg-[#173a2b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#24513a] disabled:cursor-not-allowed disabled:bg-[#aab5ac]">{submitting ? "Recording sale…" : "Complete sale"}</button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
