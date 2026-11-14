"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Check, Download, FileText, Package, Search } from "lucide-react";

import { ReferenceCatalogLookup } from "@/components/reference-catalog-lookup";
import { BarcodeCapture } from "@/components/barcode-capture";
import type { DetectedCode } from "@/lib/barcode-scanner";
import { categoryTracksUnits, maskImei, maskSerial } from "@/lib/device-units";
import { downloadInventoryReceipt, type InventoryReceiptData } from "@/lib/receipt-pdf";
import { needsReorder, reorderThreshold, stockAttentionRank } from "@/lib/stock-levels";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  costPrice?: number;
  sellingPrice: number;
  reorderLevel: number;
  unitTracking: boolean | null;
  tracksUnits: boolean;
};

type InventoryItem = {
  id: string;
  stockOnHand: number;
  ownedStockValue?:number|null;
  reservedStock: number;
  reorderLevel: number;
  product: Product;
};

type StockUnit = {
  id: string;
  productId: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  imeiMasked: string | null;
  imei2Masked: string | null;
  serialMasked: string | null;
  status: "IN_STOCK" | "RESERVED" | "SOLD" | "IN_REPAIR" | "RETURNED";
  condition: "NEW" | "OPEN_BOX" | "REFURBISHED" | "USED";
  color: string | null;
  storage: string | null;
  location: string | null;
  activationLock: "UNKNOWN" | "ON" | "OFF";
  saleItemId: string | null;
};

