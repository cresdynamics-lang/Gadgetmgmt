"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Camera, CameraOff, Printer, ScanLine } from "lucide-react";

import { conditionLabels } from "@/lib/catalog";
import { lookupAppleIdentity, suggestedConditionFromMpn } from "@/lib/apple-barcodes";
import { deviceHasIdentity, emptyScannedDevice, overlayDevice, parseDeviceScan, type ScannedDevice } from "@/lib/device-scan";
import { matchScanProducts, parseScanPayload, type ScanableProduct } from "@/lib/inventory-scan";
import { BatteryHealthField, PhoneLabelPreview } from "@/components/phone-label-preview";
import { PHONE_LABEL, printPhoneLabel } from "@/lib/phone-label";
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

type ReceiveCondition = "NEW" | "EX_UK" | "TRADE_IN";

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

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

function detectorCtor() {
  return (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
}

export function ScanArrivals({ items, canReceive, onReceived, onError, onNotice }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScanRef = useRef({ code: "", at: 0 });
  const handleScanRef = useRef<(raw: string, source?: "typed" | "camera") => Promise<void>>(async () => undefined);

  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<ReceiveCondition>("NEW");
  const [vendorName, setVendorName] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourcePhone, setSourcePhone] = useState("");
  const [hasReceipt, setHasReceipt] = useState(false);
  const [hasBox, setHasBox] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [catalog, setCatalog] = useState<CatalogHint | null>(null);
  const [pendingCode, setPendingCode] = useState("");
  const [device, setDevice] = useState<ScannedDevice>(emptyScannedDevice);
  const [lastLabel, setLastLabel] = useState<ScannedDevice | null>(null);
  const [known, setKnown] = useState<KnownUnit | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const Detector = detectorCtor();
    if (!video || !Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraOn(false);
      onError("This browser cannot open the camera scanner. Use a USB scanner in the field below, or type the SKU / IMEI.");
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        let detector: BarcodeDetectorLike;
        try {
          detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"] });
        } catch {
          detector = new Detector();
        }
        setCameraReady(true);
        timer = window.setInterval(() => {
          void detector.detect(video).then((found) => {
            const value = found[0]?.rawValue?.trim();
            if (value) void handleScanRef.current(value, "camera");
          }).catch(() => undefined);
        }, 280);
      } catch {
        if (!cancelled) {
          setCameraOn(false);
          onError("Camera access was blocked. Allow the camera, or use a USB scanner in the field below.");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setCameraReady(false);
    };
  }, [cameraOn]);

  function localMatches(raw: string): ScanMatch[] {
    return matchScanProducts(raw, items.map((item) => item.product), { condition }).map((hit) => {
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

  function readyToReceive() {
    if (condition === "TRADE_IN") return sourceName.trim().length >= 2 && sourcePhone.replace(/\D/g, "").length >= 9;
    return vendorName.trim().length >= 2;
  }

  async function resolveMatches(raw: string): Promise<{ matches: ScanMatch[]; catalog: CatalogHint | null; device: ScannedDevice; known: KnownUnit | null }> {
    const parsed = parseDeviceScan(raw);
    const identity = lookupAppleIdentity(raw);
    // A phone's own barcode (IMEI / serial) is looked up on the server, which fills in its saved details.
    const hasDeviceCode = Boolean(parsed.imei || parsed.serial || parseScanPayload(raw).kind === "imei");
    const local = hasDeviceCode ? [] : localMatches(raw);
    if (local.length) return { matches: local, catalog: identity, device: parsed, known: null };
    const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(raw)}&condition=${condition}`, { cache: "no-store" });
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
    return overlayDevice(current, {
      name,
      group: current.group || catalog?.name || name,
      colour: current.colour,
      storage: current.storage,
    });
  }

  function printLabel(current?: ScannedDevice) {
    const label = { ...labelDevice(current), ...((known?.condition ?? condition) === "NEW" ? { workingNote: "Brand new · sealed" } : {}) };
    if (!label.imei && !label.serial) {
      onError("Scan the IMEI or serial first so the barcode on the sticker has something to encode.");
      return;
    }
    printPhoneLabel(label);
    setLastLabel(label);
    onNotice(`${PHONE_LABEL.widthMm}×${PHONE_LABEL.heightMm} mm label sent to the printer. Tape it on the back of the handset.`);
  }

  async function receiveMatch(raw: string, match?: ScanMatch, scannedDevice: ScannedDevice = device) {
    if (!canReceive) {
      onError("Your permissions cannot receive stock. Ask the super admin to unlock inventory receive.");
      return;
    }
    if (!readyToReceive()) {
      onError(condition === "TRADE_IN"
        ? "Enter the person who brought this phone, then Receive."
        : "Enter the vendor name, then Receive.");
      return;
    }
    setSaving(true);
    onError("");
    const label = match?.name || catalog?.name || "this device";
    onNotice(`Receiving ${quantity} × ${label}…`);
    try {
      const response = await fetch("/api/inventory/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: raw,
          quantity,
          condition,
          ...(match ? { productId: match.productId } : {}),
          deviceName: deviceName.trim() || catalog?.name || scannedDevice.name,
          imei: scannedDevice.imei,
          serial: scannedDevice.serial,
          mpn: scannedDevice.mpn,
          modelNumber: scannedDevice.modelNumber,
          colour: scannedDevice.colour,
          storage: scannedDevice.storage,
          batteryHealth: scannedDevice.batteryHealth,
          fmi: scannedDevice.fmi,
          sim: scannedDevice.sim,
          version: scannedDevice.version,
          ...(condition === "TRADE_IN"
            ? {
                sourceName: sourceName.trim(),
                sourcePhone: sourcePhone.trim(),
                hasReceipt,
                hasBox,
                ...(sellingPrice ? { sellingPrice: Math.trunc(Number(sellingPrice)) } : {}),
              }
            : {
                vendorName: vendorName.trim(),
                ...(condition === "EX_UK" && sellingPrice ? { sellingPrice: Math.trunc(Number(sellingPrice)) } : {}),
              }),
        }),
      });
      const result = await response.json();
      if (response.status === 409 && Array.isArray(result.matches) && result.matches.length) {
        setPendingCode(raw);
        setMatches(result.matches as ScanMatch[]);
        if (result.catalog) setCatalog(result.catalog);
        onError("Confirm which product below. Receive will then update on-hand stock.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      const product = items.find((item) => item.product.id === (match?.productId || result.product.id))?.product;
      // Every phone with an IMEI or serial gets its sticker as soon as it is received.
      const label = { ...overlayDevice(labelDevice(scannedDevice), result.device || {}), ...(condition === "NEW" ? { workingNote: "Brand new · sealed" } : {}) };
      if (label.imei || label.serial) {
        printPhoneLabel(label);
        setLastLabel(label);
      }
      await onReceived({
        id: result.movement.id,
        createdAt: result.movement.createdAt,
        branchName: result.branchName,
        receivedBy: result.receivedBy,
        reference: result.reference,
        note: result.note,
        quantity,
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
        phoneLabel: label.imei || label.serial ? label : null,
      });
      onNotice(
        label.imei || label.serial
          ? `Received ${result.product.name}. Label is printing — stick it on the ${condition === "NEW" ? "box" : "back of the phone"}. On hand ${result.previousStock} → ${result.stockOnHand}.`
          : `Received ${quantity} × ${result.product.name}. On hand ${result.previousStock} → ${result.stockOnHand}.`,
      );
      setCode("");
      setMatches([]);
      setCatalog(null);
      setPendingCode("");
      setQuantity(1);
      setDeviceName("");
      setSellingPrice("");
      setDevice(emptyScannedDevice());
      setKnown(null);
      if (condition === "TRADE_IN") {
        setSourceName("");
        setSourcePhone("");
        setHasReceipt(false);
        setHasBox(false);
      }
      inputRef.current?.focus();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Stock receipt failed. The on-hand figure was not changed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleScan(raw: string, source: "typed" | "camera" = "typed") {
    const scanned = raw.trim();
    if (scanned.length < 2 || saving) return;
    const now = Date.now();
    if (source === "camera" && lastScanRef.current.code === scanned && now - lastScanRef.current.at < 1200) return;
    lastScanRef.current = { code: scanned, at: now };
    setCode(scanned);
    try {
      const found = await resolveMatches(scanned);
      const scannedDevice = overlayDevice(found.device, { colour: found.device.colour || found.matches[0]?.colour || "" });
      setCatalog(found.catalog);
      setDevice(scannedDevice);
      setKnown(found.known);
      if (!deviceName && (found.device.name || found.catalog?.name || found.matches[0]?.name)) {
        setDeviceName(found.device.name || found.catalog?.name || found.matches[0]?.name || "");
      }
      if (found.known && found.known.status !== "SOLD") {
        // Already on the shelf: show its saved details and offer a reprint instead of receiving it twice.
        setMatches([]);
        setPendingCode("");
        onError("");
        onNotice(`${found.known.productName} is already in stock (received ${new Date(found.known.receivedAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}${found.known.source ? ` from ${found.known.source}` : ""}). Details filled in from the system — reprint the label if it is missing.`);
        return;
      }
      if (found.known?.status === "SOLD") {
        onNotice(`This phone was sold before${found.known.invoiceNumber ? ` on ${found.known.invoiceNumber}` : ""}. Its saved details are filled in; receiving it starts a new record.`);
      }
      const hint = parseScanPayload(scanned);
      if (hint.kind === "mpn") {
        const suggested = suggestedConditionFromMpn(hint.code);
        if (suggested && condition !== "TRADE_IN" && condition !== suggested) {
          onNotice(`This Apple part number looks ${suggested === "NEW" ? "new retail" : "refurbished"}. Confirm New or Ex-UK before receiving.`);
        }
      }
      if (!found.matches.length) {
        setMatches([]);
        setPendingCode(scanned);
        // A fully read Ex-UK sticker with the vendor filled in goes straight in, and its label prints.
        const readable = Boolean((scannedDevice.imei || scannedDevice.serial) && (deviceName || scannedDevice.name || found.catalog?.name));
        if (condition === "EX_UK" && readable && readyToReceive()) {
          await receiveMatch(scanned, undefined, scannedDevice);
          return;
        }
        if (condition !== "NEW" && (found.catalog || deviceHasIdentity(found.device))) {
          onError("");
          onNotice(
            condition === "TRADE_IN"
              ? `${found.device.name || found.catalog?.name || "Device"} recognised. Enter the person who brought it, then Receive to print the back-of-phone label.`
              : `${found.device.name || found.catalog?.name || "Device"} recognised from the scan. Enter the vendor, then Receive to add it and print the sticker.`,
          );
          return;
        }
        onError(
          found.catalog
            ? `${found.catalog.name} recognised from the Apple ${found.catalog.matchedBy === "model" ? "model number" : found.catalog.matchedBy === "gtin" ? "box barcode" : "part number"}. Confirm the ${condition === "EX_UK" ? "Ex-UK" : "New"} listing below, or set the product up first.`
            : hint.kind === "imei"
              ? `IMEI ${scanned} is not on file. Type the product name or SKU, then Receive — I will ask you to confirm before stock is added.`
              : `No product matches “${scanned}”. Type the product name or SKU (for example iPhone 17 Pro 256) and Receive again.`,
        );
        return;
      }
      setPendingCode(scanned);
      setMatches(found.matches);
      onError("");
      if (found.matches.length === 1 && readyToReceive()) {
        await receiveMatch(scanned, found.matches[0], scannedDevice);
        return;
      }
      onNotice(
        found.catalog
          ? `${found.catalog.name} · ${found.matches.length === 1 ? "ready to receive" : `${found.matches.length} matching SKUs`}. ${readyToReceive() ? "Tap Receive or confirm the SKU." : condition === "TRADE_IN" ? "Enter the person who brought it, then Receive." : "Enter the vendor, then Receive."}`
          : `Confirm which of ${found.matches.length} matches to receive. Stock updates only after you tap Receive.`,
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : "That scan could not be looked up.");
    }
  }

  handleScanRef.current = handleScan;

  function onScanKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    void handleScan(code, "typed");
  }

  const fieldClass = "mt-1.5 w-full rounded-lg border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#e5e5e5]";

  return (
    <section id="scan-arrivals" className="inventory-scan-panel border border-[#e5e5e5] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#111111] text-white"><ScanLine className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a]">Scan arrivals</h3>
            <p className="mt-1 text-xs text-[#7e897f]">New, Ex-UK or trade-in. Plug in the scanner and the 90 × 50 mm label printer. Every phone received with an IMEI prints its label straight away. Scanning a label already on file fills in that phone’s details from the system.</p>
          </div>
        </div>
        <button type="button" onClick={() => { onError(""); setCameraOn((current) => !current); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#c4c4c4] px-3 text-xs font-semibold text-[#2d2d2d] hover:bg-white">
          {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraOn ? "Stop camera" : "Use camera"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {([
          ["NEW", "New"],
          ["EX_UK", "Ex-UK"],
          ["TRADE_IN", "Trade-in"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={condition === value}
            onClick={() => { setCondition(value); setMatches([]); setCatalog(null); setDevice(emptyScannedDevice()); setKnown(null); onError(""); }}
            className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${condition === value ? "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#2d2d2d] hover:border-[#c4c4c4]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {cameraOn ? (
        <div className="mb-4 overflow-hidden rounded-xl bg-[#111111]">
          <video ref={videoRef} className="inventory-scan-video" muted playsInline autoPlay />
          {!cameraReady ? <p className="px-3 py-2 text-xs text-white/80">Opening camera…</p> : null}
        </div>
      ) : null}

      {condition === "TRADE_IN" ? (
        <div className="mb-4 rounded-xl border border-[#111111] bg-[#fafafa] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#6b6b6b]">Owner details first</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[#526057]">Person who brought it<input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Name as on ID" className={fieldClass} /></label>
            <label className="text-xs font-medium text-[#526057]">Their phone<input type="tel" inputMode="tel" value={sourcePhone} onChange={(event) => setSourcePhone(event.target.value)} placeholder="07xx xxx xxx" className={fieldClass} /></label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#1a1a1a]">
              <input type="checkbox" checked={hasReceipt} onChange={(event) => setHasReceipt(event.target.checked)} className="h-4 w-4" />
              Receipt
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#1a1a1a]">
              <input type="checkbox" checked={hasBox} onChange={(event) => setHasBox(event.target.checked)} className="h-4 w-4" />
              Phone box
            </label>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs font-medium text-[#526057]">Vendor name<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="Supplier this stock came from" className={fieldClass} /></label>
        </div>
      )}

      {known ? (
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${known.status === "SOLD" ? "border-[#e5e5e5] bg-[#fafafa]" : "border-[#cfe3d5] bg-[#f1f8f3]"}`}>
          <div className="min-w-0 text-xs leading-5">
            <p className="font-semibold text-[#111111]">{known.status === "SOLD" ? "Sold before" : known.status === "RESERVED" ? "Held for a sale awaiting payment" : "Already in stock"} · {known.productName}</p>
            <p className="text-[#526057]">Received {new Date(known.receivedAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}{known.source ? ` from ${known.source}` : ""}{known.invoiceNumber ? ` · sold on ${known.invoiceNumber}` : ""}</p>
          </div>
          <div className="flex gap-2">
            {known.status !== "SOLD" ? <button type="button" onClick={() => printLabel()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#111111] px-3 text-[11px] font-semibold text-white"><Printer className="h-3.5 w-3.5" />Reprint label</button> : null}
            <a href={`/devices?q=${encodeURIComponent(device.imei || device.serial)}`} className="inline-flex min-h-9 items-center rounded-lg border border-[#c4c4c4] bg-white px-3 text-[11px] font-semibold text-[#2d2d2d]">Phone history</a>
          </div>
        </div>
      ) : null}

      {condition !== "NEW" || device.imei || device.serial ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_min(100%,340px)]">
          {condition !== "NEW" ? <BatteryHealthField
            value={device.batteryHealth}
            onChange={(batteryHealth) => setDevice((current) => ({ ...current, batteryHealth }))}
          /> : <p className="self-center text-xs leading-5 text-[#7e897f]">{known ? "Details come from this phone’s saved record. Check the label, then reprint it if needed." : "Each New phone is saved by its IMEI, and this label prints for the box as soon as it is received."}</p>}
          <PhoneLabelPreview device={{ ...labelDevice(), ...((known?.condition ?? condition) === "NEW" ? { workingNote: "Brand new · sealed" } : {}) }} />
        </div>
      ) : null}

      {condition !== "NEW" ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#526057]">Device name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="iPhone 14 128GB" className={fieldClass} /></label>
          <label className="text-xs font-medium text-[#526057]">Selling price (KES) <span className="font-normal">(optional)</span><input type="number" min={1} value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} className={fieldClass} /></label>
        </div>
      ) : null}

      {catalog || deviceHasIdentity(device) ? (
        <div className="mb-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs text-[#2d2d2d]">
              <span className="font-semibold">{deviceName || device.name || catalog?.name || "Scanned device"}</span>
              {device.modelNumber || catalog?.modelNumber ? ` · ${device.modelNumber || catalog?.modelNumber}` : ""}
              {device.mpn ? ` · ${device.mpn}` : ""}
              {known && known.status !== "SOLD" ? ` · on file as ${conditionLabels[known.condition] ?? known.condition}` : condition === "TRADE_IN" ? " · source is the person above" : ` · receiving as ${conditionLabels[condition]}`}
            </p>
            {!(known && known.status !== "SOLD") && (condition !== "NEW" || device.imei || device.serial) ? (
              <button type="button" onClick={() => printLabel()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c4c4c4] bg-white px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-white">
                <Printer className="h-3.5 w-3.5" />
                Print {PHONE_LABEL.widthMm}×{PHONE_LABEL.heightMm} mm label
              </button>
            ) : null}
          </div>
          {condition !== "NEW" || device.imei || device.serial ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["imei", "IMEI", "15-digit IMEI"],
                ["serial", "Serial", "Sr# from About"],
                ["colour", "Colour", "MIDNIGHT"],
                ["storage", "Storage", "128GB"],
                ["fmi", "FMI", "Off"],
                ["sim", "SIM", "Unlocked"],
                ["version", "Version", "26.4"],
                ["mpn", "Part number", "MPUA3LL/A"],
              ] as const).map(([key, label, placeholder]) => (
                <label key={key} className="text-[10px] font-medium uppercase tracking-[.08em] text-[#6b6b6b]">
                  {label}
                  <input
                    value={device[key]}
                    onChange={(event) => setDevice((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={placeholder}
                    className="mt-1 w-full rounded-lg border border-[#d4d4d4] bg-white px-2.5 py-2 font-mono text-xs text-[#111111] outline-none focus:border-[#111111]"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
        <label className="text-xs font-medium text-[#526057]">
          Barcode / QR / IMEI / About
          <textarea
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={onScanKey}
            rows={2}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Click here, then scan the sticker, QR or IMEI"
            className="mt-1.5 w-full resize-y rounded-lg border border-[#c4c4c4] px-3 py-2.5 font-mono text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#e5e5e5]"
          />
        </label>
        <label className="text-xs font-medium text-[#526057]">
          Qty
          <input
            type="number"
            min={1}
            max={10000}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.trunc(Number(event.target.value) || 1)))}
            className="mt-1.5 w-full rounded-lg border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111]"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={saving || !code.trim() || !canReceive}
            onClick={() => {
              if (matches.length > 1) {
                onError("Confirm which product below. Receive will then update on-hand stock.");
                return;
              }
              if (matches.length === 1) {
                void receiveMatch(pendingCode || code, matches[0]);
                return;
              }
              if (condition !== "NEW" && (catalog || deviceHasIdentity(device) || deviceName.trim().length >= 2)) {
                void receiveMatch(pendingCode || code);
                return;
              }
              void handleScan(code, "typed");
            }}
            className="min-h-10 w-full rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Receiving…" : canReceive ? "Receive" : "View only"}
          </button>
        </div>
      </div>

      {lastLabel && condition !== "NEW" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
          <p className="text-xs text-[#526057]">Last sticker · {lastLabel.name || lastLabel.imei} {lastLabel.imei ? `· ${lastLabel.imei}` : ""}</p>
          <button type="button" onClick={() => printLabel(lastLabel)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c4c4c4] px-3 text-[11px] font-semibold text-[#2d2d2d]">
            <Printer className="h-3.5 w-3.5" />
            Reprint {PHONE_LABEL.widthMm}×{PHONE_LABEL.heightMm} mm label
          </button>
        </div>
      ) : null}

      {matches.length ? (
        <div className="mt-4 grid gap-2">
          <p className="text-xs font-medium text-[#526057]">
            {pendingCode ? `Confirm the product for “${pendingCode}”.` : "Confirm which product to receive."} Tap one to add {quantity} to on-hand stock.
          </p>
          {matches.map((match) => (
            <button
              key={match.productId}
              type="button"
              disabled={saving}
              onClick={() => void receiveMatch(pendingCode || code, match)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e5e5e5] px-3 py-3 text-left hover:bg-[#f5f5f5]"
            >
              <span>
                <span className="block text-sm font-semibold">{match.name}</span>
                <span className="mt-1 block font-mono text-[10px] text-[#819087]">{match.sku} · {match.colour || match.category} · {match.stockOnHand} on hand</span>
              </span>
              <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold text-[#2d2d2d]">{conditionLabels[match.condition] ?? match.condition}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
