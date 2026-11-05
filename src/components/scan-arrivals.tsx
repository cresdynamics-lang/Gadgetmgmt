"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Printer, ScanLine, X } from "lucide-react";

import { conditionLabels } from "@/lib/catalog";
import { appleModelsFor, lookupAppleIdentity, suggestedConditionFromMpn } from "@/lib/apple-barcodes";
import { emptyScannedDevice, inferArrivalCondition, overlayDevice, parseDeviceScan, type ScannedDevice } from "@/lib/device-scan";
import { matchScanProducts, parseScanPayload, type ScanableProduct } from "@/lib/inventory-scan";
import { BatteryHealthField, PhoneLabelPreview } from "@/components/phone-label-preview";
import { DeviceCamera } from "@/components/device-camera";
import { PHONE_LABEL, printPhoneLabel } from "@/lib/phone-label";
import { useScanHandler } from "@/lib/scanner";
import type { InventoryReceiptData } from "@/lib/receipt-pdf";

type ScanItem = {
  stockOnHand: number;
  reservedStock: number;
  reorderLevel: number;
  product: ScanableProduct & { costPrice: number | null; sellingPrice?: number };
};

type ScanMatch = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  brand: string | null;
  condition: string;
  colour: string | null;
  stockOnHand: number;
  available: number;
  reorderLevel: number;
  reason?: string;
};

type CatalogHint = {
  group: string;
  category: string;
  name: string;
  modelNumber?: string | null;
  matchedBy?: string;
};

type ReceiveCondition = "NEW" | "EX_UK";

/** A phone the shop already has a record for, found by the IMEI or serial on its barcode. */
type KnownUnit = {
  status: "IN_STOCK" | "RESERVED" | "SOLD";
  productId: string;
  productName: string;
  condition: string;
  receivedAt: string;
  source: string | null;
  soldAt: string | null;
  invoiceNumber: string | null;
};