type Movement = {
  id: string;
  type: "RECEIPT" | "SALE" | "ADJUSTMENT" | "RESERVATION" | "RESERVATION_RELEASE";
  quantity: number;
  reference: string | null;
  createdAt: string;
  product: { name: string; sku: string };
  user: { name: string };
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const fieldClass = "mt-1 w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[#6b6b66]";
const statusLabel: Record<StockUnit["status"], string> = {
  IN_STOCK: "On shelf",
  RESERVED: "Held",
  SOLD: "Sold",
  IN_REPAIR: "In repair",
  RETURNED: "Returned",
};
const shelfStatuses: StockUnit["status"][] = ["IN_STOCK", "RESERVED", "IN_REPAIR", "RETURNED"];

export default function InventoryPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [canViewCost, setCanViewCost] = useState(session?.user.role === "OWNER");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [imei, setImei] = useState("");
  const [imei2, setImei2] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [condition, setCondition] = useState<StockUnit["condition"]>("NEW");
  const [activationLock, setActivationLock] = useState<StockUnit["activationLock"]>("UNKNOWN");
  const [location, setLocation] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [movingId, setMovingId] = useState("");
  const [lastReceipt, setLastReceipt] = useState<InventoryReceiptData | null>(null);
  const [setupCategory, setSetupCategory] = useState("");
  const [setupTracked, setSetupTracked] = useState(false);

  async function refreshInventory() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load inventory.");
    setItems(data.items);
    setUnits(data.units ?? []);
    setMovements(data.movements);
    setCanViewCost(Boolean(data.canViewCost));
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

  const selectedProduct = items.find((item) => item.product.id === selectedProductId) ?? null;
  const recordingDevice = !selectedProduct || selectedProduct.product.tracksUnits;
  const receiveMatches = useMemo(() => items.filter((item) => `${item.product.name} ${item.product.sku} ${item.product.category} ${item.product.brand ?? ""}`.toLowerCase().includes(productSearch.trim().toLowerCase())).slice(0, 30), [items, productSearch]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const unitProductIds = new Set(units.filter((unit) => `${unit.imei ?? ""} ${unit.imei2 ?? ""} ${unit.serialNumber ?? ""} ${unit.location ?? ""}`.toLowerCase().includes(needle)).map((unit) => unit.productId));
    const matched = !needle ? items : items.filter((item) => unitProductIds.has(item.product.id) || `${item.product.name} ${item.product.sku} ${item.product.category} ${item.product.brand ?? ""}`.toLowerCase().includes(needle));
    return [...matched].sort((left, right) => {
      const leftAvailable = left.stockOnHand - left.reservedStock;
      const rightAvailable = right.stockOnHand - right.reservedStock;
      const rank = stockAttentionRank(leftAvailable, left.reorderLevel, left.product.reorderLevel) - stockAttentionRank(rightAvailable, right.reorderLevel, right.product.reorderLevel);
      if (rank !== 0) return rank;
      return left.product.name.localeCompare(right.product.name);
    });
  }, [items, query, units]);
  const visibleUnits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return units.filter((unit) => {
      if (unit.status === "SOLD" && !needle) return false;
      if (!needle) return true;
      return `${unit.imei ?? ""} ${unit.imei2 ?? ""} ${unit.serialNumber ?? ""} ${unit.location ?? ""} ${statusLabel[unit.status]}`.toLowerCase().includes(needle);
    });
  }, [query, units]);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const stockUnits = items.reduce((sum, item) => sum + item.stockOnHand, 0);
  const lowStockCount = items.filter((item) => needsReorder(item.stockOnHand - item.reservedStock, item.reorderLevel, item.product.reorderLevel)).length;
  const stockValue = canViewCost ? items.some(item=>item.ownedStockValue===null)?null:items.reduce((sum,item)=>sum+(item.ownedStockValue??item.stockOnHand*(item.product.costPrice??0)),0):0;

  function applyCode(code: DetectedCode) {
    setError("");
    if (code.imei) setImei(code.imei);
    if (code.imei2) setImei2(code.imei2);
    if (code.serialNumber) setSerialNumber(code.serialNumber);
    const needle = code.imei ?? code.serialNumber ?? code.productCode ?? "";
    if (needle) setQuery(needle);
    const existing = units.find((unit) => (code.imei && (unit.imei === code.imei || unit.imei2 === code.imei)) || (code.serialNumber && unit.serialNumber?.toUpperCase() === code.serialNumber.toUpperCase()));
    if (existing) {
      setSelectedUnitId(existing.id);
      setSelectedProductId(existing.productId);
      const product = items.find((item) => item.product.id === existing.productId);
      if (product) setProductSearch(`${product.product.name} · ${product.product.sku}`);
      setNotice("This device is already on record. Its status is shown below.");
      return;
    }
    if (code.productCode) {
      const match = items.find((item) => item.product.sku.toLowerCase() === code.productCode?.toLowerCase());
      if (match) {
        setSelectedProductId(match.product.id);
        setProductSearch(`${match.product.name} · ${match.product.sku}`);
      }
    }
    setNotice(code.serialNumber || code.imei ? "Code read. Check the product, then record the device." : "Code read. Choose the matching product.");
  }

  async function recordDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId) {
      setError("Choose the product this device belongs to.");
      return;
    }
    if (!selectedProduct?.product.tracksUnits) return;
    setSaving(true);
    setError("");
    setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/inventory/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          imei,
          imei2,
          serialNumber,
          condition,
          activationLock,
          networkLock: String(form.get("networkLock") || "UNKNOWN"),
          color: form.get("color"),
          storage: form.get("storage"),
          ram: form.get("ram"),
          location,
          supplierName: form.get("supplierName"),
          purchaseReference: form.get("purchaseReference"),
          cosmeticGrade: form.get("cosmeticGrade"),
          notes: form.get("notes"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The device could not be recorded.");
      await refreshInventory();
      formElement.reset();
      setImei("");
      setImei2("");
      setSerialNumber("");
      setLocation("");
      setCondition("NEW");
      setActivationLock("UNKNOWN");
      setNotice(result.identifiedExisting ? "Device identified against stock already counted at this branch." : "Device recorded and added to stock.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The device could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  async function receiveQuantity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductId || !selectedProduct || selectedProduct.product.tracksUnits) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          quantity: Number(data.get("quantity")),
          reorderLevel: Number(data.get("reorderLevel")),
          reference: data.get("reference"),
          note: data.get("note"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      setLastReceipt({
        id: result.movement.id,
        createdAt: result.movement.createdAt,
        branchName: result.branchName,
        receivedBy: result.receivedBy,
        reference: result.reference,
        note: result.note,
        quantity: Number(data.get("quantity")),
        previousStock: result.previousStock,
        newStock: result.stockOnHand,
        product: {
          name: selectedProduct.product.name,
          sku: selectedProduct.product.sku,
          category: selectedProduct.product.category,
          brand: selectedProduct.product.brand,
          ...(canViewCost && selectedProduct.product.costPrice != null ? { costPrice: selectedProduct.product.costPrice } : {}),
        },
      });
      await refreshInventory();
      form.reset();
      setNotice("Quantity received. The goods received note is ready.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Stock receipt failed.");
    } finally {
      setSaving(false);
    }
  }

  async function moveUnit(status: StockUnit["status"]) {
    if (!selectedUnit) return;
    setMovingId(selectedUnit.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/inventory/units/${selectedUnit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The device could not be updated.");
      await refreshInventory();
      setNotice(`${statusLabel[status]} saved.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "The device could not be updated.");
    } finally {
      setMovingId("");
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
          openingStock: setupTracked ? 0 : Number(data.get("openingStock")),
          unitTracking: setupTracked,
          reference: data.get("reference"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Product could not be created.");
      await refreshInventory();
      form.reset();
      setSetupCategory("");
      setSetupTracked(false);
      setAddingProduct(false);
      setNotice(`${result.name} (${result.sku}) was added to this branch.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Product could not be created.");
    } finally {
      setSaving(false);
    }
  }

  function identifier(unit: StockUnit) {
    const show = revealed[unit.id];
    if (unit.imei) return show ? unit.imei : (unit.imeiMasked ?? maskImei(unit.imei));
    if (unit.serialNumber) return show ? unit.serialNumber : (unit.serialMasked ?? maskSerial(unit.serialNumber));
    return "No identifier";
  }

  return (
    <>
      <div className="inventory-workspace space-y-5">
        <div className="inventory-hero flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-5 shadow-[0_4px_18px_rgb(0_0_0/.035)] sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">Stock control</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Inventory</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--foreground)]">Scan a barcode or QR code, or type an IMEI or serial. Phones and laptops are recorded one device at a time. Accessories are received by quantity.</p>
          </div>
          <button type="button" onClick={() => { setAddingProduct((current) => !current); setError(""); }} className="border border-[var(--border)] px-3.5 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background)]">{addingProduct ? "Close product setup" : "Add product"}</button>
        </div>

        <ReferenceCatalogLookup/>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#0a7d56] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]">{notice}</p> : null}

        <form onSubmit={recordingDevice ? recordDevice : receiveQuantity} className="inventory-receive-form border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--background)] text-[var(--foreground)]"><Package className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{recordingDevice ? "Record a device" : "Receive accessory stock"}</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">{recordingDevice ? "The scan fills the IMEI or serial. Then choose the product and save." : "This product is counted by quantity, so enter how many arrived."}</p>
            </div>
          </div>
          <BarcodeCapture variant="field" onDetected={applyCode} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative text-xs font-medium text-[var(--foreground)] sm:col-span-2" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setProductPickerOpen(false); }}>
              <label htmlFor="receive-product-search">Product</label>
              <div className="relative mt-1.5">
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input id="receive-product-search" role="combobox" aria-autocomplete="list" aria-expanded={productPickerOpen} aria-controls="receive-product-list" autoComplete="off" value={productSearch} onFocus={() => setProductPickerOpen(true)} onChange={(event) => { setProductSearch(event.target.value); setSelectedProductId(""); setProductPickerOpen(true); }} placeholder="Search name, SKU or brand" className="w-full border border-[var(--border)] bg-[var(--panel)] py-2.5 pl-9 pr-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[#6b6b66]" />
                {productPickerOpen ? <div id="receive-product-list" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-[0_14px_35px_rgb(0_0_0/.15)]">
                  {receiveMatches.length ? receiveMatches.map((item) => <button key={item.product.id} type="button" role="option" aria-selected={selectedProductId === item.product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedProductId(item.product.id); setProductSearch(`${item.product.name} · ${item.product.sku}`); setProductPickerOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--background)]">
                    <span className="min-w-0"><span className="block truncate text-xs font-semibold text-[var(--foreground)]">{item.product.name}</span><span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{item.product.sku} · {item.product.tracksUnits ? "Each device" : "By quantity"} · {item.stockOnHand} on hand</span></span>
                    {selectedProductId === item.product.id ? <Check className="h-4 w-4 shrink-0 text-[var(--accent-text)]" /> : null}
                  </button>) : <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">No matching products.</p>}
                </div> : null}
              </div>
            </div>
            {recordingDevice ? <>
              <label className="text-xs font-medium text-[var(--foreground)]">IMEI<input value={imei} onChange={(event) => setImei(event.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" autoComplete="off" maxLength={18} placeholder="15-digit IMEI" className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Serial number<input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} autoComplete="off" maxLength={40} placeholder="From the QR or case" className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Second IMEI <span className="font-normal">(optional)</span><input value={imei2} onChange={(event) => setImei2(event.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" autoComplete="off" maxLength={18} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Condition<select value={condition} onChange={(event) => setCondition(event.target.value as StockUnit["condition"])} className={fieldClass}><option value="NEW">New</option><option value="OPEN_BOX">Open box</option><option value="REFURBISHED">Refurbished</option><option value="USED">Used</option></select></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Activation lock<select value={activationLock} onChange={(event) => setActivationLock(event.target.value as StockUnit["activationLock"])} className={fieldClass}><option value="UNKNOWN">Not checked</option><option value="OFF">Off</option><option value="ON">On</option></select></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Network<select name="networkLock" defaultValue="UNKNOWN" className={fieldClass}><option value="UNKNOWN">Not checked</option><option value="UNLOCKED">Unlocked</option><option value="LOCKED">Locked</option></select></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Shelf / location<input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={80} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Color <span className="font-normal">(optional)</span><input name="color" maxLength={40} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Storage <span className="font-normal">(optional)</span><input name="storage" maxLength={40} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">RAM <span className="font-normal">(optional)</span><input name="ram" maxLength={40} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Grade <span className="font-normal">(optional)</span><select name="cosmeticGrade" defaultValue="" className={fieldClass}><option value="">Not graded</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Supplier <span className="font-normal">(optional)</span><input name="supplierName" maxLength={120} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)] sm:col-span-2">Supplier invoice<input name="purchaseReference" maxLength={100} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)] sm:col-span-2">Note <span className="font-normal">(optional)</span><input name="notes" maxLength={300} className={fieldClass} /></label>
            </> : <>
              <label className="text-xs font-medium text-[var(--foreground)]">Quantity received<input name="quantity" type="number" min="1" max="10000" step="1" required className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Reorder point<input name="reorderLevel" type="number" min="0" max="100000" step="1" defaultValue={selectedProduct ? Math.max(selectedProduct.reorderLevel, selectedProduct.product.reorderLevel) : 0} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Supplier invoice<input name="reference" maxLength={100} className={fieldClass} /></label>
              <label className="text-xs font-medium text-[var(--foreground)]">Note <span className="font-normal">(optional)</span><input name="note" maxLength={300} className={fieldClass} /></label>
            </>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <p className="text-[10px] text-[var(--muted)]">{recordingDevice ? "Used and open-box devices can be saved only when activation lock is off." : "Stock updates as soon as the receipt is saved."}</p>
            <button disabled={saving || !selectedProductId || (recordingDevice && !imei.trim() && !serialNumber.trim())} className="rounded-lg bg-[#0a7d56] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0a7d56] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : recordingDevice ? "Record device" : "Receive quantity"}</button>
          </div>
        </form>

        {selectedUnit ? <section className="border border-[var(--border)] bg-[var(--panel)] p-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">{items.find((item) => item.product.id === selectedUnit.productId)?.product.name ?? "Device"}</p>
              <p className="mt-1 font-mono text-xs text-[var(--foreground)]">{identifier(selectedUnit)} · {selectedUnit.condition.replaceAll("_", " ").toLowerCase()} · {statusLabel[selectedUnit.status]}</p>
            </div>
            <button type="button" onClick={() => setRevealed((current) => ({ ...current, [selectedUnit.id]: !current[selectedUnit.id] }))} className="text-xs font-semibold text-[var(--foreground)]">{revealed[selectedUnit.id] ? "Hide identifier" : "Show identifier"}</button>
          </div>
          {selectedUnit.status === "SOLD" || selectedUnit.saleItemId ? <p className="mt-3 text-xs text-[var(--foreground)]">This device is tied to a sale. Change it from the sale, not from stock.</p> : <div className="mt-3 flex flex-wrap gap-2">
            {shelfStatuses.map((status) => <button key={status} type="button" disabled={movingId === selectedUnit.id || selectedUnit.status === status} onClick={() => void moveUnit(status)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${selectedUnit.status === status ? "bg-[#0a0a0a] text-white" : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)]"} disabled:opacity-60`}>{movingId === selectedUnit.id && selectedUnit.status !== status ? "Saving…" : statusLabel[status]}</button>)}
          </div>}
        </section> : null}

        <div className="inventory-stats grid gap-3 sm:grid-cols-3">
          <div className="px-4 py-4"><p className="text-xs text-[var(--foreground)]">Units on hand</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : stockUnits.toLocaleString("en-KE")}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[var(--foreground)]">Devices tracked</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : units.filter((unit) => unit.status !== "SOLD").length.toLocaleString("en-KE")}</p></div>
          <div className="px-4 py-4"><p className="text-xs text-[var(--foreground)]">{canViewCost ? "Estimated owned cost · listed stock" : "Reorder alerts"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : canViewCost ? stockValue===null?"Reconcile stock counts":money(stockValue) : lowStockCount}</p></div>
        </div>

        {lastReceipt ? <section className="inventory-receipt-ready flex flex-wrap items-center justify-between gap-4 border border-[var(--border)] bg-[var(--panel)] p-4 sm:px-5" role="status">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--background)] text-[var(--accent-text)]"><FileText className="h-4.5 w-4.5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-[var(--foreground)]">Goods received note is ready</p><p className="mt-1 truncate text-xs text-[var(--foreground)]">{lastReceipt.product.name} · +{lastReceipt.quantity}</p></div></div>
          <button type="button" onClick={() => downloadInventoryReceipt(lastReceipt)} className="inline-flex items-center gap-2 rounded-lg bg-[#0a7d56] px-3.5 py-2.5 text-xs font-semibold text-white"><Download className="h-3.5 w-3.5" />Download receipt</button>
        </section> : null}

        {addingProduct ? <form onSubmit={setUpProduct} className="border border-[var(--border)] bg-[var(--panel)] p-4">
          <h3 className="mb-4 text-sm font-semibold">Set up a product at this branch</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium text-[var(--foreground)]">Product name<input name="name" required minLength={2} maxLength={160} className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">SKU<input name="sku" required minLength={2} maxLength={64} className={`${fieldClass} uppercase`} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Category<input name="category" required minLength={2} maxLength={80} value={setupCategory} onChange={(event) => { setSetupCategory(event.target.value); setSetupTracked(categoryTracksUnits(event.target.value)); }} placeholder="Smartphone, Laptop, Accessory" className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Brand <span className="font-normal">(optional)</span><input name="brand" maxLength={80} className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Cost price (KES)<input name="costPrice" type="number" min="0" max="2000000000" step="1" required className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Selling price (KES)<input name="sellingPrice" type="number" min="1" max="2000000000" step="1" required className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Reorder level<input name="reorderLevel" type="number" min="0" max="100000" step="1" defaultValue="0" required className={fieldClass} /></label>
            <label className="text-xs font-medium text-[var(--foreground)]">Opening stock<input name="openingStock" type="number" min="0" max="100000" step="1" defaultValue="0" required disabled={setupTracked} className={fieldClass} /><span className="mt-1 block text-[10px] font-normal text-[var(--muted)]">{setupTracked ? "Record each device after the product is created." : "Quantity already in the shop."}</span></label>
            <label className="flex items-center gap-2 text-xs font-medium text-[var(--foreground)] sm:col-span-2"><input type="checkbox" checked={setupTracked} onChange={(event) => setSetupTracked(event.target.checked)} /> Track each piece by IMEI or serial</label>
            <label className="text-xs font-medium text-[var(--foreground)] sm:col-span-2">Supplier invoice <span className="font-normal">(optional)</span><input name="reference" maxLength={100} className={fieldClass} /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setAddingProduct(false)} className="border border-[var(--border)] px-3.5 py-2 text-sm font-medium">Cancel</button><button disabled={saving} className="bg-[#0a0a0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creating…" : "Create product"}</button></div>
        </form> : null}

        <section className="inventory-table-panel overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_4px_18px_rgb(0_0_0/.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-3.5">
            <h3 className="text-sm font-semibold">Branch stock</h3>
            <div className="relative w-full sm:max-w-xs"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]" /><input aria-label="Find a device or product" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, IMEI or serial" autoComplete="off" className="w-full border border-[var(--border)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0a7d56]" /></div>
          </div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)]"><tr><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">SKU</th><th className="px-4 py-3 font-medium">Tracking</th><th className="px-4 py-3 text-right font-medium">On hand</th><th className="px-4 py-3 text-right font-medium">Available</th>{canViewCost ? <th className="px-4 py-3 text-right font-medium">Cost</th> : null}<th className="px-4 py-3 font-medium">Stock status</th></tr></thead>
            <tbody className="divide-y divide-[#f4f4f2]">
              {loading ? <tr><td colSpan={canViewCost ? 7 : 6} className="px-4 py-8 text-center text-sm text-[var(--foreground)]">Loading live branch stock…</td></tr> : filteredItems.map((item) => {
                const available = item.stockOnHand - item.reservedStock;
                const threshold = reorderThreshold(item.reorderLevel, item.product.reorderLevel);
                const low = needsReorder(available, item.reorderLevel, item.product.reorderLevel);
                const stockLabel = low ? "Reorder" : threshold === 0 ? "No alert set" : available <= 0 ? "Out of stock" : "In stock";
                const productUnits = visibleUnits.filter((unit) => unit.productId === item.product.id);
                return <tr key={item.id} className="align-top hover:bg-[var(--panel)]">
                  <td className="px-4 py-3 font-medium">{item.product.name}{productUnits.length ? <ul className="mt-2 space-y-1">{productUnits.slice(0, 8).map((unit) => <li key={unit.id}><button type="button" onClick={() => setSelectedUnitId(unit.id)} className={`block text-left font-mono text-[11px] font-normal ${selectedUnitId === unit.id ? "text-[var(--foreground)]" : "text-[var(--foreground)]"}`}>{identifier(unit)} · {statusLabel[unit.status]}</button></li>)}{productUnits.length > 8 ? <li className="text-[11px] font-normal text-[var(--muted)]">Search to narrow {productUnits.length - 8} more.</li> : null}</ul> : null}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--foreground)]">{item.product.sku}</td>
                  <td className="px-4 py-3 text-[var(--foreground)]">{item.product.tracksUnits ? "Each device" : "Quantity"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.stockOnHand}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{available}</td>
                  {canViewCost ? <td className="px-4 py-3 text-right tabular-nums">{item.product.costPrice == null ? "—" : money(item.product.costPrice)}</td> : null}
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${low ? "bg-[var(--danger-soft)] text-[var(--danger-text)]" : "bg-[var(--accent-soft)] text-[var(--accent-text)]"}`}><span className={`h-1.5 w-1.5 rounded-full ${low ? "bg-[#8a5a12]" : "bg-[#6b6b66]"}`} />{stockLabel}</span></td>
                </tr>;
              })}
              {!loading && !filteredItems.length ? <tr><td colSpan={canViewCost ? 7 : 6} className="px-4 py-9 text-center"><p className="text-sm font-semibold">{items.length ? "No matching stock records" : "No stock records for this branch"}</p><p className="mt-1 text-sm text-[var(--foreground)]">{items.length ? "Try a name, SKU, IMEI, or serial." : "Add a product, then record devices or receive quantities."}</p></td></tr> : null}
            </tbody>
          </table></div>
        </section>

        <section className="inventory-movements-panel overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_4px_18px_rgb(0_0_0/.03)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5"><h3 className="text-sm font-semibold">Recent stock movements</h3><span className="text-xs text-[var(--foreground)]">Latest 20</span></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)]"><tr><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Movement</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 text-right font-medium">Units</th><th className="px-4 py-3 font-medium">Recorded by</th></tr></thead><tbody className="divide-y divide-[#f4f4f2]">
            {movements.map((movement) => <tr key={movement.id}><td className="px-4 py-3 text-[var(--foreground)]">{new Date(movement.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td className="px-4 py-3">{movement.type === "RECEIPT" ? "Receipt" : movement.type === "SALE" ? "Sale" : movement.type === "RESERVATION" ? "Reservation" : movement.type === "RESERVATION_RELEASE" ? "Released" : "Adjustment"}</td><td className="px-4 py-3 font-medium">{movement.product.name}</td><td className="px-4 py-3 font-mono text-xs text-[var(--foreground)]">{movement.reference ?? "—"}</td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${movement.quantity > 0 ? "text-[var(--foreground)]" : "text-[var(--danger-text)]"}`}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td><td className="px-4 py-3 text-[var(--foreground)]">{movement.user.name}</td></tr>)}
            {!loading && !movements.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--foreground)]">No recorded stock movements yet.</td></tr> : null}
          </tbody></table></div>
        </section>
      </div>
    </>
  );
}
