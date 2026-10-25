"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, CreditCard, Download, Maximize2, Minimize2, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Trash2, UserRoundPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/app-shell";
import { downloadSaleReceipt } from "@/lib/receipt-pdf";
import { BrandLogo } from "@/components/brand-logo";
import { tradeInBrandLabel, tradeInDeclaration, tradeInGrades, tradeInChecks } from "@/lib/trade-in";
import { assessTradeInForm, blankTradeInForm, TradeInPanel, tradeInPayload, tradeInValue, type TradeInForm } from "@/components/trade-in-panel";

type Product = { id: string; sku: string; name: string; category: string; sellingPrice: number; available: number };
type Customer = { id: string; name: string; phone: string };
type CreditPolicy = { minimumDepositPercent: number; defaultCreditLimit: number };
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
  tradeInBrand?: string | null;
  tradeInModel?: string | null;
  tradeInValue?: number;
  branch: { name: string; address: string; phone: string };
  cashier: { name: string };
  customer: { name: string; phone: string } | null;
  saleItems: { quantity: number; unitPrice: number; total: number; product: { name: string; sku: string } }[];
  payments: { amount: number; method: string }[];
  creditPlanLinks?: { token: string; planReference: string; productName: string; payerToken?: string; payerAmount?: number }[];
  salePaymentLink?: { token: string; amount: number } | null;
  paymentLinks?: { label: string; url: string }[];
  payerMessage?: { recipient: string; status: "SENT" | "FAILED" | "QUEUED" } | null;
  stkPrompt?: { token: string; phone: string; status: "PROCESSING" | "FAILED"; message: string } | null;
  paymentRequests?: { status: string }[];
};
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
function receiptPayLinks(receipt: Receipt) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [
    ...(receipt.salePaymentLink ? [{ label: `Pay invoice ${receipt.invoiceNumber}`, url: `${origin}/request/${receipt.salePaymentLink.token}` }] : []),
    ...(receipt.creditPlanLinks ?? []).flatMap((plan) => [
      { label: `${plan.productName} account`, url: `${origin}/pay/${plan.token}` },
      ...(plan.payerToken ? [{ label: `Pay ${plan.productName}`, url: `${origin}/request/${plan.payerToken}` }] : []),
    ]),
  ];
}
const paymentMethods = [{ value: "CASH", label: "Cash" }, { value: "MPESA_STK", label: "M-Pesa prompt" }, { value: "MPESA", label: "M-Pesa manual" }, { value: "CARD", label: "Card" }, { value: "CREDIT", label: "Lipa plan" }, { value: "SPLIT", label: "Split" }, { value: "PAY_LINK", label: "Payer link" }] as const;
const blankCustomer: NewCustomer = { name: "", phone: "", email: "" };

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>({ minimumDepositPercent: 40, defaultCreditLimit: 0 });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All items");
  const [customerId, setCustomerId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(blankCustomer);
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerConsent, setPayerConsent] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [resendingPrompt, setResendingPrompt] = useState(false);
  const [creditTermMonths, setCreditTermMonths] = useState<3 | 6 | 12>(3);
  const [tradeIn, setTradeIn] = useState<TradeInForm>(blankTradeInForm);
  const [confirmingTradeIn, setConfirmingTradeIn] = useState(false);
  const { data: session } = useSession();
  const staffName = session?.user?.name ?? "the staff member";
  const [creditDepositAmount, setCreditDepositAmount] = useState("");
  const [creditDepositMethod, setCreditDepositMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [creditDepositReference, setCreditDepositReference] = useState("");
  const [creditImei, setCreditImei] = useState("");
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
  const [cashierMode, setCashierMode] = useState(false);
  const productSearch = useRef<HTMLInputElement>(null);

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
    const requestedCustomerId = new URLSearchParams(window.location.search).get("customer");
    if (requestedCustomerId && data.customers.some((customer: Customer) => customer.id === requestedCustomerId)) setCustomerId(requestedCustomerId);
    setCreditPolicy(data.creditPolicy ?? { minimumDepositPercent: 40, defaultCreditLimit: 0 });
  }

  useEffect(() => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const lastDayOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    nextMonth.setDate(Math.min(today.getDate(), lastDayOfNextMonth));
    const firstDueLabel = nextMonth.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
    const firstDueFrame = window.requestAnimationFrame(() => setFirstDueDate(firstDueLabel));

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
    return () => window.cancelAnimationFrame(firstDueFrame);
  }, []);

  useEffect(() => {
    if (cashierMode) productSearch.current?.focus();
  }, [cashierMode]);

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
  }, [receipt]);

  const cartItems = Object.entries(cart)
    .map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity }))
    .filter((item): item is { product: Product; quantity: number } => Boolean(item.product));
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  const acceptedTradeIn = tradeInValue(tradeIn, subtotal);
  const total = Math.max(0, subtotal - acceptedTradeIn);
  const deposit = Number(creditDepositAmount) || 0;
  const previewDeposit = Number.isFinite(deposit) ? Math.min(total, Math.max(0, Math.trunc(deposit))) : 0;
  const creditBalance = Math.max(0, total - previewDeposit);
  const estimatedInstallment = creditTermMonths > 0 ? Math.ceil(creditBalance / creditTermMonths) : 0;
  const tradeInAssessment = assessTradeInForm(tradeIn, subtotal);
  const tradeInReady = !tradeIn.active || (tradeInAssessment.eligible && acceptedTradeIn < subtotal);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const tradeInCustomer = selectedCustomer ?? (showNewCustomer && newCustomer.name.trim() ? newCustomer : null);
  const newCustomerReady = newCustomer.name.trim().length >= 2 && newCustomer.phone.trim().length >= 7;
  const checkoutBlocked = !cartItems.length || submitting || !tradeInReady || (paymentMethod === "CREDIT" && (!(customerId || (showNewCustomer && newCustomerReady)) || !creditDepositAmount || Number(creditDepositAmount) >= total || Number(creditDepositAmount) < Math.ceil(total * creditPolicy.minimumDepositPercent / 100) || (creditDepositMethod === "MPESA" && creditDepositReference.trim().length < 6))) || (paymentMethod === "PAY_LINK" && (!payerPhone.trim() || !payerConsent)) || (paymentMethod === "MPESA_STK" && mpesaPhone.trim().length < 9) || (paymentMethod === "SPLIT" && (!paidAmount || Number(paidAmount) >= total || firstTenderMethod === secondTenderMethod));
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

  function completeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartItems.length || submitting) return;
    // A trade-in gets one last look before the sale is recorded.
    if (tradeIn.active && acceptedTradeIn > 0) { setConfirmingTradeIn(true); return; }
    void submitSale();
  }

  async function submitSale() {
    setConfirmingTradeIn(false);
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
          ...(paymentMethod === "PAY_LINK" ? { payerPhone, payerConsent } : {}),
          ...(paymentMethod === "MPESA_STK" ? { mpesaPhone } : {}),
          ...(tradeIn.active && acceptedTradeIn > 0 ? { tradeIn: tradeInPayload(tradeIn, subtotal) } : {}),
          ...(paymentMethod === "CREDIT" ? {
            creditTermMonths,
            creditDepositAmount: Number(creditDepositAmount),
            creditDepositMethod,
            ...(creditDepositMethod === "MPESA" ? { creditDepositReference } : {}),
            ...(creditImei ? { imei: creditImei } : {}),
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
      setPayerPhone("");
      setPayerConsent(false);
      setMpesaPhone("");
      setCreditDepositAmount("");
      setCreditDepositReference("");
      setCreditImei("");
      setTradeIn(blankTradeInForm);
      await loadCatalogue();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sale could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendPrompt() {
    if (!receipt?.stkPrompt) return;
    setResendingPrompt(true);
    setError("");
    try {
      const response = await fetch(`/api/payment-requests/${receipt.stkPrompt.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: receipt.stkPrompt.phone }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The M-Pesa prompt could not be resent.");
      setReceipt((current) => current ? { ...current, paymentRequests: [{ status: "PROCESSING" }], stkPrompt: current.stkPrompt ? { ...current.stkPrompt, status: "PROCESSING", message: "Prompt sent again. Ask the customer to enter their M-Pesa PIN." } : current.stkPrompt } : current);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "The M-Pesa prompt could not be resent.");
    } finally {
      setResendingPrompt(false);
    }
  }

  const promptStatus = receipt?.paymentRequests?.[0]?.status ?? receipt?.stkPrompt?.status;

  return (
    <AppShell>
      <div className={`sales-workspace space-y-5 ${cashierMode ? "cashier-mode" : ""}`}>
        {confirmingTradeIn ? <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[#111111]/50 px-4 backdrop-blur-[2px]">
          <section role="dialog" aria-modal="true" aria-labelledby="trade-in-confirm-title" className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_28px_100px_rgba(0,0,0,.28)]">
            <h2 id="trade-in-confirm-title" className="text-base font-semibold text-[#111111]">Confirm this trade-in</h2>
            <p className="mt-1 text-xs text-[#6b6b6b]">Check the details with the seller before completing the sale. This cannot be undone from the till.</p>
            <dl className="mt-4 divide-y divide-[#e5e5e5] rounded-xl border border-[#e5e5e5] text-xs">
              {[
                ["Device", `${tradeIn.brand ? tradeInBrandLabel(tradeIn.brand) : ""} ${tradeIn.model}${tradeIn.storage ? ` · ${tradeIn.storage}` : ""}`],
                ["IMEI / serial", tradeIn.serial],
                ["Condition", `${tradeIn.grade ? tradeInGrades[tradeIn.grade].label : "—"}${tradeIn.batteryHealth ? ` · battery ${tradeIn.batteryHealth}%` : ""}`],
                ["Proof of ownership", [tradeIn.receiptSeen ? "Receipt" : null, tradeIn.boxSeen ? "Box" : null].filter(Boolean).join(" and ")],
                ["Seller", `${tradeIn.sellerName} · ${tradeIn.sellerPhone}`],
                ["Trade-in value", money(acceptedTradeIn)],
                ["Resale price", money(Number(tradeIn.resalePrice) || 0)],
                ["Customer pays", money(total)],
              ].map(([label, value]) => <div key={label} className="flex justify-between gap-3 px-3 py-2"><dt className="text-[#6b6b6b]">{label}</dt><dd className="text-right font-semibold text-[#111111]">{value}</dd></div>)}
            </dl>
            <p className="mt-3 text-[10px] leading-4 text-[#4a4a4a]">{tradeInDeclaration(staffName)} {tradeInChecks.length} of {tradeInChecks.length} checks ticked.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr]">
              <button type="button" disabled={submitting} onClick={() => void submitSale()} className="min-h-12 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:order-2">{submitting ? "Recording…" : "Confirm and complete sale"}</button>
              <button type="button" onClick={() => setConfirmingTradeIn(false)} className="min-h-12 whitespace-nowrap rounded-xl border border-[#c4c4c4] px-4 text-sm font-semibold sm:order-1">Go back</button>
            </div>
          </section>
        </div> : null}
        <div className="sales-hero flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(0,0,0,.035)] sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Point of sale</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">New sale</h2><p className="mt-1.5 text-sm text-[#77837a]">Search the catalogue, build the basket, and check out in one place.</p></div><div className="flex items-center gap-3"><p className="hidden text-sm text-[#66736a] sm:block">Live prices and available stock</p><button type="button" aria-pressed={cashierMode} onClick={() => setCashierMode((active) => !active)} className="inline-flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#2d2d2d] transition hover:bg-[#f5f5f5]">{cashierMode ? <Minimize2 className="h-3.5 w-3.5"/> : <Maximize2 className="h-3.5 w-3.5"/>}{cashierMode ? "Exit cashier mode" : "Cashier mode"}</button></div></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {receipt ? (
          <section className="receipt-print mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-[#e4e1d7] bg-[#fffefa] shadow-[0_18px_55px_rgba(0,0,0,0.09)]" aria-label="Sale receipt">
            <div className="receipt-top flex flex-col gap-6 border-b border-[#e9e5d9] bg-[#f8f6ef] px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-9 sm:py-8">
              <div className="flex gap-4">
                <BrandLogo variant="icon" on="dark" className="h-12 w-12 shrink-0 rounded-2xl" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#8a7047]">GadgetHub / Sales receipt</p>
                  <h3 className="mt-1 font-serif text-3xl font-medium tracking-tight text-[#111111]">{receipt.branch.name}</h3>
                  <p className="mt-1 max-w-md text-xs leading-5 text-[#70766b]">{receipt.branch.address}</p>
                  <p className="text-xs text-[#70766b]">{receipt.branch.phone}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                {receipt.status === "PAID" || receipt.status === "PARTIAL" ? <><button type="button" onClick={() => window.print()} className="rounded-lg border border-[#d8d5c9] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1a1a1a] hover:bg-[#f5f4ef]">Print receipt</button>
                <button type="button" onClick={() => downloadSaleReceipt({ ...receipt, paymentLinks: receiptPayLinks(receipt) })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d5c9] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1a1a1a] hover:bg-[#f5f4ef]"><Download className="h-3.5 w-3.5" />Save PDF</button></> : <span className="self-center text-[10px] font-medium text-[#876b3e]">Receipt available after payment clears</span>}
                <button type="button" onClick={() => setReceipt(null)} className="rounded-lg bg-[#1a1a1a] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#1a1a1a]">New sale</button>
              </div>
            </div>

            <div className="grid gap-5 border-b border-[#eeeae0] px-6 py-6 sm:grid-cols-[1fr_auto] sm:px-9">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Invoice number</p><p className="mt-1 font-mono text-xl font-semibold tracking-tight text-[#111111]">{receipt.invoiceNumber}</p><p className="mt-2 text-sm text-[#667066]">{new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>{receipt.status === "PENDING" ? <p className="mt-1 text-xs font-semibold text-[#876b3e]">Sale pending · waiting for payer</p> : null}</div>
              <div className="flex items-center gap-4 sm:text-right"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#85877b]">{receipt.customer ? "Billed to" : "Customer"}</p><p className="mt-1 text-sm font-semibold text-[#111111]">{receipt.customer?.name ?? "Walk-in customer"}</p><p className="mt-0.5 text-xs text-[#777d73]">{receipt.customer?.phone ?? "Thank you for shopping with us"}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${receipt.status === "VOIDED" ? "bg-[#fbe9e6] text-[#984b40]" : receipt.status === "PAID" ? "bg-[#e5e5e5] text-[#2d2d2d]" : "bg-[#f5eddd] text-[#876b3e]"}`}>{receipt.status === "PENDING" ? "Awaiting payment" : receipt.status === "VOIDED" ? "Request expired" : receipt.status === "PAID" ? "Paid" : "Balance due"}</span></div>
            </div>

            <div className="px-6 py-6 sm:px-9">
              <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Purchase details</p><p className="mt-1 text-sm text-[#73796f]">{receipt.saleItems.reduce((sum, item) => sum + item.quantity, 0)} items</p></div><p className="text-xs text-[#73796f]">Served by <span className="font-medium text-[#1a1a1a]">{receipt.cashier.name}</span></p></div>
              <div className="overflow-x-auto border-y border-[#e9e6dc]">
                <div className="receipt-table min-w-[540px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] gap-3 bg-[#f8f7f2] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#85877b]"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span></div>
                  {receipt.saleItems.map((item, index) => <div key={`${item.product.sku}-${index}`} className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] items-center gap-3 border-t border-[#efede6] px-3 py-4 text-sm"><div className="min-w-0"><p className="font-medium text-[#111111]">{item.product.name}</p><p className="mt-1 text-[10px] tracking-wide text-[#8a8c80]">SKU {item.product.sku}</p></div><span className="text-right tabular-nums text-[#5f685f]">{item.quantity}</span><span className="text-right tabular-nums text-[#5f685f]">{money(item.unitPrice)}</span><span className="text-right font-semibold tabular-nums text-[#111111]">{money(item.total)}</span></div>)}
                </div>
              </div>
            </div>

            <div className="grid gap-8 border-t border-[#eeeae0] bg-[#fbfaf6] px-6 py-6 sm:grid-cols-[1fr_280px] sm:px-9 sm:py-7">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Payment details</p><div className="mt-3 space-y-2">{receipt.payments.length ? receipt.payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex max-w-sm items-center justify-between text-sm text-[#566258]"><span>{payment.method === "MPESA" ? "M-Pesa" : payment.method}</span><span className="font-medium tabular-nums text-[#1a1a1a]">{money(payment.amount)}</span></div>) : <p className="text-sm text-[#667066]">{receipt.status === "PENDING" ? "Waiting for M-Pesa confirmation by the payer" : "Credit sale payment outstanding"}</p>}</div></div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between text-[#667066]"><span>Subtotal</span><span className="tabular-nums">{money(receiptSubtotal)}</span></div>
                {(receipt.discountAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[#667066]"><span>Discount</span><span className="tabular-nums">- {money(receipt.discountAmount ?? 0)}</span></div> : null}
                {(receipt.tradeInValue ?? 0) > 0 ? <div className="flex items-center justify-between text-[#667066]"><span>Trade-in{receipt.tradeInBrand && receipt.tradeInModel ? ` · ${tradeInBrandLabel(receipt.tradeInBrand)} ${receipt.tradeInModel}` : ""}</span><span className="tabular-nums">- {money(receipt.tradeInValue ?? 0)}</span></div> : null}
                {(receipt.taxAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[#667066]"><span>Tax</span><span className="tabular-nums">{money(receipt.taxAmount ?? 0)}</span></div> : null}
                <div className="flex items-center justify-between border-t border-[#e2dfd4] pt-3 text-base font-semibold text-[#111111]"><span>Total</span><span className="tabular-nums">{money(receipt.total)}</span></div>
                <div className="flex items-center justify-between text-[#667066]"><span>Paid</span><span className="tabular-nums">{money(receipt.paidAmount)}</span></div>
                <div className="flex items-center justify-between font-semibold text-[#8a7047]"><span>Balance due</span><span className="tabular-nums">{money(Math.max(receipt.total - receipt.paidAmount, 0))}</span></div>
              </div>
            </div>
            {receiptPayLinks(receipt).length ? <div className="border-t border-[#eeeae0] px-6 py-5 sm:px-9"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#85877b]">Pay this invoice</p><div className="mt-3 space-y-2">{receiptPayLinks(receipt).map((link) => <p key={link.url} className="text-sm"><a href={link.url} className="font-semibold text-[#111111] underline underline-offset-2">{link.label}</a><span className="mt-0.5 block break-all text-[11px] text-[#777d73]">{link.url}</span></p>)}</div></div> : null}
            <div className="border-t border-[#e9e5d9] px-6 py-5 text-center sm:px-9"><p className="font-serif text-lg text-[#1a1a1a]">Thank you for choosing GadgetHub.</p><p className="mt-1 text-[10px] uppercase tracking-[0.17em] text-[#999789]">Keep this receipt for your records</p></div>
          </section>
        ) : null}

        {receipt?.stkPrompt && receipt.status !== "PAID" ? <section className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 sm:p-5 ${promptStatus === "FAILED" || receipt.status === "VOIDED" ? "border-[#e8c4b5] bg-[#fff6f1]" : "border-[#c4c4c4] bg-[#f5f5f5]"}`} aria-live="polite" aria-label="M-Pesa prompt status">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#4a4a4a]">M-Pesa prompt · {receipt.stkPrompt.phone.replace(/^254/, "0")}</p><p className="mt-1 text-sm font-semibold text-[#111111]">{receipt.status === "VOIDED" ? "Prompt expired. Stock has been released." : promptStatus === "FAILED" ? "The customer did not complete the payment" : promptStatus === "REVIEW" ? "Payment received but needs a manual check" : `Waiting for the customer to enter their PIN · ${money(receipt.total)}`}</p><p className="mt-1 text-xs text-[#6b6b6b]">{promptStatus === "FAILED" ? "They may have cancelled, entered a wrong PIN or not had enough balance. You can resend the prompt up to 3 times." : `${receipt.stkPrompt.message} The sale completes by itself when M-Pesa confirms. The money settles to the business Stanbic account.`}</p></div>
          {promptStatus === "FAILED" && receipt.status === "PENDING" ? <button type="button" disabled={resendingPrompt} onClick={() => void resendPrompt()} className="rounded-xl bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{resendingPrompt ? "Sending…" : "Resend prompt"}</button> : receipt.status === "PENDING" ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#4a4a4a]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#2f7d4f]"/>Checking every few seconds</span> : null}
        </section> : null}

        {receipt?.salePaymentLink && receipt.status === "PENDING" ? <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#c4c4c4] bg-[#f5f5f5] p-4 sm:p-5" aria-label="Third-party sale payment link"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#4a4a4a]">{receipt.payerMessage?.status === "SENT" ? "Payment link sent" : receipt.payerMessage?.status === "FAILED" ? "SMS delivery needs attention" : "Payment link queued"}</p><p className="mt-1 text-sm font-semibold text-[#1a1a1a]">{receipt.payerMessage?.status === "SENT" ? `Secure ${money(receipt.salePaymentLink.amount)} link sent to ${receipt.payerMessage.recipient}.` : receipt.payerMessage?.status === "QUEUED" ? `Secure link is queued for ${receipt.payerMessage.recipient}.` : `Send the payer a secure link for ${money(receipt.salePaymentLink.amount)}.`}</p><p className="mt-1 text-xs text-[#74786d]">{receipt.payerMessage?.status === "FAILED" ? "The link is still available below. Copy it and send it manually; the SMS will retry automatically." : receipt.payerMessage?.status === "QUEUED" ? "The outbox will retry delivery. You can copy the link if the payer needs it now." : "Stock is reserved until payment arrives or this request expires. The payer’s mobile number is prefilled on the payment page."}</p></div><button type="button" onClick={() => void copySalePayerLink(receipt.salePaymentLink!.token)} className="rounded-lg bg-[#1a1a1a] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1a1a1a]">{copiedSaleLink ? "Link copied" : "Copy payer link"}</button></section> : null}

        {receipt?.creditPlanLinks?.length ? <section className="rounded-xl border border-[#e7dfcb] bg-[#fbf8f0] p-4 sm:p-5" aria-label="Customer payment links">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#94784e]">Customer and payer links</p><p className="mt-1 text-sm font-semibold text-[#1a1a1a]">Share the right link with each person</p><p className="mt-1 text-xs text-[#74786d]">The customer schedule shows the account. The separate payer link hides those details and starts an M-Pesa prompt when Daraja is configured.</p></div></div>
          <div className="mt-3 space-y-2">{receipt.creditPlanLinks.map((plan, index) => <div key={`${plan.productName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e9e4d8] bg-white px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-xs font-medium text-[#1a1a1a]">{plan.productName}</span><span className="mt-0.5 block font-mono text-[10px] text-[#889287]">PayBill reference: {plan.planReference}</span></span><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyCustomerLink(plan.token)} className="rounded-md border border-[#c4c4c4] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1a1a1a] hover:bg-[#f5f5f5]">{copiedCustomerLink === plan.token ? "Copied" : "Customer schedule"}</button>{plan.payerToken ? <button type="button" onClick={() => void copyPayerLink(plan.payerToken!)} className="rounded-md bg-[#1a1a1a] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1a1a1a]">{copiedPayerLink === plan.payerToken ? "Copied" : `Payer link · ${money(plan.payerAmount ?? 0)}`}</button> : null}</div></div>)}</div>
        </section> : null}

        <div className="sales-layout grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="product-catalog min-w-0 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_4px_18px_rgba(0,0,0,.03)]">
            <div className="flex flex-col gap-3 border-b border-[#e5e5e5] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" /><input ref={productSearch} aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or category" className="w-full border border-[#c4c4c4] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#1a1a1a]" /></div><span className="text-xs text-[#69746c]">{loading ? "Loading catalogue…" : `${filteredProducts.length} products`}</span></div>
            {!cashierMode && !loading && categories.length > 1 ? <div className="flex gap-2 overflow-x-auto border-b border-[#e5e5e5] px-4 py-3">{categories.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${activeCategory === category ? "border-[#c4c4c4] bg-[#f5f5f5] text-[#2d2d2d]" : "border-transparent bg-[#f5f5f5] text-[#849188] hover:border-[#e5e5e5] hover:text-[#2d2d2d]"}`}>{category}</button>)}</div> : null}
            {loading ? <div className="p-8 text-sm text-[#69746c]">Connecting to branch inventory…</div> : filteredProducts.length ? <div className="sales-product-list grid gap-2.5 p-3 sm:grid-cols-2">{filteredProducts.map((product) => <div key={product.id} className="sales-product-card flex items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] bg-white p-3 transition"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-[#f5f5f5] to-[#e5e5e5] text-[#4a4a4a] ring-1 ring-[#e5e5e5]"><Package className="h-[17px] w-[17px]" strokeWidth={1.7}/></span><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[#111111]">{product.name}</p><p className="mt-1 truncate text-[10px] text-[#89958d]">{product.sku}<span className="px-1.5 text-[#c2cbc4]">Â·</span>{product.category}</p></div></div><div className="flex shrink-0 items-center gap-4"><div className="text-right"><p className="text-sm font-semibold tabular-nums">{money(product.sellingPrice)}</p><p className={`mt-1 text-[10px] font-medium ${product.available ? "text-[#2d2d2d]" : "text-[#9b4a3d]"}`}>{product.available} available</p></div><button type="button" disabled={product.available < 1 || (cart[product.id] ?? 0) >= product.available} onClick={() => setQuantity(product, (cart[product.id] ?? 0) + 1)} aria-label={`Add ${product.name}`} className={`grid h-9 w-9 place-items-center rounded-xl transition ${cart[product.id] ? "bg-[#e5e5e5] text-[#2d2d2d]" : "border border-[#e5e5e5] bg-white text-[#4a4a4a] shadow-sm hover:border-[#c4c4c4] hover:bg-[#f5f5f5]"} disabled:cursor-not-allowed disabled:opacity-35`}>{cart[product.id] ? <Check className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}</button></div></div>)}</div> : <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f5f5f5] text-[#839187]"><Package className="h-5 w-5"/></span><p className="mt-3 text-sm font-semibold">{products.length ? "No matching products" : "No products stocked at this branch"}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#839087]">{products.length ? "Try another name, SKU or category." : "Add products and receive stock into this branch before making a sale."}</p></div></div>}
          </section>

          <form onSubmit={completeSale} className="sales-checkout h-fit overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_10px_28px_rgba(0,0,0,.06)] xl:sticky xl:top-[96px]">
            <div className="flex items-center justify-between border-b border-[#e5e5e5] bg-[#f5f5f5] px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e5e5e5] text-[#2d2d2d]"><ShoppingBag className="h-4 w-4"/></span><div><h3 className="text-sm font-semibold text-[#111111]">Current sale</h3><p className="mt-0.5 text-[10px] text-[#8b978f]">Review before checkout</p></div></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#6d7f73] ring-1 ring-[#e5e5e5]">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} units</span></div>
            {cartItems.length ? <div className="divide-y divide-[#f5f5f5] px-4">{cartItems.map(({ product, quantity }) => <div key={product.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[#1a1a1a]">{product.name}</p><p className="mt-1 text-[10px] text-[#87948c]">{money(product.sellingPrice)} each</p></div><button type="button" onClick={() => setQuantity(product, 0)} aria-label={`Remove ${product.name}`} className="rounded-lg p-1.5 text-[#aa746b] transition hover:bg-[#fff0ed] hover:text-[#a54f40]"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="mt-2.5 flex items-center justify-between"><div className="flex items-center rounded-lg border border-[#e5e5e5] bg-[#f5f5f5]"><button type="button" onClick={() => setQuantity(product, quantity - 1)} aria-label={`Decrease ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-l-lg text-[#6b7b70] transition hover:bg-[#f5f5f5]"><Minus className="h-3.5 w-3.5" /></button><span className="w-8 text-center text-xs font-semibold tabular-nums text-[#1a1a1a]">{quantity}</span><button type="button" disabled={quantity >= product.available} onClick={() => setQuantity(product, quantity + 1)} aria-label={`Increase ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-r-lg text-[#4a4a4a] transition hover:bg-[#f5f5f5] disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button></div><span className="text-[13px] font-bold tabular-nums text-[#1a1a1a]">{money(product.sellingPrice * quantity)}</span></div></div>)}</div> : <div className="grid min-h-48 place-items-center px-5 py-7 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-[17px] bg-[#f5f5f5] text-[#6b6b6b]"><ShoppingBag className="h-5 w-5" strokeWidth={1.6}/></span><p className="mt-3 text-xs font-semibold text-[#2d2d2d]">Your sale starts here</p><p className="mx-auto mt-1 max-w-[200px] text-[11px] leading-relaxed text-[#909b93]">Choose an item from the catalogue to build the customer’s basket.</p></div></div>}
            <div className="space-y-4 border-t border-[#e5e5e5] p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Customer <span className="font-normal normal-case tracking-normal">(optional for cash sales)</span></span>{customerId ? <span className="text-[10px] font-medium text-[#4a4a4a]">Existing account</span> : null}</div>
                {showNewCustomer ? <div className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-[#1a1a1a]"><UserRoundPlus className="h-4 w-4"/>Create customer record</div><button type="button" onClick={() => { setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="text-[10px] font-semibold text-[#77847a] underline underline-offset-2">Use saved customer</button></div>
                  <div className="space-y-2.5">
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Customer full name<input required minLength={2} maxLength={120} autoComplete="name" value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Name on the account" className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#6b6b6b]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Mobile number<input required minLength={7} maxLength={30} autoComplete="tel" type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="07xx xxx xxx" className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#6b6b6b]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#748176]">Email <span className="font-normal normal-case tracking-normal">(optional)</span><input type="email" maxLength={254} autoComplete="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" className="mt-1 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#6b6b6b]"/></label>
                  </div>
                  <p className="mt-2.5 text-[10px] leading-relaxed text-[#879287]">The customer and their payment schedule are saved together when checkout completes.</p>
                </div> : <div className="flex gap-2"><select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="min-w-0 flex-1 rounded-lg border border-[#c4c4c4] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1a1a1a]"><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select><button type="button" onClick={() => { setCustomerId(""); setShowNewCustomer(true); }} aria-label="Add a new customer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-[#f5f5f5] px-3 text-[11px] font-semibold text-[#2d2d2d] transition hover:bg-[#e5e5e5]"><Plus className="h-3.5 w-3.5"/>New</button></div>}
              </div>
              <fieldset><legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#69746c]">How are they paying?</legend><div className="grid grid-cols-3 overflow-hidden rounded-lg border border-[#c4c4c4] sm:grid-cols-4">{paymentMethods.map((method) => <button key={method.value} type="button" aria-pressed={paymentMethod === method.value} onClick={() => { setPaymentMethod(method.value); if (method.value === "CREDIT" && !customerId) setShowNewCustomer(true); }} className={`px-1 py-2.5 text-[10px] font-semibold transition sm:text-xs ${paymentMethod === method.value ? "bg-[#111111] text-white" : "bg-white text-[#5f6e63] hover:bg-[#f5f5f5]"}`}>{method.label}</button>)}</div>{paymentMethod === "CREDIT" ? <p className="mt-1.5 text-[10px] text-[#78867b]">Start a Lipa plan and collect the customer details below. If the customer has an email address, payment reminders by email are switched on as part of the agreement.</p> : paymentMethod === "MPESA_STK" ? <div className="mt-3 space-y-2 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#68796d]">Customer’s Safaricom number<input required type="tel" autoComplete="tel" minLength={9} maxLength={20} value={mpesaPhone} onChange={(event) => setMpesaPhone(event.target.value)} placeholder="07xx xxx xxx" className="mt-1.5 w-full rounded-lg border border-[#c4c4c4] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#6b6b6b]"/></label><p className="text-[9px] text-[#879287]">The customer gets an M-Pesa prompt for the total and enters their PIN on their phone. The sale completes when M-Pesa confirms, and the money settles to the business Stanbic account.</p></div> : paymentMethod === "PAY_LINK" ? <div className="mt-3 space-y-2.5 rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#68796d]">Payer’s mobile number<input required type="tel" autoComplete="tel" minLength={7} maxLength={30} value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="07xx xxx xxx" className="mt-1.5 w-full rounded-lg border border-[#c4c4c4] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[#111111] outline-none focus:border-[#6b6b6b]"/></label><label className="flex items-start gap-2 text-[10px] leading-4 text-[#707c72]"><input type="checkbox" required checked={payerConsent} onChange={(event) => setPayerConsent(event.target.checked)} className="mt-0.5 accent-[#1a1a1a]"/><span>I have the payer’s permission to text them this one-time link.</span></label><p className="text-[9px] text-[#879287]">The secure link will be sent by SMS after recording the sale. The number will be prefilled for the M-Pesa prompt.</p></div> : null}</fieldset>
              <TradeInPanel form={tradeIn} onChange={setTradeIn} subtotal={subtotal} staffName={staffName} customer={tradeInCustomer}/>
              {paymentMethod === "CREDIT" ? <div className="space-y-3 rounded-xl border border-[#e6e1d5] bg-[#fbfaf6] p-3.5">
                <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#e5e5e5] text-[#2d2d2d]"><CreditCard className="h-4 w-4"/></span><div><p className="text-xs font-semibold text-[#1a1a1a]">Lipa Mdogo Mdogo</p><p className="mt-0.5 text-[10px] text-[#7d8175]">Minimum 40% deposit. The rest is split over the plan.</p></div></div><span className="rounded-full bg-[#f1eadb] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#886d3e]">Take home</span></div>
                <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Repayment term</p><div className="grid grid-cols-3 gap-1.5">{([3, 6, 12] as const).map((months) => <button key={months} type="button" aria-pressed={creditTermMonths === months} onClick={() => setCreditTermMonths(months)} className={`rounded-lg border px-2 py-2 text-center transition ${creditTermMonths === months ? "border-[#2d2d2d] bg-[#e5e5e5] text-[#2d2d2d] shadow-[inset_0_0_0_1px_#2d2d2d]" : "border-[#e5e2d8] bg-white text-[#74796d] hover:border-[#c4c4c4]"}`}><span className="block text-xs font-bold">{months}</span><span className="text-[9px]">months</span></button>)}</div></div>
                <div><label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]" htmlFor="credit-deposit">Deposit collected today</label><div className="relative mt-1.5"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[10px] font-semibold text-[#889187]">KES</span><input id="credit-deposit" type="number" min={Math.max(1, Math.ceil(total * creditPolicy.minimumDepositPercent / 100))} max={Math.max(1, total - 1)} step="1" required value={creditDepositAmount} onChange={(event) => setCreditDepositAmount(event.target.value)} placeholder="Enter amount received" className="w-full rounded-lg border border-[#e3e1d7] bg-white py-2.5 pl-12 pr-3 text-sm normal-case tracking-normal outline-none focus:border-[#6b6b6b]"/></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[9px] text-[#8a8d80]">Minimum {creditPolicy.minimumDepositPercent}% of amount after trade-in</span><div className="flex gap-1.5">{([40, 50, 60] as const).map((percent) => <button key={percent} type="button" disabled={total < 2 || percent < creditPolicy.minimumDepositPercent} onClick={() => setCreditDepositAmount(String(Math.max(1, Math.min(total - 1, Math.round(total * percent / 100)))))} className="rounded-md border border-[#e5e2d8] bg-white px-2 py-1 text-[9px] font-semibold text-[#627366] hover:border-[#a3a3a3] disabled:opacity-40">{percent}%</button>)}</div></div></div>
                <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Deposit paid by<select value={creditDepositMethod} onChange={(event) => setCreditDepositMethod(event.target.value as typeof creditDepositMethod)} className="mt-1.5 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#111111]"><option value="MPESA">M-Pesa</option><option value="CASH">Cash</option><option value="CARD">Card</option></select></label>
                {creditDepositMethod === "MPESA" ? <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Verified M-Pesa transaction code<input required minLength={6} maxLength={32} value={creditDepositReference} onChange={(event) => setCreditDepositReference(event.target.value.toUpperCase())} placeholder="e.g. QWE123ABC" className="mt-1 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal"/><span className="mt-1 block text-[10px] font-normal normal-case leading-4 tracking-normal text-[#8b887c]">Confirm the deposit in M-Pesa before checkout. The code is added to the payment record.</span></label> : null}
                {cartItems.length === 1 && cartItems[0].quantity === 1 ? <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Device IMEI <span className="font-normal normal-case tracking-normal">(optional)</span><input inputMode="numeric" pattern="[0-9]{14,16}" minLength={14} maxLength={16} value={creditImei} onChange={(event) => setCreditImei(event.target.value.replace(/\D/g, ""))} placeholder="15-digit device IMEI" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal"/><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">Saved on the account to help identify the device during collections and recovery.</span></label> : null}
                <div className="rounded-xl border border-[#e6e6dc] bg-white p-3.5"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#768176]"><Sparkles className="h-3.5 w-3.5 text-[#9b8150]"/>Plan at a glance</div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#f5f5f5] p-2.5"><p className="text-[9px] text-[#839084]">Amount after deposit</p><p className="mt-1 text-xs font-bold tabular-nums text-[#1a1a1a]">{money(creditBalance)}</p></div><div className="rounded-lg bg-[#f5f5f5] p-2.5"><p className="text-[9px] text-[#839084]">Each month of that amount</p><p className="mt-1 text-xs font-bold tabular-nums text-[#1a1a1a]">{money(estimatedInstallment)}</p></div></div><div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeece5] pt-2.5 text-[10px] text-[#7c857b]"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5"/>First due {firstDueDate || "next month"}</span><span>{creditTermMonths} payments of the remaining amount</span></div><p className="mt-2 text-[9px] leading-relaxed text-[#96988d]">Monthly instalments are the amount paid after the deposit, split over {creditTermMonths} months.</p></div>
                <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[#888a7e]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b6b6b]"/>Review the deposit with the customer before confirming. Checkout deducts stock and opens their payment account.</p>
              </div> : null}
              {paymentMethod === "SPLIT" ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-[#69746c]">Split tender</p><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="First payment method" value={firstTenderMethod} onChange={(event) => setFirstTenderMethod(event.target.value as typeof firstTenderMethod)} className="border border-[#c4c4c4] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><input aria-label="First payment amount in KES" type="number" min="1" max={Math.max(1, total - 1)} step="1" required value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="w-full border border-[#c4c4c4] px-2 py-2 text-sm" /></div><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="Second payment method" value={secondTenderMethod} onChange={(event) => setSecondTenderMethod(event.target.value as typeof secondTenderMethod)} className="border border-[#c4c4c4] bg-white px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><p className="border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-2 text-sm">{money(Math.max(0, total - Number(paidAmount || 0)))}</p></div>{firstTenderMethod === secondTenderMethod ? <p role="alert" className="text-xs text-red-700">Choose two different payment methods.</p> : null}</div> : null}
              <div className="rounded-xl bg-[#f5f5f5] px-3.5 py-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#708076]">Total due</span><span className="text-xl font-bold tracking-[-.04em] tabular-nums text-[#1a1a1a]">{money(total)}</span></div>{acceptedTradeIn > 0 ? <p className="mt-1.5 text-[10px] text-[#92a096]">After {money(acceptedTradeIn)} {tradeIn.model || "device"} trade-in</p> : <p className="mt-1.5 text-[10px] text-[#92a096]">Prices include all selected Apple items</p>}</div>
              <button type="submit" disabled={checkoutBlocked} className={`min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${checkoutBlocked ? "cursor-not-allowed bg-[#d4d4d4] text-[#6b6b6b]" : "bg-[#111111] text-white shadow-[0_5px_16px_rgba(0,0,0,.13)] hover:bg-[#1a1a1a]"}`}>{submitting ? "Recording sale…" : paymentMethod === "CREDIT" ? "Collect deposit & start plan" : paymentMethod === "PAY_LINK" ? "Record sale & text payer" : paymentMethod === "MPESA_STK" ? "Send M-Pesa prompt" : "Complete sale"}</button>
              {paymentMethod === "CREDIT" ? <p className="flex items-center justify-center gap-1.5 text-[9px] text-[#93988d]"><ShieldCheck className="h-3 w-3"/>Sale, deposit, customer and schedule are recorded together</p> : null}
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