type Props = {
  items: ScanItem[];
  canReceive: boolean;
  onReceived: (receipt: InventoryReceiptData) => Promise<void> | void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

const conditions = [["NEW", "New"], ["EX_UK", "Ex-UK"]] as const;

const deviceTypes = [["iPhone", "iPhone"], ["iPad", "iPad"], ["Mac", "MacBook / Mac"], ["Apple Watch", "Watch"], ["AirPods", "AirPods"], ["Apple accessories", "Accessory"]] as const;
const typesWithBattery = ["iPhone", "iPad", "Mac", "Apple Watch"];
const typesWithSim = ["iPhone", "iPad", "Apple Watch"];
const namePlaceholders: Record<string, string> = { iPhone: "iPhone 14 128GB", iPad: 'iPad Air 11" M2 256GB', Mac: 'MacBook Air 13" M1 256GB', "Apple Watch": "Apple Watch Series 10", AirPods: "AirPods Pro 2", "Apple accessories": "20W USB-C adapter" };

const detailFields = [
  ["imei", "IMEI", "15-digit IMEI"],
  ["serial", "Serial", "Sr# from About"],
  ["storage", "Storage", "128GB"],
  ["colour", "Colour", "MIDNIGHT"],
  ["sim", "SIM", "Unlocked"],
  ["fmi", "FMI", "Off"],
  ["version", "Version", "26.4"],
  ["mpn", "Part number", "MPUA3LL/A"],
  ["supplierCode", "Supplier sticker", "Barcode on the back (Ex-UK)"],
] as const;

const fieldClass = "mt-1 w-full rounded-lg border border-[#c4c4c4] bg-white px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#e5e5e5]";

/**
 * Scan arrivals: the USB scanner works anywhere on the page, and the one camera reads codes or the About screen.
 * Every scan opens a small details sheet; Submit puts the device in the system and prints its 90 × 50 mm label.
 */
export function ScanArrivals({ items, canReceive, onReceived, onError, onNotice }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleScanRef = useRef<(raw: string, nextCondition?: ReceiveCondition) => Promise<void>>(async () => undefined);

  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<ReceiveCondition>("NEW");
  const [conditionMarked, setConditionMarked] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [category, setCategory] = useState("");
  const [changeType, setChangeType] = useState(false);
  const [arrivalPhotos, setArrivalPhotos] = useState<Blob[]>([]);
  const [sellingPrice, setSellingPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [looking, setLooking] = useState(false);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [chosen, setChosen] = useState("");
  const [catalog, setCatalog] = useState<CatalogHint | null>(null);
  const [pendingCode, setPendingCode] = useState("");
  const [device, setDevice] = useState<ScannedDevice>(emptyScannedDevice);
  const [lastLabel, setLastLabel] = useState<ScannedDevice | null>(null);
  const [known, setKnown] = useState<KnownUnit | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const [hint, setHint] = useState("");

  // The scanner, camera and ?scan= link call the latest handler through this ref. It is set first so the
  // ?scan= effect below already sees it.
  useEffect(() => { handleScanRef.current = handleScan; });

  // A scan made on another page arrives here as ?scan=… and opens straight into the details sheet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scanned = params.get("scan");
    if (!scanned) return;
    params.delete("scan");
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    void handleScanRef.current(scanned);
  }, []);

  useScanHandler((scanned) => { void handleScanRef.current(scanned); });

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !saving) setSheetOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, saving]);

  function localMatches(raw: string, current: ReceiveCondition): ScanMatch[] {
    return matchScanProducts(raw, items.map((item) => item.product), { condition: current }).map((hit) => {
      const item = items.find((row) => row.product.id === hit.product.id)!;
      return {
        productId: hit.product.id,
        sku: hit.product.sku,
        name: hit.product.name,
        category: hit.product.category,
        brand: hit.product.brand,
        condition: hit.product.condition,
        colour: hit.product.colour,
        stockOnHand: item.stockOnHand,
        available: Math.max(0, item.stockOnHand - item.reservedStock),
        reorderLevel: item.reorderLevel,
        reason: hit.reason,
      };
    });
  }

  async function resolveMatches(raw: string, current: ReceiveCondition): Promise<{ matches: ScanMatch[]; catalog: CatalogHint | null; device: ScannedDevice; known: KnownUnit | null }> {
    const parsed = parseDeviceScan(raw);
    const identity = lookupAppleIdentity(raw);
    // A phone's own barcode (IMEI / serial) is looked up on the server, which fills in its saved details.
    const hasDeviceCode = Boolean(parsed.imei || parsed.serial || parseScanPayload(raw).kind === "imei");
    const local = hasDeviceCode ? [] : localMatches(raw, current);
    if (local.length) return { matches: local, catalog: identity, device: parsed, known: null };
    const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(raw)}&condition=${current}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok && response.status !== 404 && response.status !== 400) throw new Error(data.error ?? "That scan could not be looked up.");
    return {
      matches: (data.matches as ScanMatch[]) || [],
      catalog: data.catalog || identity,
      device: overlayDevice(parsed, data.device || {}),
      known: (data.known as KnownUnit | null) ?? null,
    };
  }

  function labelDevice(current: ScannedDevice = device): ScannedDevice {
    const name = deviceName.trim() || current.name || catalog?.name || "";
    const label = overlayDevice(current, { name, group: current.group || catalog?.name || name, category: category || current.category });
    return (known?.condition ?? condition) === "NEW" ? { ...label, workingNote: "Brand new · sealed" } as ScannedDevice : label;
  }

  function printLabel(current?: ScannedDevice) {
    const label = current ?? labelDevice();
    if (!label.unitCode && !label.imei && !label.serial) {
      setProblem("Enter the IMEI or serial so the barcode on the label has something to encode.");
      return false;
    }
    printPhoneLabel(label);
    setLastLabel(label);
    return true;
  }

  function closeSheet() {
    setSheetOpen(false);
    setProblem("");
    setConditionMarked(false);
  }

  function resetScan() {
    setCode("");
    setMatches([]);
    setChosen("");
    setCatalog(null);
    setPendingCode("");
    setQuantity(1);
    setDeviceName("");
    setCategory("");
    setChangeType(false);
    setArrivalPhotos([]);
    setSellingPrice("");
    setDevice(emptyScannedDevice());
    setKnown(null);
    setConditionMarked(false);
    setHint("");
  }

  async function receive() {
    const raw = pendingCode || code;
    const match = matches.find((row) => row.productId === chosen) ?? (matches.length === 1 ? matches[0] : undefined);
    setSaving(true);
    setProblem("");
    try {
      const response = await fetch("/api/inventory/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: raw,
          quantity: hasCode ? 1 : quantity,
          condition,
          ...(match ? { productId: match.productId } : {}),
          deviceName: deviceName.trim() || catalog?.name || device.name,
          ...(deviceType ? { category: deviceType } : {}),
          imei: device.imei,
          serial: device.serial,
          mpn: device.mpn,
          modelNumber: device.modelNumber,
          colour: device.colour,
          storage: device.storage,
          batteryHealth: device.batteryHealth,
          fmi: device.fmi,
          sim: device.sim,
          version: device.version,
          supplierCode: device.supplierCode,
          vendorName: vendorName.trim(),
          ...(sellingPrice ? { sellingPrice: Math.trunc(Number(sellingPrice)) } : {}),
        }),
      });
      const result = await response.json();
      if (response.status === 409 && Array.isArray(result.matches) && result.matches.length) {
        setMatches(result.matches as ScanMatch[]);
        setChosen("");
        if (result.catalog) setCatalog(result.catalog);
        setProblem("Choose which product this is, then Submit again.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      const product = items.find((item) => item.product.id === (match?.productId || result.product.id))?.product;
      const label = overlayDevice(labelDevice(), { ...(result.device || {}), unitCode: result.unit?.unitCode || "" });
      if (result.unit?.id && arrivalPhotos.length) {
        const photos = new FormData();
        arrivalPhotos.forEach((blob) => photos.append("photo", blob, "device.jpg"));
        await fetch(`/api/devices/${result.unit.id}/photos`, { method: "POST", body: photos });
      }
      const printed = Boolean(label.unitCode || label.imei || label.serial) && printLabel(label);
      await onReceived({
        id: result.movement.id,
        createdAt: result.movement.createdAt,
        branchName: result.branchName,
        receivedBy: result.receivedBy,
        reference: result.reference,
        note: result.note,
        quantity: hasCode ? 1 : quantity,
        previousStock: result.previousStock,
        newStock: result.stockOnHand,
        vendorName: result.vendorName,
        sourceName: result.sourceName,
        product: {
          name: result.product.name,
          sku: result.product.sku,
          category: result.product.category,
          brand: result.product.brand,
          costPrice: product?.costPrice ?? result.product.costPrice ?? null,
        },
        phoneLabel: printed ? label : null,
      });
      onError("");
      onNotice(
        printed
          ? `Received ${result.product.name}. The label is printing: stick it on the ${condition === "NEW" ? "box" : "back of the device"}. On hand ${result.previousStock} → ${result.stockOnHand}.`
          : `Received ${quantity} × ${result.product.name}. On hand ${result.previousStock} → ${result.stockOnHand}.`,
      );
      closeSheet();
      resetScan();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Stock receipt failed. The on-hand figure was not changed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleScan(raw: string, nextCondition: ReceiveCondition = condition, mode: "replace" | "fill" = "replace") {
    const scanned = raw.trim();
    if (scanned.length < 2 || saving) return;
    setCode(scanned);
    setPendingCode(scanned);
    setLooking(true);
    setProblem("");
    setHint("");
    onError("");
    try {
      const inferred = conditionMarked ? null : inferArrivalCondition(scanned);
      const current: ReceiveCondition = inferred === "NEW" || inferred === "EX_UK" ? inferred : nextCondition;
      if (inferred === "NEW" || inferred === "EX_UK") {
        setCondition(current);
        setConditionMarked(true);
      }
      const found = await resolveMatches(scanned, current);
      const payload = parseScanPayload(scanned);
      // Any code that is not a product goes in as this device's serial, so it can still be received and labelled.
      const unlisted = !found.matches.length && !found.device.imei && !found.device.serial && !found.device.unitCode && /^(?=.*\d)[A-Z0-9]{8,20}$/i.test(scanned) && payload.kind === "sku";
      // On an Ex-UK phone an unknown code is the supplier's sticker on the back, not the phone's own serial.
      const sticker = unlisted && current === "EX_UK";
      const read = overlayDevice(found.device, { colour: found.device.colour || found.matches[0]?.colour || "", serial: unlisted && !sticker ? scanned.toUpperCase() : "", supplierCode: sticker ? scanned.toUpperCase() : "" });
      const rescan = scanned === pendingCode;
      // A box has several barcodes: part number, serial, UPC. A further scan adds to the open device unless it is a second device.
      const adding = sheetOpen && !rescan && !found.known && !((device.imei || device.serial) && (read.imei || read.serial));
      const blanks = overlayDevice(emptyScannedDevice(), Object.fromEntries((Object.keys(read) as (keyof typeof read)[]).filter((key) => !device[key] && read[key]).map((key) => [key, read[key]])));
      const scannedDevice = mode === "fill" ? overlayDevice(device, blanks) : adding ? overlayDevice(device, read) : read;
      if (!adding || found.matches.length) setPendingCode(scanned);
      setCatalog(found.catalog || (adding ? catalog : null));
      setDevice(scannedDevice);
      setKnown(found.known);
      if (!adding || found.matches.length) {
        setMatches(found.known && found.known.status !== "SOLD" ? [] : found.matches);
        setChosen(found.matches.length === 1 ? found.matches[0].productId : "");
      }
      const quantityRead = scanned.match(/\bQty\s+(\d{1,4})\b/i)?.[1];
      if (quantityRead && (mode !== "fill" || quantity === 1)) setQuantity(Number(quantityRead));
      const keepName = mode === "fill" && deviceName.trim();
      const keepCategory = mode === "fill" && category;
      setDeviceName(keepName ? deviceName : found.device.name || found.catalog?.name || found.matches[0]?.name || (rescan || adding ? deviceName : ""));
      setCategory(keepCategory ? category : found.device.category || found.catalog?.category || found.matches[0]?.category || (rescan || adding ? category : ""));
      const suggested = payload.kind === "mpn" ? suggestedConditionFromMpn(payload.code) : null;
      setHint(
        found.known?.status === "SOLD"
          ? `Sold before${found.known.invoiceNumber ? ` on ${found.known.invoiceNumber}` : ""}. Its saved details are filled in; receiving it starts a new record.`
          : inferred === "TRADE_IN"
            ? "This looks like a phone being handed in. Trade-in starts on Sales: choose the phone going out, then Add a trade-in."
            : inferred === "NEW" || inferred === "EX_UK"
            ? `Marked as ${inferred === "NEW" ? "New" : "Ex-UK"} from this ${inferred === "NEW" ? "box QR" : "barcode"}. Fill anything it missed, including the vendor${inferred === "EX_UK" ? " and battery health" : ""}.`
            : suggested && suggested !== current
            ? `This Apple part number looks ${suggested === "NEW" ? "new retail" : "refurbished"}. Check New or Ex-UK.`
            : !found.matches.length && !found.catalog && !found.device.name && !found.known && !(adding && (deviceName || category))
              ? `${scannedDevice.imei || scannedDevice.serial ? "Code read." : "New code."} It does not say the model, so choose what this is and its model once. Submit then adds it to the system${scannedDevice.imei || scannedDevice.serial ? " and prints its barcode label" : ""}.`
              : "",
      );
      setSheetOpen(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : "That scan could not be looked up.");
    } finally {
      setLooking(false);
    }
  }

  function changeCondition(next: ReceiveCondition) {
    setConditionMarked(true);
    setCondition(next);
    if (sheetOpen && pendingCode) void handleScan(pendingCode, next);
  }

  function onCodeKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleScan(code);
  }

  const onShelf = Boolean(known && known.status !== "SOLD");
  const hasCode = Boolean(device.imei || device.serial);
  const name = deviceName.trim() || device.name || catalog?.name || "";
  const deviceType = category || lookupAppleIdentity(name)?.category || "";
  const needsBattery = condition !== "NEW" && hasCode && !onShelf && typesWithBattery.includes(deviceType);
  const needsType = !onShelf && !matches.length && !deviceType;
  const missing = [
    needsType ? "what this device is" : "",
    !name ? "device name" : "",
    condition !== "NEW" && !hasCode ? "IMEI or serial" : "",
    needsBattery && !device.batteryHealth ? "battery health" : "",
    matches.length > 1 && !chosen ? "which product" : "",
    !onShelf && vendorName.trim().length < 2 ? "vendor" : "",
  ].filter(Boolean);
  const shownFields = detailFields.filter(([key]) => (key !== "imei" && key !== "sim") || !deviceType || typesWithSim.includes(deviceType));
  const blank = (key: keyof ScannedDevice) => (key === "imei" || key === "serial" ? !hasCode : key === "storage" || key === "colour" ? !device[key] : false);

  return (
    <section id="scan-arrivals" className="inventory-scan-panel border border-[#e5e5e5] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#111111] text-white"><ScanLine className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#1a1a1a]">Scan arrivals</h3>
          <p className="mt-1 text-xs leading-5 text-[#7e897f]">Open the camera and take the first photo. A box QR is marked New. A barcode with the IMEI or battery is marked Ex-UK. Tap + for colour, storage, the chip or battery health if the first photo missed them. The selling price updates inventory.</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Condition of the next scan">
        {conditions.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={condition === value} onClick={() => changeCondition(value)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${condition === value ? "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#2d2d2d] hover:border-[#c4c4c4]"}`}>{label}</button>
        ))}
      </div>

      <p className="mb-3 text-[11px] leading-4 text-[#6b6b6b]">Taking a trade-in? It starts with the sale of the new phone: use Add a trade-in on the <a href="/sales" className="font-semibold underline">Sales</a> page.</p>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <DeviceCamera onRead={(text, mode) => void handleScan(text, condition, mode)} onShots={setArrivalPhotos} askFor={sheetOpen ? [
          !device.colour ? "the colour" : "",
          deviceType === "Apple accessories" && matches.length !== 1 && !name ? "which accessory this is" : "",
          !device.storage && deviceType !== "Apple accessories" && deviceType !== "AirPods" ? "the storage" : "",
          needsBattery && !device.batteryHealth ? "battery health" : "",
          condition !== "NEW" && !(device.imei || device.serial) ? "the IMEI or serial" : "",
        ].filter(Boolean)[0] || "" : ""} />
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={onCodeKey}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Type an IMEI, serial or SKU"
            placeholder="Or type an IMEI, serial or SKU"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#c4c4c4] px-3 font-mono text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#e5e5e5]"
          />
          <button type="button" disabled={looking || code.trim().length < 2} onClick={() => void handleScan(code)} className="min-h-11 shrink-0 rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50">{looking ? "Looking…" : "Open"}</button>
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6b6b6b]"><span className="h-1.5 w-1.5 rounded-full bg-[#2f7d4f]" />Scanner ready{looking ? " · looking up…" : ""}</p>

      {lastLabel ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
          <p className="text-xs text-[#526057]">Last label · {lastLabel.name || lastLabel.imei}{lastLabel.imei ? ` · ${lastLabel.imei}` : ""}</p>
          <button type="button" onClick={() => printLabel(lastLabel)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c4c4c4] px-3 text-[11px] font-semibold text-[#2d2d2d]"><Printer className="h-3.5 w-3.5" />Reprint</button>
        </div>
      ) : null}

      {sheetOpen ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" aria-label="Close" onClick={() => { if (!saving) closeSheet(); }} className="absolute inset-0 bg-[#111111]/55 backdrop-blur-[2px]" />
          <section role="dialog" aria-modal="true" aria-label="Device details" className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-[#e5e5e5] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#6b6b6b]">
                  {onShelf ? (known?.status === "RESERVED" ? "Held for a sale" : "Already in stock") : known?.status === "SOLD" ? "Sold before" : condition === "EX_UK" ? "Ex-UK arrival" : "New arrival"}
                  {catalog?.modelNumber || device.modelNumber ? ` · ${device.modelNumber || catalog?.modelNumber}` : ""}
                </p>
                <h4 className="mt-0.5 truncate text-base font-semibold text-[#111111]">{name || "Scanned device"}</h4>
                {device.imei || device.serial ? <p className="mt-0.5 truncate font-mono text-[11px] text-[#6b6b6b]">{device.imei ? `IMEI ${device.imei}` : `Serial ${device.serial}`}</p> : null}
              </div>
              <button type="button" onClick={closeSheet} disabled={saving} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#6b6b6b] hover:bg-[#f5f5f5]"><X className="h-4 w-4" /></button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {onShelf && known ? (
                <p className="rounded-xl border border-[#cfe3d5] bg-[#f1f8f3] px-3 py-2 text-xs leading-5 text-[#2d2d2d]">
                  Received {new Date(known.receivedAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}{known.source ? ` from ${known.source}` : ""} as {conditionLabels[known.condition] ?? known.condition}. Details come from its saved record. Check them, then print the label. <a href={`/devices?q=${encodeURIComponent(device.unitCode || device.imei || device.serial)}`} className="font-semibold underline">Gadgets history</a>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Condition">
                  {conditions.map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={condition === value} onClick={() => changeCondition(value)} className={`min-h-10 rounded-lg border text-xs font-semibold ${condition === value ? "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] text-[#2d2d2d]"}`}>{label}</button>
                  ))}
                </div>
              )}
              {hint ? <p className="text-xs leading-5 text-[#8a4b2f]">{hint}</p> : null}

              {needsBattery || (onShelf && condition !== "NEW") ? (
                <BatteryHealthField value={device.batteryHealth} onChange={(batteryHealth) => setDevice((current) => ({ ...current, batteryHealth }))} />
              ) : null}

              {!onShelf && category && !changeType ? (
                <p className="text-xs text-[#526057]">Mapped as {category}. <button type="button" onClick={() => setChangeType(true)} className="font-semibold underline">Change</button></p>
              ) : null}
              {!onShelf && (!category || changeType) ? (
                <div role="group" aria-label="What this device is">
                  <p className={`mb-1 text-xs font-medium ${needsType ? "text-[#a15d3d]" : "text-[#526057]"}`}>What is it?</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {deviceTypes.map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={deviceType === value} onClick={() => setCategory(value)} className={`min-h-10 rounded-lg border px-1 text-[11px] font-semibold ${deviceType === value ? "border-[#111111] bg-[#111111] text-white" : needsType ? "border-[#eb6834] bg-white text-[#2d2d2d]" : "border-[#e5e5e5] bg-white text-[#2d2d2d] hover:border-[#c4c4c4]"}`}>{label}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="block text-xs font-medium text-[#526057]">Device name
                <input list="scan-device-models" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={namePlaceholders[deviceType] ?? "Model and storage"} className={`${fieldClass} ${!name ? "border-[#eb6834]" : ""}`} />
                <datalist id="scan-device-models">{appleModelsFor(deviceType).map((model) => <option key={model} value={model} />)}</datalist>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {shownFields.map(([key, label, placeholder]) => (
                  <label key={key} className={`text-[10px] font-medium uppercase tracking-[.08em] ${blank(key) ? "text-[#a15d3d]" : "text-[#6b6b6b]"}`}>
                    {label}
                    <input
                      value={device[key]}
                      onChange={(event) => setDevice((current) => ({ ...current, [key]: key === "imei" ? event.target.value.replace(/\D/g, "").slice(0, 15) : event.target.value }))}
                      placeholder={placeholder}
                      inputMode={key === "imei" ? "numeric" : undefined}
                      className={`mt-1 w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-xs normal-case tracking-normal text-[#111111] outline-none focus:border-[#111111] ${blank(key) ? "border-[#eb6834]" : "border-[#d4d4d4]"}`}
                    />
                  </label>
                ))}
              </div>

              {matches.length > 1 ? (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-xs font-medium text-[#526057]">Which product is this?</legend>
                  {matches.map((match) => (
                    <label key={match.productId} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${chosen === match.productId ? "border-[#111111] bg-[#fafafa]" : "border-[#e5e5e5]"}`}>
                      <span className="flex items-center gap-2.5">
                        <input type="radio" name="scan-product" checked={chosen === match.productId} onChange={() => setChosen(match.productId)} />
                        <span><span className="block text-sm font-semibold">{match.name}</span><span className="block font-mono text-[10px] text-[#819087]">{match.sku} · {match.colour || match.category} · {match.stockOnHand} on hand</span></span>
                      </span>
                      <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold text-[#2d2d2d]">{conditionLabels[match.condition] ?? match.condition}</span>
                    </label>
                  ))}
                </fieldset>
              ) : matches.length === 1 && !onShelf ? (
                <p className="text-xs text-[#526057]">Adds to <span className="font-semibold text-[#111111]">{matches[0].name}</span> · {matches[0].sku} · {matches[0].stockOnHand} on hand</p>
              ) : null}

              {!onShelf ? (
                  <label className="block text-xs font-medium text-[#526057]">Vendor<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Supplier this stock came from" className={`${fieldClass} ${vendorName.trim().length < 2 ? "border-[#eb6834]" : ""}`} /></label>
              ) : null}

              {!onShelf ? (
                <div className="grid grid-cols-2 gap-3">
                  {!hasCode ? <label className="text-xs font-medium text-[#526057]">Quantity<input type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} className={fieldClass} /></label> : null}
                  <label className="text-xs font-medium text-[#526057]">Selling price (KES) <span className="font-normal">updates inventory</span><input type="number" min={1} value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} className={fieldClass} /></label>
                </div>
              ) : null}

              {hasCode ? <PhoneLabelPreview device={labelDevice()} /> : null}
            </div>

            <footer className="border-t border-[#e5e5e5] bg-white px-4 py-3">
              {problem ? <p role="alert" className="mb-2 text-xs text-[#a15d3d]">{problem}</p> : missing.length ? <p className="mb-2 text-xs text-[#8a4b2f]">Still needed: {missing.join(", ")}.</p> : null}
              <div className="flex gap-2">
                <button type="button" onClick={closeSheet} disabled={saving} className="min-h-11 rounded-lg border border-[#c4c4c4] px-4 text-sm font-semibold text-[#2d2d2d]">Cancel</button>
                {onShelf ? (
                  <button type="button" disabled={!hasCode} onClick={() => { if (printLabel()) { onNotice(`Label for ${name || "this device"} sent to the printer. Stick it on the back of the device.`); closeSheet(); resetScan(); } }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50"><Printer className="h-4 w-4" />Print label</button>
                ) : (
                  <button type="button" disabled={saving || !canReceive || missing.length > 0} onClick={() => void receive()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50">
                    {hasCode ? <Printer className="h-4 w-4" /> : null}
                    {saving ? "Receiving…" : !canReceive ? "View only" : hasCode ? `Submit & print ${PHONE_LABEL.widthMm}×${PHONE_LABEL.heightMm} label` : "Submit"}
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
