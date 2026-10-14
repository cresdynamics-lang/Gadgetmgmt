"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, CreditCard, Download, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Trash2, UserRoundPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { downloadSaleReceipt } from "@/lib/receipt-pdf";

type Product = { id: string; sku: string; name: string; category: string; sellingPrice: number; available: number };
type Customer = { id: string; name: string; phone: string };
type NewCustomer = { name: string; phone: string; email: string };
type Receipt = {
  id: string;
  invoiceNumber: string;
  status: "PAID" | "PARTIAL" | "PENDING" | "VOIDED";
  total: number;
  discountAmount?: number;
  taxAmount?: number;
  paidAmount: number;
  createdAt: string;
  paymentMethod: string;
  branch: { name: string; address: string; phone: string };
  cashier: { name: string };
  customer: { name: string; phone: string } | null;
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string } }[];
  payments: { amount: number; method: string }[];
  creditPlanLinks?: { token: string; productName: string; payerToken?: string; payerAmount?: number }[];
  salePaymentLink?: { token: string; amount: number } | null;
};
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const paymentMethods = [{ value: "CASH", label: "Cash" }, { value: "MPESA", label: "M-Pesa" }, { value: "CARD", label: "Card" }, { value: "CREDIT", label: "Lipa plan" }, { value: "SPLIT", label: "Split" }, { value: "PAY_LINK", label: "Payer link" }] as const;
const blankCustomer: NewCustomer = { name: "", phone: "", email: "" };

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All items");
  const [customerId, setCustomerId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(blankCustomer);
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH");
  const [creditTermMonths, setCreditTermMonths] = useState<4 | 6 | 12>(4);
  const [creditDepositAmount, setCreditDepositAmount] = useState("");
  const [creditDepositMethod, setCreditDepositMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [creditDepositReference, setCreditDepositReference] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [firstTenderMethod, setFirstTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("CASH");
  const [secondTenderMethod, setSecondTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [copiedCustomerLink, setCopiedCustomerLink] = useState("");
  const [copiedPayerLink, setCopiedPayerLink] = useState("");
  const [copiedSaleLink, setCopiedSaleLink] = useState(false);
  const [firstDueDate, setFirstDueDate] = useState("");

  async function copyCustomerLink(token: string) {
    const link = `${window.location.origin}/pay/${token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this secure customer account link", link);
    }
    setCopiedCustomerLink(token);
    window.setTimeout(() => setCopiedCustomerLink((current) => current === token ? "" : current), 2200);
  }

  async function copyPayerLink(token: string) {
    const link = `${window.location.origin}/request/${token}`;
    try { await navigator.clipboard.writeText(link); } catch { window.prompt("Copy this secure payer link", link); }
    setCopiedPayerLink(token);
    window.setTimeout(() => setCopiedPayerLink((current) => current === token ? "" : current), 2200);
  }

  async function copySalePayerLink(token: string) {
    const link = `${window.location.origin}/request/${token}`;
    try { await navigator.clipboard.writeText(link); } catch { window.prompt("Copy this secure payment link", link); }
    setCopiedSaleLink(true);
    window.setTimeout(() => setCopiedSaleLink(false), 2200);
  }

  async function loadCatalogue() {
    const response = await fetch("/api/pos", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load branch catalogue.");
    setProducts(data.products);
    setCustomers(data.customers);
  }

  useEffect(() => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    nextMonth.setDate(Math.min(today.getDate(), lastDayOfNextMonth));
    setFirstDueDate(nextMonth.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }));

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

  useEffect(() => {
    if (!receipt || receipt.status !== "PENDING") return;
    let active = true;
    const refreshPendingSale = async () => {
      try {
        const response = await fetch(`/api/pos/${receipt.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const updated = await response.json() as Receipt;
        if (active) {
          setReceipt((current) => current?.id === updated.id
            ? { ...current, ...updated, salePaymentLink: current.salePaymentLink }
            : current);
        }
      } catch {
        // Keep showing the pending receipt; the next poll can recover from a temporary network issue.
      }
    };
    const timer = window.setInterval(() => void refreshPendingSale(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [receipt?.id, receipt?.status]);

  const cartItems = Object.entries(cart)
    .map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity }))
    .filter((item): item is { product: Product; quantity: number } => Boolean(item.product));
  const total = cartItems.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  const deposit = Number(creditDepositAmount) || 0;
  const previewDeposit = Number.isFinite(deposit) ? Math.min(total, Math.max(0, Math.trunc(deposit))) : 0;
  const creditBalance = Math.max(0, total - previewDeposit);
  let depositRemaining = previewDeposit;
  const estimatedInstallment = cartItems.reduce((sum, item, index) => {
    const lineTotal = item.product.sellingPrice * item.quantity;
    const allocatedDeposit = index === cartItems.length - 1
      ? depositRemaining
      : total > 0 ? Number((BigInt(previewDeposit) * BigInt(lineTotal)) / BigInt(total)) : 0;
    depositRemaining -= allocatedDeposit;
    return sum + Math.ceil(Math.max(0, lineTotal - allocatedDeposit) / creditTermMonths);
  }, 0);
  const newCustomerReady = newCustomer.name.trim().length >= 2 && newCustomer.phone.trim().length >= 7;
  const receiptSubtotal = receipt?.saleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0;
  const categories = ["All items", ...Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b))];
  const filteredProducts = products.filter((product) => (activeCategory === "All items" || product.category === activeCategory) && `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()));

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
          ...(showNewCustomer ? { newCustomer } : {}),
          paymentMethod,
          ...(paymentMethod === "CREDIT" ? {
            creditTermMonths,
            creditDepositAmount: Number(creditDepositAmount),
            creditDepositMethod,
            ...(creditDepositMethod === "MPESA" ? { creditDepositReference } : {}),
          } : {}),
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
      setCustomerId("");
      setShowNewCustomer(false);
      setNewCustomer(blankCustomer);
      setPaymentMethod("CASH");
      setCreditDepositAmount("");
      setCreditDepositReference("");
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
        {receipt ? (
          <section className="receipt-print mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-[#e4e1d7] bg-[#fffefa] shadow-[0_18px_55px_rgba(36,43,32,0.09)]" aria-label="Sale receipt">
            <div className="receipt-top flex flex-col gap-6 border-b border-[#e9e5d9] bg-[#f8f6ef] px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-9 sm:py-8">
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#1f4935] font-serif text-xl text-[#f5e7c7]">G</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a7047]">GadgetHub / Sales receipt</p>
                  <h3 className="mt-1 font-serif text-3xl font-medium tracking-tight text-[#25372b]">{receipt.branch.name}</h3>
                  <p className="mt-1 max-w-md text-xs leading-5 text-[#70766b]">{receipt.branch.address}</p>
                  <p className="text-xs text-[#70766b]">{receipt.branch.phone}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                {receipt.status === "PAID" || receipt.status === "PARTIAL" ? <><button type="button" onClick={() => window.print()} className="rounded-lg border border-[#d8d5c9] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#344238] hover:bg-[#f5f4ef]">Print receipt</button>
                <button type="button" onClick={() => downloadSaleReceipt(receipt)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d5c9] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#344238] hover:bg-[#f5f4ef]"><Download className="h-3.5 w-3.5" />Save PDF</button></> : <span className="self-center text-[10px] font-medium text-[#876b3e]">Receipt available after payment clears</span>}
                <button type="button" onClick={() => setReceipt(null)} className="rounded-lg bg-[#1f4935] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#285940]">New sale</button>
              </div>
            </div>

            <div className="grid gap-5 border-b border-[#eeeae0] px-6 py-6 sm:grid-cols-[1fr_auto] sm:px-9">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Invoice number</p><p className="mt-1 font-mono text-xl font-semibold tracking-tight text-[#26372b]">{receipt.invoiceNumber}</p><p className="mt-2 text-sm text-[#667066]">{new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>{receipt.status === "PENDING" ? <p className="mt-1 text-xs font-semibold text-[#876b3e]">Sale pending · waiting for payer</p> : null}</div>
              <div className="flex items-center gap-4 sm:text-right"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#85877b]">{receipt.customer ? "Billed to" : "Customer"}</p><p className="mt-1 text-sm font-semibold text-[#293a2e]">{receipt.customer?.name ?? "Walk-in customer"}</p><p className="mt-0.5 text-xs text-[#777d73]">{receipt.customer?.phone ?? "Thank you for shopping with us"}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${receipt.status === "VOIDED" ? "bg-[#fbe9e6] text-[#984b40]" : receipt.status === "PAID" ? "bg-[#e9f1e8] text-[#376447]" : "bg-[#f5eddd] text-[#876b3e]"}`}>{receipt.status === "PENDING" ? "Awaiting payment" : receipt.status === "VOIDED" ? "Request expired" : receipt.status === "PAID" ? "Paid" : "Balance due"}</span></div>
            </div>

            <div className="px-6 py-6 sm:px-9">
              <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Purchase details</p><p className="mt-1 text-sm text-[#73796f]">{receipt.saleItems.reduce((sum, item) => sum + item.quantity, 0)} items</p></div><p className="text-xs text-[#73796f]">Served by <span className="font-medium text-[#344238]">{receipt.cashier.name}</span></p></div>
              <div className="overflow-x-auto border-y border-[#e9e6dc]">
                <div className="receipt-table min-w-[540px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] gap-3 bg-[#f8f7f2] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#85877b]"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span></div>
                  {receipt.saleItems.map((item, index) => <div key={`${item.product.sku}-${index}`} className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] items-center gap-3 border-t border-[#efede6] px-3 py-4 text-sm"><div className="min-w-0"><p className="font-medium text-[#293a2e]">{item.product.name}</p><p className="mt-1 text-[10px] tracking-wide text-[#8a8c80]">SKU {item.product.sku}</p></div><span className="text-right tabular-nums text-[#5f685f]">{item.quantity}</span><span className="text-right tabular-nums text-[#5f685f]">{money(item.unitPrice)}</span><span className="text-right font-semibold tabular-nums text-[#293a2e]">{money(item.total)}</span></div>)}
                </div>
              </div>
            </div>

            <div className="grid gap-8 border-t border-[#eeeae0] bg-[#fbfaf6] px-6 py-6 sm:grid-cols-[1fr_280px] sm:px-9 sm:py-7">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Payment details</p><div className="mt-3 space-y-2">{receipt.payments.length ? receipt.payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex max-w-sm items-center justify-between text-sm text-[#566258]"><span>{payment.method === "MPESA" ? "M-Pesa" : payment.method}</span><span className="font-medium tabular-nums text-[#344238]">{money(payment.amount)}</span></div>) : <p className="text-sm text-[#667066]">{receipt.status === "PENDING" ? "Waiting for M-Pesa confirmation by the payer" : "Credit sale payment outstanding"}</p>}</div></div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between text-[#667066]"><span>Subtotal</span><span className="tabular-nums">{money(receiptSubtotal)}</span></div>
                {(receipt.discountAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[#667066]"><span>Discount</span><span className="tabular-nums">- {money(receipt.discountAmount ?? 0)}</span></div> : null}
                {(receipt.taxAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[#667066]"><span>Tax</span><span className="tabular-nums">{money(receipt.taxAmount ?? 0)}</span></div> : null}
                <div className="flex items-center justify-between border-t border-[#e2dfd4] pt-3 text-base font-semibold text-[#27392d]"><span>Total</span><span className="tabular-nums">{money(receipt.total)}</span></div>
                <div className="flex items-center justify-between text-[#667066]"><span>Paid</span><span className="tabular-nums">{money(receipt.paidAmount)}</span></div>
                <div className="flex items-center justify-between font-semibold text-[#8a7047]"><span>Balance due</span><span className="tabular-nums">{money(Math.max(receipt.total - receipt.paidAmount, 0))}</span></div>
              </div>
            </div>
            <div className="border-t border-[#e9e5d9] px-6 py-5 text-center sm:px-9"><p className="font-serif text-lg text-[#3b4d3d]">Thank you for choosing GadgetHub.</p><p className="mt-1 text-[10px] uppercase tracking-[0.17em] text-[#999789]">Keep this receipt for your records</p></div>
          </section>
        ) : null}

        {receipt?.salePaymentLink && receipt.status === "PENDING" ? <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#cfe2d2] bg-[#f4faf4] p-4 sm:p-5" aria-label="Third-party sale payment link"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#527557]">Waiting for payment</p><p className="mt-1 text-sm font-semibold text-[#354536]">Send the payer a secure link for {money(receipt.salePaymentLink.amount)}</p><p className="mt-1 text-xs text-[#74786d]">Stock is reserved until payment arrives or this request expires. The payer enters their own M-Pesa number.</p></div><button type="button" onClick={() => void copySalePayerLink(receipt.salePaymentLink!.token)} className="rounded-lg bg-[#254936] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#315943]">{copiedSaleLink ? "Link copied" : "Copy payer link"}</button></section> : null}

        {receipt?.creditPlanLinks?.length ? <section className="rounded-xl border border-[#e7dfcb] bg-[#fbf8f0] p-4 sm:p-5" aria-label="Customer payment links">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#94784e]">Customer and payer links</p><p className="mt-1 text-sm font-semibold text-[#354536]">Share the right link with each person</p><p className="mt-1 text-xs text-[#74786d]">The customer schedule shows the account. The separate payer link hides those details and starts an M-Pesa prompt when Daraja is configured.</p></div></div>
          <div className="mt-3 space-y-2">{receipt.creditPlanLinks.map((plan, index) => <div key={`${plan.productName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e9e4d8] bg-white px-3 py-2.5"><span className="min-w-0 truncate text-xs font-medium text-[#3b4b3d]">{plan.productName}</span><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyCustomerLink(plan.token)} className="rounded-md border border-[#d6ddd6] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#35513c] hover:bg-[#f5f8f5]">{copiedCustomerLink === plan.token ? "Copied" : "Customer schedule"}</button>{plan.payerToken ? <button type="button" onClick={() => void copyPayerLink(plan.payerToken!)} className="rounded-md bg-[#254936] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#315943]">{copiedPayerLink === plan.payerToken ? "Copied" : `Payer link · ${money(plan.payerAmount ?? 0)}`}</button> : null}</div></div>)}</div>
        </section> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="min-w-0 border border-[#dfe4df] bg-white">
            <div className="flex flex-col gap-3 border-b border-[#e5e9e5] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or category" className="w-full border border-[#d6ddd6] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#315d3f]" /></div><span className="text-xs text-[#69746c]">{loading ? "Loading catalogueâ€¦" : `${filteredProducts.length} products`}</span></div>
            {!loading && categories.length > 1 ? <div className="flex gap-2 overflow-x-auto border-b border-[#edf1ed] px-4 py-3">{categories.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${activeCategory === category ? "border-[#c9e3d0] bg-[#edf7ef] text-[#326b49]" : "border-transparent bg-[#f6f8f6] text-[#849188] hover:border-[#e4ebe5] hover:text-[#4d6656]"}`}>{category}</button>)}</div> : null}
            {loading ? <div className="p-8 text-sm text-[#69746c]">Connecting to branch inventoryâ€¦</div> : filteredProducts.length ? <div className="divide-y divide-[#e8ebe8]">{filteredProducts.map((product) => <div key={product.id} className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-[#f8faf7]"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-[#f1f7f1] to-[#e7f0e8] text-[#4d7959] ring-1 ring-[#e3ece3]"><Package className="h-[17px] w-[17px]" strokeWidth={1.7}/></span><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[#263b2e]">{product.name}</p><p className="mt-1 truncate text-[10px] text-[#89958d]">{product.sku}<span className="px-1.5 text-[#c2cbc4]">Â·</span>{product.category}</p></div></div><div className="flex shrink-0 items-center gap-4"><div className="text-right"><p className="text-sm font-semibold tabular-nums">{money(product.sellingPrice)}</p><p className={`mt-1 text-[10px] font-medium ${product.available ? "text-[#55734d]" : "text-[#9b4a3d]"}`}>{product.available} available</p></div><button type="button" disabled={product.available < 1 || (cart[product.id] ?? 0) >= product.available} onClick={() => setQuantity(product, (cart[product.id] ?? 0) + 1)} aria-label={`Add ${product.name}`} className={`grid h-9 w-9 place-items-center rounded-xl transition ${cart[product.id] ? "bg-[#e8f4eb] text-[#32704b]" : "border border-[#e2eae3] bg-white text-[#597464] shadow-sm hover:border-[#b9d7c1] hover:bg-[#edf7ef]"} disabled:cursor-not-allowed disabled:opacity-35`}>{cart[product.id] ? <Check className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}</button></div></div>)}</div> : <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f6f3] text-[#839187]"><Package className="h-5 w-5"/></span><p className="mt-3 text-sm font-semibold">{products.length ? "No matching products" : "No products stocked at this branch"}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#839087]">{products.length ? "Try another name, SKU or category." : "Add products and receive stock into this branch before making a sale."}</p></div></div>}
          </section>

          <form onSubmit={completeSale} className="h-fit border border-[#dfe4df] bg-white xl:sticky xl:top-[96px]">
            <div className="flex items-center justify-between border-b border-[#e5e9e5] bg-[#f8faf8] px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e6f2e9] text-[#39724f]"><ShoppingBag className="h-4 w-4"/></span><div><h3 className="text-sm font-semibold text-[#263b2e]">Current sale</h3><p className="mt-0.5 text-[10px] text-[#8b978f]">Review before checkout</p></div></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6d7f73] ring-1 ring-[#e7ede8]">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} units</span></div>
            {cartItems.length ? <div className="divide-y divide-[#f0f3f0] px-4">{cartItems.map(({ product, quantity }) => <div key={product.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[#293d30]">{product.name}</p><p className="mt-1 text-[10px] text-[#87948c]">{money(product.sellingPrice)} each</p></div><button type="button" onClick={() => setQuantity(product, 0)} aria-label={`Remove ${product.name}`} className="rounded-lg p-1.5 text-[#aa746b] transition hover:bg-[#fff0ed] hover:text-[#a54f40]"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="mt-2.5 flex items-center justify-between"><div className="flex items-center rounded-lg border border-[#e5ebe5] bg-[#fafcfa]"><button type="button" onClick={() => setQuantity(product, quantity - 1)} aria-label={`Decrease ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-l-lg text-[#6b7b70] transition hover:bg-[#eef4ef]"><Minus className="h-3.5 w-3.5" /></button><span className="w-8 text-center text-xs font-semibold tabular-nums text-[#304637]">{quantity}</span><button type="button" disabled={quantity >= product.available} onClick={() => setQuantity(product, quantity + 1)} aria-label={`Increase ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-r-lg text-[#52745d] transition hover:bg-[#eef4ef] disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button></div><span className="text-[13px] font-bold tabular-nums text-[#293d30]">{money(product.sellingPrice * quantity)}</span></div></div>)}</div> : <div className="grid min-h-48 place-items-center px-5 py-7 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-[17px] bg-[#f1f6f1] text-[#7c9583]"><ShoppingBag className="h-5 w-5" strokeWidth={1.6}/></span><p className="mt-3 text-xs font-semibold text-[#4a5f50]">Your sale starts here</p><p className="mx-auto mt-1 max-w-[200px] text-[11px] leading-relaxed text-[#909b93]">Choose an item from the catalogue to build the customerâ€™s basket.</p></div></div>}
            <div className="space-y-4 border-t border-[#e5e9e5] p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Customer <span className="font-normal normal-case tracking-normal">(optional for cash sales)</span></span>{customerId ? <span className="text-[10px] font-medium text-[#54735c]">Existing account</span> : null}</div>
                {showNewCustomer ? <div className="rounded-xl border border-[#dce8dc] bg-[#f8fbf7] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-[#385540]"><UserRoundPlus className="h-4 w-4"/>Create customer record</div><button type="button" onClick={() => { setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="text-[10px] font-semibold text-[#77847a] underline underline-offset-2">Use saved customer</button></div>
                  <div className="space-y-2.5">
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Customer full name<input required minLength={2} maxLength={120} autoComplete="name" value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Name on the account" className="mt-1 w-full rounded-lg border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#29382d] outline-none focus:border-[#7eaa86]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Mobile number<input required minLength={7} maxLength={30} autoComplete="tel" type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="07xx xxx xxx" className="mt-1 w-full rounded-lg border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#29382d] outline-none focus:border-[#7eaa86]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Email <span className="font-normal normal-case tracking-normal">(optional)</span><input type="email" maxLength={254} autoComplete="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" className="mt-1 w-full rounded-lg border border-[#dfe6dd] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#29382d] outline-none focus:border-[#7eaa86]"/></label>
                  </div>
                  <p className="mt-2.5 text-[10px] leading-relaxed text-[#879287]">The customer and their payment schedule are saved together when checkout completes.</p>
                </div> : <div className="flex gap-2"><select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="min-w-0 flex-1 rounded-lg border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#315d3f]"><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select><button type="button" onClick={() => { setCustomerId(""); setShowNewCustomer(true); }} aria-label="Add a new customer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#dce6dc] bg-[#f7faf7] px-3 text-[11px] font-semibold text-[#45634d] transition hover:bg-[#eaf3eb]"><Plus className="h-3.5 w-3.5"/>New</button></div>}
              </div>
              <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#69746c]">How are they paying?</legend><div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[#d6ddd6] sm:grid-cols-6">{paymentMethods.map((method) => <button key={method.value} type="button" aria-pressed={paymentMethod === method.value} onClick={() => { setPaymentMethod(method.value); if (method.value === "CREDIT" && !customerId) setShowNewCustomer(true); }} className={`px-1 py-2.5 text-[10px] font-semibold transition sm:text-xs ${paymentMethod === method.value ? "bg-[#173a2b] text-white" : "bg-white text-[#5f6e63] hover:bg-[#f4f6f3]"}`}>{method.label}</button>)}</div>{paymentMethod === "CREDIT" ? <p className="mt-1.5 text-[10px] text-[#78867b]">Start a Lipa plan and collect the customer details below.</p> : paymentMethod === "PAY_LINK" ? <p className="mt-1.5 text-[10px] text-[#78867b]">Create a pending sale, then share a private payment link with the third-party payer. Stock remains reserved until confirmation.</p> : null}</fieldset>
              {paymentMethod === "CREDIT" ? <div className="space-y-3 rounded-xl border border-[#e6e1d5] bg-[#fbfaf6] p-3.5">
                <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e7f1e6] text-[#47724f]"><CreditCard className="h-4 w-4"/></span><div><p className="text-xs font-semibold text-[#354638]">Lipa Mdogo Mdogo</p><p className="mt-0.5 text-[10px] text-[#7d8175]">Pay a deposit, take it home today.</p></div></div><span className="rounded-full bg-[#f1eadb] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#886d3e]">Take home</span></div>
                <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Repayment term</p><div className="grid grid-cols-3 gap-1.5">{([4, 6, 12] as const).map((months) => <button key={months} type="button" aria-pressed={creditTermMonths === months} onClick={() => setCreditTermMonths(months)} className={`rounded-lg border px-2 py-2 text-center transition ${creditTermMonths === months ? "border-[#427653] bg-[#e9f3e9] text-[#2e6743] shadow-[inset_0_0_0_1px_#427653]" : "border-[#e5e2d8] bg-white text-[#74796d] hover:border-[#c8d9c8]"}`}><span className="block text-xs font-bold">{months}</span><span className="text-[9px]">months</span></button>)}</div></div>
                <div><label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]" htmlFor="credit-deposit">Deposit collected today</label><div className="relative mt-1.5"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[10px] font-semibold text-[#889187]">KES</span><input id="credit-deposit" type="number" min="1" max={Math.max(1, total - 1)} step="1" required value={creditDepositAmount} onChange={(event) => setCreditDepositAmount(event.target.value)} placeholder="Enter amount received" className="w-full rounded-lg border border-[#e3e1d7] bg-white py-2.5 pl-12 pr-3 text-sm normal-case tracking-normal outline-none focus:border-[#86ae8d]"/></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[9px] text-[#8a8d80]">Quick picks · editable</span><div className="flex gap-1.5">{([10, 20, 30] as const).map((percent) => <button key={percent} type="button" disabled={total < 2} onClick={() => setCreditDepositAmount(String(Math.max(1, Math.min(total - 1, Math.round(total * percent / 100)))))} className="rounded-md border border-[#e5e2d8] bg-white px-2 py-1 text-[9px] font-semibold text-[#627366] hover:border-[#9eb99f] disabled:opacity-40">{percent}%</button>)}</div></div></div>
                <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Deposit paid by<select value={creditDepositMethod} onChange={(event) => setCreditDepositMethod(event.target.value as typeof creditDepositMethod)} className="mt-1.5 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#29382d]"><option value="MPESA">M-Pesa</option><option value="CASH">Cash</option><option value="CARD">Card</option></select></label>
                {creditDepositMethod === "MPESA" ? <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Verified M-Pesa transaction code<input required minLength={6} maxLength={32} value={creditDepositReference} onChange={(event) => setCreditDepositReference(event.target.value.toUpperCase())} placeholder="e.g. QWE123ABC" className="mt-1 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal"/><span className="mt-1 block text-[10px] font-normal normal-case leading-4 tracking-normal text-[#8b887c]">Confirm the deposit in M-Pesa before checkout. The code is added to the payment record.</span></label> : null}
                <div className="rounded-xl border border-[#e6e6dc] bg-white p-3.5"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#768176]"><Sparkles className="h-3.5 w-3.5 text-[#9b8150]"/>Plan at a glance</div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#f5f8f3] p-2.5"><p className="text-[9px] text-[#839084]">Balance financed</p><p className="mt-1 text-xs font-bold tabular-nums text-[#36523c]">{money(creditBalance)}</p></div><div className="rounded-lg bg-[#f5f8f3] p-2.5"><p className="text-[9px] text-[#839084]">About per month</p><p className="mt-1 text-xs font-bold tabular-nums text-[#36523c]">{money(estimatedInstallment)}</p></div></div><div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeece5] pt-2.5 text-[10px] text-[#7c857b]"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5"/>First due {firstDueDate || "next month"}</span><span>{creditTermMonths} equal monthly payments</span></div><p className="mt-2 text-[9px] leading-relaxed text-[#96988d]">Estimate only; the saved schedule shows exact dates and any rounding adjustment.</p></div>
                <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[#888a7e]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7e9982]"/>Review the deposit with the customer before confirming. Checkout deducts stock and opens their payment account.</p>
              </div> : null}
              {paymentMethod === "SPLIT" ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Split tender</p><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="First payment method" value={firstTenderMethod} onChange={(event) => setFirstTenderMethod(event.target.value as typeof firstTenderMethod)} className="border border-[#d6ddd6] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><input aria-label="First payment amount in KES" type="number" min="1" max={Math.max(1, total - 1)} step="1" required value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="w-full border border-[#d6ddd6] px-2 py-2 text-sm" /></div><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="Second payment method" value={secondTenderMethod} onChange={(event) => setSecondTenderMethod(event.target.value as typeof secondTenderMethod)} className="border border-[#d6ddd6] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><p className="border border-[#e5e9e5] bg-[#f8faf7] px-2 py-2 text-sm">{money(Math.max(0, total - Number(paidAmount || 0)))}</p></div>{firstTenderMethod === secondTenderMethod ? <p role="alert" className="text-xs text-red-700">Choose two different payment methods.</p> : null}</div> : null}
              <div className="rounded-xl bg-[#f3f8f3] px-3.5 py-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#708076]">Total due</span><span className="text-xl font-bold tracking-[-.04em] tabular-nums text-[#214c34]">{money(total)}</span></div><p className="mt-1.5 text-[10px] text-[#92a096]">Prices include all selected items</p></div>
              <button type="submit" disabled={!cartItems.length || submitting || (paymentMethod === "CREDIT" && (!(customerId || (showNewCustomer && newCustomerReady)) || !creditDepositAmount || Number(creditDepositAmount) >= total || Number(creditDepositAmount) < 1 || (creditDepositMethod === "MPESA" && creditDepositReference.trim().length < 6))) || (paymentMethod === "SPLIT" && (!paidAmount || Number(paidAmount) >= total || firstTenderMethod === secondTenderMethod))} className="w-full rounded-xl bg-[#173a2b] px-4 py-3 text-sm font-semibold text-white shadow-[0_5px_16px_rgba(23,58,43,.13)] transition hover:bg-[#24513a] disabled:cursor-not-allowed disabled:bg-[#aab5ac]">{submitting ? "Recording sale…" : paymentMethod === "CREDIT" ? "Collect deposit & start plan" : paymentMethod === "PAY_LINK" ? "Create sale & payer link" : "Complete sale"}</button>
              {paymentMethod === "CREDIT" ? <p className="flex items-center justify-center gap-1.5 text-[9px] text-[#93988d]"><ShieldCheck className="h-3 w-3"/>Sale, deposit, customer and schedule are recorded together</p> : null}
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
