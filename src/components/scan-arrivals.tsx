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

  async function resolveMatches(raw: string): Promise<{ matches: ScanMatch[]; catalog: CatalogHint | null; device: ScannedDevice }> {
    const parsed = parseDeviceScan(raw);
    const identity = lookupAppleIdentity(raw);
    const local = localMatches(raw);
    if (local.length) return { matches: local, catalog: identity, device: parsed };
    const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(raw)}&condition=${condition}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok && response.status !== 404 && response.status !== 400) throw new Error(data.error ?? "That scan could not be looked up.");
    return {
      matches: (data.matches as ScanMatch[]) || [],
      catalog: data.catalog || identity,
      device: overlayDevice(parsed, data.device || {}),
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
    const label = labelDevice(current);
    if (!label.imei && !label.serial) {
      onError("Scan the IMEI or serial first so the barcode on the sticker has something to encode.");
      return;
    }
    printPhoneLabel(label);
    setLastLabel(label);
    onNotice(`GadgetHub ${PHONE_LABEL.widthMm}×${PHONE_LABEL.heightMm} mm label sent to the printer. Tape it on the back of the handset.`);
  }

  async function receiveMatch(raw: string, match?: ScanMatch) {
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
          deviceName: deviceName.trim() || catalog?.name || device.name,
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
      const label = { ...overlayDevice(labelDevice(), result.device || {}), ...(condition === "NEW" ? { workingNote: "Brand new · sealed" } : {}) };
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
        phoneLabel: condition === "NEW" ? null : label,
      });
      onNotice(
        condition === "NEW"
          ? `Received ${quantity} × ${result.product.name}. On hand ${result.previousStock} → ${result.stockOnHand}.`
          : `Received ${quantity} × ${result.product.name}. Phone label is printing — tape it on the back.`,
      );
      setCode("");
      setMatches([]);
      setCatalog(null);
      setPendingCode("");
      setQuantity(1);
      setDeviceName("");
      setSellingPrice("");
      setDevice(emptyScannedDevice());
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
      setCatalog(found.catalog);
      setDevice(overlayDevice(found.device, { colour: found.device.colour || found.matches[0]?.colour || "" }));
      if (!deviceName && (found.device.name || found.catalog?.name || found.matches[0]?.name)) {
        setDeviceName(found.device.name || found.catalog?.name || found.matches[0]?.name || "");
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
        await receiveMatch(scanned, found.matches[0]);
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
            <p className="mt-1 text-xs text-[#7e897f]">New, Ex-UK or trade-in. Plug in the scanner and the 90 × 50 mm label printer. Trade-in takes the owner’s details first. Ex-UK and trade-in print a GadgetHub note to tape on the back of the phone.</p>
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
            onClick={() => { setCondition(value); setMatches([]); setCatalog(null); setDevice(emptyScannedDevice()); onError(""); }}
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

      {condition !== "NEW" ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_min(100%,340px)]">
          <BatteryHealthField
            value={device.batteryHealth}
            onChange={(batteryHealth) => setDevice((current) => ({ ...current, batteryHealth }))}
          />
          <PhoneLabelPreview device={labelDevice()} />
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
              {condition === "TRADE_IN" ? " · source is the person above" : ` · receiving as ${conditionLabels[condition]}`}
            </p>
            {condition !== "NEW" ? (
              <button type="button" onClick={() => printLabel()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#c4c4c4] bg-white px-3 text-[11px] font-semibold text-[#2d2d2d] hover:bg-white">
                <Printer className="h-3.5 w-3.5" />
                Print {PHONE_LABEL.widthMm}×{PHONE_LABEL.heightMm} mm label
              </button>
            ) : null}
          </div>
          {condition !== "NEW" ? (
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
