"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, CreditCard, Download, Maximize2, Minimize2, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, Trash2, UserRoundPlus } from "lucide-react";
import { BarcodeCapture } from "@/components/barcode-capture";
import { detectDeviceCode, type DetectedCode } from "@/lib/barcode-scanner";
import { claimFromIdentifier } from "@/lib/device-units";
import { ReceiptRecovery } from "@/components/receipt-recovery";
import { downloadSaleReceipt } from "@/lib/receipt-pdf";
import { matchSaleScan } from "@/lib/sale-scan";
import { takeSaleCustomer } from "@/lib/workflow-handoff";

type KnownDevice = { id: string; imei: string | null; imei2: string | null; serialNumber: string | null };
type Product = { id: string; sku: string; name: string; category: string; sellingPrice: number; available: number; tracksUnits?: boolean; devices?: KnownDevice[] };
type Customer = { id: string; name: string; phone: string };
type CreditPolicy = { minimumDepositPercent: number; defaultCreditLimit: number };
type StanbicSales = { provider: "stanbic"; connected: false; missing: string[]; detail: string };
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
  payments: { amount: number; method: string; reference?: string | null }[];
  creditPlanLinks?: { token: string; planReference: string; productName: string; payerToken?: string; payerAmount?: number }[];
  salePaymentLink?: { token: string; amount: number } | null;
  payerMessage?: { recipient: string; status: "SENT" | "FAILED" | "QUEUED" } | null;
};
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const paymentMethods = [{ value: "CASH", label: "Cash" }, { value: "MPESA", label: "M-Pesa" }, { value: "CARD", label: "Card" }, { value: "COD", label: "Cash on delivery" }, { value: "CREDIT", label: "Lipa plan" }, { value: "SPLIT", label: "Split" }, { value: "PAY_LINK", label: "Payer link" }] as const;
const blankCustomer: NewCustomer = { name: "", phone: "", email: "" };

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>({ minimumDepositPercent: 20, defaultCreditLimit: 0 });
  const [stanbic, setStanbic] = useState<StanbicSales | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [deviceDrafts, setDeviceDrafts] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All items");
  const [customerId, setCustomerId] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>(blankCustomer);
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>("CASH");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerConsent, setPayerConsent] = useState(false);
  const [creditTermMonths, setCreditTermMonths] = useState<4 | 6 | 12>(4);
  const [creditDepositAmount, setCreditDepositAmount] = useState("");
  const [creditDepositMethod, setCreditDepositMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [creditDepositReference, setCreditDepositReference] = useState("");
  const [creditImei, setCreditImei] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [firstTenderMethod, setFirstTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("CASH");
  const [secondTenderMethod, setSecondTenderMethod] = useState<"CASH" | "MPESA" | "CARD">("MPESA");
  const [paymentReference, setPaymentReference] = useState("");
  const [firstTenderReference, setFirstTenderReference] = useState("");
  const [secondTenderReference, setSecondTenderReference] = useState("");
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
    const requestedCustomerId = takeSaleCustomer();
    if (requestedCustomerId && data.customers.some((customer: Customer) => customer.id === requestedCustomerId)) setCustomerId(requestedCustomerId);
    setCreditPolicy(data.creditPolicy ?? { minimumDepositPercent: 20, defaultCreditLimit: 0 });
    setStanbic(data.stanbic?.provider === "stanbic" ? data.stanbic : null);
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
  const total = cartItems.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  const deposit = Number(creditDepositAmount) || 0;
  const previewDeposit = Number.isFinite(deposit) ? Math.min(total, Math.max(0, Math.trunc(deposit))) : 0;
  const creditBalance = Math.max(0, total - previewDeposit);
  const estimatedInstallment = cartItems.reduce((sum, item, index) => {
    const lineTotal = item.product.sellingPrice * item.quantity;
    const allocatedDeposit = index === cartItems.length - 1
      ? previewDeposit - cartItems.slice(0, index).reduce((allocated, previous) => allocated + (total > 0 ? Number((BigInt(previewDeposit) * BigInt(previous.product.sellingPrice * previous.quantity)) / BigInt(total)) : 0), 0)
      : total > 0 ? Number((BigInt(previewDeposit) * BigInt(lineTotal)) / BigInt(total)) : 0;
    return sum + Math.ceil(Math.max(0, lineTotal - allocatedDeposit) / creditTermMonths);
  }, 0);
  const newCustomerReady = newCustomer.name.trim().length >= 2 && newCustomer.phone.trim().length >= 7;
  const devicesIncomplete = cartItems.some(({ product, quantity }) => {
    if (!product.tracksUnits) return false;
    const drafts = deviceDrafts[product.id] ?? [];
    return drafts.length !== quantity || drafts.some((value) => !claimFromIdentifier(value, product.devices ?? []));
  });
  const receiptSubtotal = receipt?.saleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) ?? 0;
  const categories = ["All items", ...Array.from(new Set(products.map((product) => product.category))).sort((a, b) => a.localeCompare(b))];
  const filteredProducts = products.filter((product) => {
    const deviceText = (product.devices ?? []).map((device) => `${device.imei ?? ""} ${device.imei2 ?? ""} ${device.serialNumber ?? ""}`).join(" ");
    return (activeCategory === "All items" || product.category === activeCategory) && `${product.name} ${product.sku} ${product.category} ${deviceText}`.toLowerCase().includes(query.toLowerCase());
  });
  const mpesaReferenceReady = (value: string) => value.trim().length >= 6;

  function setQuantity(product: Product, quantity: number) {
    const nextQuantity = quantity < 1 ? 0 : Math.min(quantity, product.available);
    setCart((current) => {
      const next = { ...current };
      if (nextQuantity < 1) delete next[product.id];
      else next[product.id] = nextQuantity;
      return next;
    });
    if (product.tracksUnits) {
      setDeviceDrafts((current) => {
        const next = { ...current };
        if (nextQuantity < 1) delete next[product.id];
        else next[product.id] = Array.from({ length: nextQuantity }, (_, index) => next[product.id]?.[index] ?? "");
        return next;
      });
    }
    setReceipt(null);
  }

  function addScannedCode(code: DetectedCode) {
    const match = matchSaleScan(products, code);
    if (match.status === "unknown") {
      setError("No sellable device matches that code. Ask inventory to verify its stock or approval state.");
      return;
    }
    if (match.status === "unavailable") {
      setError(`${match.name} cannot be sold. It is out of stock, held, or already sold.`);
      return;
    }
    const product = products.find((item) => item.id === match.productId);
    if (!product) return;
    setError("");
    if (match.status === "sku") {
      if ((cart[product.id] ?? 0) >= product.available) {
        setError(`${product.name} has no more units available.`);
        return;
      }
      setQuantity(product, (cart[product.id] ?? 0) + 1);
      return;
    }
    const drafts = deviceDrafts[product.id] ?? [];
    const scanned = match.identifier.replace(/[\s-]/g, "").toUpperCase();
    if (drafts.some((value) => value.replace(/[\s-]/g, "").toUpperCase() === scanned)) {
      setError("That device is already in this sale.");
      return;
    }
    const empty = drafts.findIndex((value) => !value.trim());
    if (empty >= 0) {
      setDeviceDrafts((current) => ({
        ...current,
        [product.id]: (current[product.id] ?? drafts).map((value, index) => index === empty ? match.identifier : value),
      }));
      return;
    }
    if ((cart[product.id] ?? 0) >= product.available) {
      setError(`${product.name} has no more units available.`);
      return;
    }
    const nextQuantity = (cart[product.id] ?? 0) + 1;
    setQuantity(product, nextQuantity);
    setDeviceDrafts((current) => {
      const next = Array.from({ length: nextQuantity }, (_, index) => current[product.id]?.[index] ?? "");
      next[nextQuantity - 1] = match.identifier;
      return { ...current, [product.id]: next };
    });
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
          items: cartItems.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
            ...(product.tracksUnits ? { devices: (deviceDrafts[product.id] ?? []).map((value) => claimFromIdentifier(value, product.devices ?? [])).filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)) } : {}),
          })),
          customerId: customerId || null,
          ...(showNewCustomer ? { newCustomer } : {}),
          paymentMethod,
          ...(paymentMethod === "MPESA" ? { paymentReference } : {}),
          ...(paymentMethod === "PAY_LINK" ? { payerPhone, payerConsent } : {}),
          ...(paymentMethod === "CREDIT" ? {
            creditTermMonths,
            creditDepositAmount: Number(creditDepositAmount),
            creditDepositMethod,
            ...(creditDepositMethod === "MPESA" ? { creditDepositReference } : {}),
            ...(creditImei ? { imei: creditImei } : {}),
          } : {}),
          paymentBreakdown: paymentMethod === "SPLIT" ? [
            { method: firstTenderMethod, amount: Number(paidAmount), ...(firstTenderMethod === "MPESA" ? { reference: firstTenderReference } : {}) },
            { method: secondTenderMethod, amount: total - Number(paidAmount), ...(secondTenderMethod === "MPESA" ? { reference: secondTenderReference } : {}) },
          ] : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sale could not be completed.");
      setReceipt(data);
      setCart({});
      setDeviceDrafts({});
      setCustomerId("");
      setShowNewCustomer(false);
      setNewCustomer(blankCustomer);
      setPaymentMethod("CASH");
      setPayerPhone("");
      setPayerConsent(false);
      setCreditDepositAmount("");
      setCreditDepositReference("");
      setCreditImei("");
      setPaymentReference("");
      setFirstTenderReference("");
      setSecondTenderReference("");
      await loadCatalogue();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sale could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className={`sales-workspace space-y-5 ${cashierMode ? "cashier-mode" : ""}`}>
        <div className="sales-hero flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[0_4px_18px_rgb(0_0_0/.035)] sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">Point of sale</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">New sale</h2><p className="mt-1.5 text-sm text-[var(--foreground)]">Search the catalogue, scan a code, and check out in one place.</p>{stanbic ? <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--warning-text)]">{stanbic.detail}</p> : null}</div><div className="flex items-center gap-3"><p className="hidden text-sm text-[var(--foreground)] sm:block">Live prices and available stock</p><button type="button" aria-pressed={cashierMode} onClick={() => setCashierMode((active) => !active)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)]">{cashierMode ? <Minimize2 className="h-3.5 w-3.5"/> : <Maximize2 className="h-3.5 w-3.5"/>}{cashierMode ? "Exit cashier mode" : "Cashier mode"}</button></div></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {receipt ? (
          <section className="receipt-print mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-[#8a5a12] bg-[var(--panel)] shadow-[0_18px_55px_rgb(0_0_0/0.09)]" aria-label="Sale receipt">
            <div className="receipt-top flex flex-col gap-6 border-b border-[var(--border)] bg-[var(--background)] px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-9 sm:py-8">
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0a7d56] font-serif text-xl text-[#b7791f]">G</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--warning-text)]">GadgetHub / Sales receipt</p>
                  <h3 className="mt-1 font-serif text-3xl font-medium tracking-tight text-[var(--foreground)]">{receipt.branch.name}</h3>
                  <p className="mt-1 max-w-md text-xs leading-5 text-[var(--foreground)]">{receipt.branch.address}</p>
                  <p className="text-xs text-[var(--foreground)]">{receipt.branch.phone}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                {receipt.status === "PAID" || receipt.status === "PARTIAL" ? <><button type="button" onClick={() => window.print()} className="rounded-lg border border-[#8a5a12] bg-[var(--panel)] px-3.5 py-2.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)]">Print receipt</button>
                <button type="button" onClick={() => downloadSaleReceipt(receipt)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#8a5a12] bg-[var(--panel)] px-3.5 py-2.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)]"><Download className="h-3.5 w-3.5" />Save PDF</button></> : <span className="self-center text-[10px] font-medium text-[var(--warning-text)]">Receipt available after payment clears</span>}
                <button type="button" onClick={() => setReceipt(null)} className="rounded-lg bg-[#0a7d56] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#0a7d56]">New sale</button>
              </div>
            </div>

            <div className="grid gap-5 border-b border-[var(--border)] px-6 py-6 sm:grid-cols-[1fr_auto] sm:px-9">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Invoice number</p><p className="mt-1 font-mono text-xl font-semibold tracking-tight text-[var(--foreground)]">{receipt.invoiceNumber}</p><p className="mt-2 text-sm text-[var(--foreground)]">{new Date(receipt.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</p>{receipt.status === "PENDING" ? <p className="mt-1 text-xs font-semibold text-[var(--warning-text)]">Sale pending · waiting for payer</p> : null}</div>
              <div className="flex items-center gap-4 sm:text-right"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{receipt.customer ? "Billed to" : "Customer"}</p><p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{receipt.customer?.name ?? "Walk-in customer"}</p><p className="mt-0.5 text-xs text-[var(--foreground)]">{receipt.customer?.phone ?? "Thank you for shopping with us"}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] ${receipt.status === "VOIDED" ? "bg-[var(--danger-soft)] text-[var(--danger-text)]" : receipt.status === "PAID" ? "bg-[var(--background)] text-[var(--foreground)]" : "bg-[var(--warning-soft)] text-[var(--warning-text)]"}`}>{receipt.status === "PENDING" ? "Awaiting payment" : receipt.status === "VOIDED" ? "Request expired" : receipt.status === "PAID" ? "Paid" : "Balance due"}</span></div>
            </div>

            <div className="px-6 py-6 sm:px-9">
              <div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Purchase details</p><p className="mt-1 text-sm text-[var(--foreground)]">{receipt.saleItems.reduce((sum, item) => sum + item.quantity, 0)} items</p></div><p className="text-xs text-[var(--foreground)]">Served by <span className="font-medium text-[var(--foreground)]">{receipt.cashier.name}</span></p></div>
              <div className="overflow-x-auto border-y border-[var(--border)]">
                <div className="receipt-table min-w-[540px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] gap-3 bg-[var(--background)] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-right">Amount</span></div>
                  {receipt.saleItems.map((item, index) => <div key={`${item.product.sku}-${index}`} className="grid grid-cols-[minmax(0,1fr)_56px_130px_140px] items-center gap-3 border-t border-[var(--border)] px-3 py-4 text-sm"><div className="min-w-0"><p className="font-medium text-[var(--foreground)]">{item.product.name}</p><p className="mt-1 text-[10px] tracking-wide text-[var(--muted)]">SKU {item.product.sku}</p></div><span className="text-right tabular-nums text-[var(--foreground)]">{item.quantity}</span><span className="text-right tabular-nums text-[var(--foreground)]">{money(item.unitPrice)}</span><span className="text-right font-semibold tabular-nums text-[var(--foreground)]">{money(item.total)}</span></div>)}
                </div>
              </div>
            </div>

            <div className="grid gap-8 border-t border-[var(--border)] bg-[var(--background)] px-6 py-6 sm:grid-cols-[1fr_280px] sm:px-9 sm:py-7">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Payment details</p><div className="mt-3 space-y-2">{receipt.payments.length ? receipt.payments.map((payment, index) => <div key={`${payment.method}-${index}`} className="flex max-w-sm items-center justify-between gap-3 text-sm text-[var(--foreground)]"><span>{payment.method === "MPESA" ? "M-Pesa" : payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span><span className="font-medium tabular-nums text-[var(--foreground)]">{money(payment.amount)}</span></div>) : <p className="text-sm text-[var(--foreground)]">{receipt.status === "PENDING" ? "Waiting for M-Pesa confirmation by the payer" : receipt.paymentMethod === "COD" ? "Cash on delivery outstanding" : "Credit sale payment outstanding"}</p>}</div></div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between text-[var(--foreground)]"><span>Subtotal</span><span className="tabular-nums">{money(receiptSubtotal)}</span></div>
                {(receipt.discountAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[var(--foreground)]"><span>Discount</span><span className="tabular-nums">- {money(receipt.discountAmount ?? 0)}</span></div> : null}
                {(receipt.taxAmount ?? 0) > 0 ? <div className="flex items-center justify-between text-[var(--foreground)]"><span>Tax</span><span className="tabular-nums">{money(receipt.taxAmount ?? 0)}</span></div> : null}
                <div className="flex items-center justify-between border-t border-[#8a5a12] pt-3 text-base font-semibold text-[var(--foreground)]"><span>Total</span><span className="tabular-nums">{money(receipt.total)}</span></div>
                <div className="flex items-center justify-between text-[var(--foreground)]"><span>Paid</span><span className="tabular-nums">{money(receipt.paidAmount)}</span></div>
                <div className="flex items-center justify-between font-semibold text-[var(--warning-text)]"><span>Balance due</span><span className="tabular-nums">{money(Math.max(receipt.total - receipt.paidAmount, 0))}</span></div>
              </div>
            </div>
            <div className="border-t border-[var(--border)] px-6 py-5 text-center sm:px-9"><p className="font-serif text-lg text-[var(--foreground)]">Thank you for choosing GadgetHub.</p><p className="mt-1 text-[10px] uppercase tracking-[0.17em] text-[var(--muted)]">Keep this receipt for your records</p></div>
          </section>
        ) : null}

        {receipt && ["PAID","PARTIAL"].includes(receipt.status) && <ReceiptRecovery saleId={receipt.id}/> }
        {receipt?.salePaymentLink && receipt.status === "PENDING" ? <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4 sm:p-5" aria-label="Third-party sale payment link"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--foreground)]">{receipt.payerMessage?.status === "SENT" ? "Payment link sent" : receipt.payerMessage?.status === "FAILED" ? "SMS delivery needs attention" : "Payment link queued"}</p><p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{receipt.payerMessage?.status === "SENT" ? `Secure ${money(receipt.salePaymentLink.amount)} link sent to ${receipt.payerMessage.recipient}.` : receipt.payerMessage?.status === "QUEUED" ? `Secure link is queued for ${receipt.payerMessage.recipient}.` : `Send the payer a secure link for ${money(receipt.salePaymentLink.amount)}.`}</p><p className="mt-1 text-xs text-[var(--foreground)]">{receipt.payerMessage?.status === "FAILED" ? "The link is still available below. Copy it and send it manually; the SMS will retry automatically." : receipt.payerMessage?.status === "QUEUED" ? "The outbox will retry delivery. You can copy the link if the payer needs it now." : "Stock is reserved until payment arrives or this request expires. The payer’s mobile number is prefilled on the payment page."}</p></div><button type="button" onClick={() => void copySalePayerLink(receipt.salePaymentLink!.token)} className="rounded-lg bg-[#0a7d56] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#111111]">{copiedSaleLink ? "Link copied" : "Copy payer link"}</button></section> : null}

        {receipt?.creditPlanLinks?.length ? <section className="rounded-xl border border-[#8a5a12] bg-[var(--warning-soft)] p-4 sm:p-5" aria-label="Customer payment links">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--warning-text)]">Customer and payer links</p><p className="mt-1 text-sm font-semibold text-[var(--foreground)]">Share the right link with each person</p><p className="mt-1 text-xs text-[var(--foreground)]">The customer schedule shows the account. The separate payer link hides those details and starts an M-Pesa prompt when Daraja is configured.</p></div></div>
          <div className="mt-3 space-y-2">{receipt.creditPlanLinks.map((plan, index) => <div key={`${plan.productName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-xs font-medium text-[var(--foreground)]">{plan.productName}</span><span className="mt-0.5 block font-mono text-[10px] text-[var(--muted)]">PayBill reference: {plan.planReference}</span></span><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyCustomerLink(plan.token)} className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--background)]">{copiedCustomerLink === plan.token ? "Copied" : "Customer schedule"}</button>{plan.payerToken ? <button type="button" onClick={() => void copyPayerLink(plan.payerToken!)} className="rounded-md bg-[#0a7d56] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#111111]">{copiedPayerLink === plan.payerToken ? "Copied" : `Payer link · ${money(plan.payerAmount ?? 0)}`}</button> : null}</div></div>)}</div>
        </section> : null}

        <div className="sales-layout grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <section className="product-catalog min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_4px_18px_rgb(0_0_0/.03)]">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]" /><input aria-label="Search products or scan a device identifier" ref={productSearch}  value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); const detected = detectDeviceCode(query); addScannedCode(detected.imei || detected.serialNumber || detected.productCode ? detected : { ...detected, raw: query, productCode: query.trim() }); }} placeholder="Search name, SKU, IMEI or serial" className="w-full border border-[var(--border)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#0a7d56]" /></div><span className="text-xs text-[var(--foreground)]">{loading ? "Loading catalogue…" : `${filteredProducts.length} products`}</span></div>
            {!cashierMode && !loading && categories.length > 1 ? <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] px-4 py-3">{categories.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${activeCategory === category ? "border-[#e5f5ee] bg-[var(--accent-soft)] text-[var(--accent-text)]" : "border-transparent bg-[var(--background)] text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--foreground)]"}`}>{category}</button>)}</div> : null}
            <div className="border-b border-[var(--border)] px-4 py-3"><BarcodeCapture variant="field" onDetected={addScannedCode} /></div>
            {loading ? <div className="p-8 text-sm text-[var(--foreground)]">Connecting to branch inventory…</div> : filteredProducts.length ? <div className="sales-product-list grid gap-2.5 p-3 sm:grid-cols-2">{filteredProducts.map((product) => <div key={product.id} className="sales-product-card flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 transition"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-[var(--panel)] to-[var(--background)] text-[var(--foreground)] ring-1 ring-[var(--border)]"><Package className="h-[17px] w-[17px]" strokeWidth={1.7}/></span><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{product.name}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{product.sku}<span className="px-1.5 text-[var(--muted)]">·</span>{product.category}</p></div></div><div className="flex shrink-0 items-center gap-4"><div className="text-right"><p className="text-sm font-semibold tabular-nums">{money(product.sellingPrice)}</p><p className={`mt-1 text-[10px] font-medium ${product.available ? "text-[var(--foreground)]" : "text-[var(--danger-text)]"}`}>{product.available} available</p></div><button type="button" disabled={product.available < 1 || (cart[product.id] ?? 0) >= product.available} onClick={() => setQuantity(product, (cart[product.id] ?? 0) + 1)} aria-label={`Add ${product.name}`} className={`grid h-9 w-9 place-items-center rounded-xl transition ${cart[product.id] ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-sm hover:border-[#6b6b66] hover:bg-[var(--accent-soft)]"} disabled:cursor-not-allowed disabled:opacity-35`}>{cart[product.id] ? <Check className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}</button></div></div>)}</div> : <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--background)] text-[var(--muted)]"><Package className="h-5 w-5"/></span><p className="mt-3 text-sm font-semibold">{products.length ? "No matching products" : "No products stocked at this branch"}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--muted)]">{products.length ? "Try another name, SKU or category." : "Add products and receive stock into this branch before making a sale."}</p></div></div>}
          </section>

          <form onSubmit={completeSale} className="sales-checkout h-fit overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_10px_28px_rgb(0_0_0/.06)] xl:sticky xl:top-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-text)]"><ShoppingBag className="h-4 w-4"/></span><div><h3 className="text-sm font-semibold text-[var(--foreground)]">Current sale</h3><p className="mt-0.5 text-[10px] text-[var(--muted)]">Review before checkout</p></div></div><span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)]">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} units</span></div>
            {cartItems.some((item) => item.product.tracksUnits) ? <p className="border-b border-[var(--border)] px-4 py-2 text-[10px] text-[var(--foreground)]">Scan again to attach the next device, or type its IMEI or serial below.</p> : null}
            {cartItems.length ? <div className="divide-y divide-[#f4f4f2] px-4">{cartItems.map(({ product, quantity }) => <div key={product.id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{product.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{money(product.sellingPrice)} each</p></div><button type="button" onClick={() => setQuantity(product, 0)} aria-label={`Remove ${product.name}`} className="rounded-lg p-1.5 text-[var(--danger-text)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--danger-text)]"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="mt-2.5 flex items-center justify-between"><div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel)]"><button type="button" onClick={() => setQuantity(product, quantity - 1)} aria-label={`Decrease ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-l-lg text-[var(--foreground)] transition hover:bg-[var(--background)]"><Minus className="h-3.5 w-3.5" /></button><span className="w-8 text-center text-xs font-semibold tabular-nums text-[var(--foreground)]">{quantity}</span><button type="button" disabled={quantity >= product.available} onClick={() => setQuantity(product, quantity + 1)} aria-label={`Increase ${product.name} quantity`} className="grid h-8 w-8 place-items-center rounded-r-lg text-[var(--foreground)] transition hover:bg-[var(--background)] disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button></div><span className="text-[13px] font-bold tabular-nums text-[var(--foreground)]">{money(product.sellingPrice * quantity)}</span></div>{product.tracksUnits ? <div className="mt-2 space-y-1.5">{(deviceDrafts[product.id] ?? []).map((value, index) => <label key={`${product.id}-${index}`} className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]">Device {index + 1} IMEI or serial<input value={value} onChange={(event) => setDeviceDrafts((current) => ({ ...current, [product.id]: (current[product.id] ?? []).map((entry, entryIndex) => entryIndex === index ? event.target.value : entry) }))} autoComplete="off" spellCheck={false} placeholder="Scan the QR or type the serial" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-normal normal-case tracking-normal" /></label>)}</div> : null}</div>)}</div> : <div className="grid min-h-48 place-items-center px-5 py-7 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-[17px] bg-[var(--background)] text-[var(--muted)]"><ShoppingBag className="h-5 w-5" strokeWidth={1.6}/></span><p className="mt-3 text-xs font-semibold text-[var(--foreground)]">Your sale starts here</p><p className="mx-auto mt-1 max-w-[200px] text-[11px] leading-relaxed text-[var(--muted)]">Choose an item from the catalogue, or scan its code, to build this basket.</p></div></div>}
            <div className="space-y-4 border-t border-[var(--border)] p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground)]">Customer <span className="font-normal normal-case tracking-normal">(optional for cash sales)</span></span>{customerId ? <span className="text-[10px] font-medium text-[var(--foreground)]">Existing account</span> : null}</div>
                {showNewCustomer ? <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]"><UserRoundPlus className="h-4 w-4"/>Create customer record</div><button type="button" onClick={() => { setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="text-[10px] font-semibold text-[var(--foreground)] underline underline-offset-2">Use saved customer</button></div>
                  <div className="space-y-2.5">
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--foreground)]">Customer full name<input required minLength={2} maxLength={120} autoComplete="name" value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Name on the account" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--foreground)] outline-none focus:border-[#6b6b66]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--foreground)]">Mobile number<input required minLength={7} maxLength={30} autoComplete="tel" type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="07xx xxx xxx" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--foreground)] outline-none focus:border-[#6b6b66]"/></label>
                    <label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--foreground)]">Email <span className="font-normal normal-case tracking-normal">(optional)</span><input type="email" maxLength={254} autoComplete="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--foreground)] outline-none focus:border-[#6b6b66]"/></label>
                  </div>
                  <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--muted)]">The customer and their payment schedule are saved together when checkout completes.</p>
                </div> : <div className="flex gap-2"><select aria-label="Customer" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setShowNewCustomer(false); setNewCustomer(blankCustomer); }} className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm outline-none focus:border-[#0a7d56]"><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select><button type="button" onClick={() => { setCustomerId(""); setShowNewCustomer(true); }} aria-label="Add a new customer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--background)]"><Plus className="h-3.5 w-3.5"/>New</button></div>}
              </div>
              <fieldset><legend className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">How are they paying?</legend><div className="payment-methods grid grid-cols-2 gap-2">{paymentMethods.map((method) => <button key={method.value} type="button" aria-pressed={paymentMethod === method.value} onClick={() => { setPaymentMethod(method.value); if ((method.value === "CREDIT" || method.value === "COD") && !customerId) setShowNewCustomer(true); }} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold leading-tight ${paymentMethod === method.value ? "border-[#0a7d56] bg-[var(--accent-soft)] text-[var(--accent-text)]" : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--background)]"}`}>{method.label}</button>)}</div>{paymentMethod === "COD" ? <p className="security-notice">No payment is recorded now. Select a customer, then assign the sold device to a rider in Deliveries. Record and verify COD money there.</p> : paymentMethod === "CREDIT" ? <p className="mt-1.5 text-[10px] text-[var(--foreground)]">Start a Lipa plan and collect the customer details below.</p> : paymentMethod === "PAY_LINK" ? <div className="mt-3 space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"><label className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--foreground)]">Payer’s mobile number<input required type="tel" autoComplete="tel" minLength={7} maxLength={30} value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="07xx xxx xxx" className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--foreground)] outline-none focus:border-[#6b6b66]"/></label><label className="flex items-start gap-2 text-[10px] leading-4 text-[var(--foreground)]"><input type="checkbox" required checked={payerConsent} onChange={(event) => setPayerConsent(event.target.checked)} className="mt-0.5 accent-[#0a7d56]"/><span>I have the payer’s permission to text them this one-time link.</span></label><p className="text-[9px] text-[var(--muted)]">The secure link will be sent by SMS after recording the sale. The number will be prefilled for the M-Pesa prompt.</p></div> : null}{paymentMethod === "MPESA" ? <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--foreground)]">M-Pesa confirmation code<input required minLength={6} maxLength={32} autoComplete="off" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value.toUpperCase())} placeholder="Code from the M-Pesa message" className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#6b6b66]"/><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">The sale records the code. It does not collect the money.</span></label> : null}</fieldset>
              {paymentMethod === "CREDIT" ? <div className="space-y-3 rounded-xl border border-[#8a5a12] bg-[var(--background)] p-3.5">
                <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--background)] text-[var(--foreground)]"><CreditCard className="h-4 w-4"/></span><div><p className="text-xs font-semibold text-[var(--foreground)]">Lipa Mdogo Mdogo</p><p className="mt-0.5 text-[10px] text-[var(--foreground)]">Pay a deposit, take it home today.</p></div></div><span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning-text)]">Take home</span></div>
                <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]">Repayment term</p><div className="grid grid-cols-3 gap-1.5">{([4, 6, 12] as const).map((months) => <button key={months} type="button" aria-pressed={creditTermMonths === months} onClick={() => setCreditTermMonths(months)} className={`rounded-lg border px-2 py-2 text-center transition ${creditTermMonths === months ? "border-[#111111] bg-[var(--background)] text-[var(--accent-text)] shadow-[inset_0_0_0_1px_#111111]" : "border-[#8a5a12] bg-[var(--panel)] text-[var(--foreground)] hover:border-[var(--border)]"}`}><span className="block text-xs font-bold">{months}</span><span className="text-[9px]">months</span></button>)}</div></div>
                <div><label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]" htmlFor="credit-deposit">Deposit collected today</label><div className="relative mt-1.5"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[10px] font-semibold text-[var(--muted)]">KES</span><input id="credit-deposit" type="number" min={Math.max(1, Math.ceil(total * creditPolicy.minimumDepositPercent / 100))} max={Math.max(1, total - 1)} step="1" required value={creditDepositAmount} onChange={(event) => setCreditDepositAmount(event.target.value)} placeholder="Enter amount received" className="w-full rounded-lg border border-[#8a5a12] bg-[var(--panel)] py-2.5 pl-12 pr-3 text-sm normal-case tracking-normal outline-none focus:border-[#6b6b66]"/></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[9px] text-[var(--muted)]">Minimum {creditPolicy.minimumDepositPercent}% · quick picks</span><div className="flex gap-1.5">{([10, 20, 30] as const).map((percent) => <button key={percent} type="button" disabled={total < 2 || percent < creditPolicy.minimumDepositPercent} onClick={() => setCreditDepositAmount(String(Math.max(1, Math.min(total - 1, Math.round(total * percent / 100)))))} className="rounded-md border border-[#8a5a12] bg-[var(--panel)] px-2 py-1 text-[9px] font-semibold text-[var(--foreground)] hover:border-[#6b6b66] disabled:opacity-40">{percent}%</button>)}</div></div></div>
                <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]">Deposit paid by<select value={creditDepositMethod} onChange={(event) => setCreditDepositMethod(event.target.value as typeof creditDepositMethod)} className="mt-1.5 w-full rounded-lg border border-[#8a5a12] bg-[var(--panel)] px-3 py-2.5 text-sm normal-case tracking-normal text-[var(--foreground)]"><option value="MPESA">M-Pesa</option><option value="CASH">Cash</option><option value="CARD">Card</option></select></label>
                {creditDepositMethod === "MPESA" ? <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]">Verified M-Pesa transaction code<input required minLength={6} maxLength={32} value={creditDepositReference} onChange={(event) => setCreditDepositReference(event.target.value.toUpperCase())} placeholder="e.g. QWE123ABC" className="mt-1 w-full rounded-lg border border-[#8a5a12] bg-[var(--panel)] px-3 py-2.5 text-sm normal-case tracking-normal"/><span className="mt-1 block text-[10px] font-normal normal-case leading-4 tracking-normal text-[var(--muted)]">Confirm the deposit in M-Pesa before checkout. The code is added to the payment record.</span></label> : null}
                {cartItems.length === 1 && cartItems[0].quantity === 1 ? <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]">Device IMEI <span className="font-normal normal-case tracking-normal">(optional)</span><input inputMode="numeric" pattern="[0-9]{14,16}" minLength={14} maxLength={16} value={creditImei} onChange={(event) => setCreditImei(event.target.value.replace(/\D/g, ""))} placeholder="15-digit device IMEI" className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm font-normal normal-case tracking-normal"/><span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">Saved on the account to help identify the device during collections and recovery.</span></label> : null}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3.5"><div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--foreground)]"><Sparkles className="h-3.5 w-3.5 text-[var(--warning-text)]"/>Plan at a glance</div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-[var(--background)] p-2.5"><p className="text-[9px] text-[var(--muted)]">Balance financed</p><p className="mt-1 text-xs font-bold tabular-nums text-[var(--foreground)]">{money(creditBalance)}</p></div><div className="rounded-lg bg-[var(--background)] p-2.5"><p className="text-[9px] text-[var(--muted)]">About per month</p><p className="mt-1 text-xs font-bold tabular-nums text-[var(--foreground)]">{money(estimatedInstallment)}</p></div></div><div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-[10px] text-[var(--muted)]"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5"/>First due {firstDueDate || "next month"}</span><span>{creditTermMonths} equal monthly payments</span></div><p className="mt-2 text-[9px] leading-relaxed text-[var(--muted)]">Estimate only; the saved schedule shows exact dates and any rounding adjustment.</p></div>
                <p className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[var(--muted)]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]"/>Review the deposit with the customer before confirming. Checkout deducts stock and opens their payment account.</p>
              </div> : null}
              {paymentMethod === "SPLIT" ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground)]">Split tender</p><div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="First payment method" value={firstTenderMethod} onChange={(event) => setFirstTenderMethod(event.target.value as typeof firstTenderMethod)} className="border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><input aria-label="First payment amount in KES" type="number" min="1" max={Math.max(1, total - 1)} step="1" required value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="w-full border border-[var(--border)] px-2 py-2 text-sm" /></div>{firstTenderMethod === "MPESA" ? <input aria-label="First M-Pesa confirmation code" required minLength={6} maxLength={32} value={firstTenderReference} onChange={(event) => setFirstTenderReference(event.target.value.toUpperCase())} placeholder="M-Pesa code" className="w-full border border-[var(--border)] px-2 py-2 text-sm" /> : null}<div className="grid grid-cols-[1fr_1fr] gap-2"><select aria-label="Second payment method" value={secondTenderMethod} onChange={(event) => setSecondTenderMethod(event.target.value as typeof secondTenderMethod)} className="border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-xs"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="CARD">Card</option></select><p className="border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm">{money(Math.max(0, total - Number(paidAmount || 0)))}</p></div>{secondTenderMethod === "MPESA" ? <input aria-label="Second M-Pesa confirmation code" required minLength={6} maxLength={32} value={secondTenderReference} onChange={(event) => setSecondTenderReference(event.target.value.toUpperCase())} placeholder="M-Pesa code" className="w-full border border-[var(--border)] px-2 py-2 text-sm" /> : null}{firstTenderMethod === secondTenderMethod ? <p role="alert" className="text-xs text-red-700">Choose two different payment methods.</p> : null}</div> : null}
              <div className="rounded-xl bg-[var(--background)] px-3.5 py-3"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[var(--foreground)]">Total due</span><span className="text-xl font-bold tracking-[-.04em] tabular-nums text-[var(--accent-text)]">{money(total)}</span></div><p className="mt-1.5 text-[10px] text-[var(--muted)]">Prices include all selected items</p></div>
              <button type="submit" disabled={!cartItems.length || submitting || devicesIncomplete || (paymentMethod === "COD" && !(customerId || (showNewCustomer && newCustomerReady))) || (paymentMethod === "MPESA" && !mpesaReferenceReady(paymentReference)) || (paymentMethod === "CREDIT" && (!(customerId || (showNewCustomer && newCustomerReady)) || !creditDepositAmount || Number(creditDepositAmount) >= total || Number(creditDepositAmount) < 1 || (creditDepositMethod === "MPESA" && creditDepositReference.trim().length < 6))) || (paymentMethod === "PAY_LINK" && (!payerPhone.trim() || !payerConsent)) || (paymentMethod === "SPLIT" && (!paidAmount || Number(paidAmount) >= total || firstTenderMethod === secondTenderMethod || (firstTenderMethod === "MPESA" && !mpesaReferenceReady(firstTenderReference)) || (secondTenderMethod === "MPESA" && !mpesaReferenceReady(secondTenderReference))))} className="w-full rounded-xl bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-white shadow-[0_5px_16px_rgb(0_0_0/.13)] transition hover:bg-[#0a7d56] disabled:cursor-not-allowed disabled:bg-[#6b6b66]">{submitting ? "Recording sale…" : paymentMethod === "CREDIT" ? "Collect deposit & start plan" : paymentMethod === "PAY_LINK" ? "Record sale & text payer" : paymentMethod === "COD" ? "Record unpaid delivery sale" : "Complete sale"}</button>
              {paymentMethod === "CREDIT" ? <p className="flex items-center justify-center gap-1.5 text-[9px] text-[var(--muted)]"><ShieldCheck className="h-3 w-3"/>Sale, deposit, customer and schedule are recorded together</p> : null}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
