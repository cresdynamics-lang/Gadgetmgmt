"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";

import { conditionLabels } from "@/lib/catalog";
import { matchScanProducts, parseScanPayload, type ScanableProduct } from "@/lib/inventory-scan";
import type { InventoryReceiptData } from "@/lib/receipt-pdf";

type ScanItem = {
  stockOnHand: number;
  reservedStock: number;
  reorderLevel: number;
  product: ScanableProduct & { costPrice: number | null };
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
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScanRef = useRef({ code: "", at: 0 });
  const handleScanRef = useRef<(raw: string, source?: "typed" | "camera") => Promise<void>>(async () => undefined);

  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [pendingCode, setPendingCode] = useState("");

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
    return matchScanProducts(raw, items.map((item) => item.product)).map((hit) => {
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

  async function resolveMatches(raw: string): Promise<ScanMatch[]> {
    const local = localMatches(raw);
    if (local.length) return local;
    const response = await fetch(`/api/inventory/scan?code=${encodeURIComponent(raw)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "That scan could not be looked up.");
    return data.matches as ScanMatch[];
  }

  async function receiveMatch(raw: string, match: ScanMatch) {
    if (!canReceive) {
      onError("Your permissions cannot receive stock. Ask the super admin to unlock inventory receive.");
      return;
    }
    setSaving(true);
    onError("");
    onNotice(`Receiving ${quantity} × ${match.name}…`);
    try {
      const response = await fetch("/api/inventory/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: raw,
          quantity,
          productId: match.productId,
        }),
      });
      const result = await response.json();
      if (response.status === 409 && Array.isArray(result.matches) && result.matches.length) {
        setPendingCode(raw);
        setMatches(result.matches as ScanMatch[]);
        onError("Confirm which product below. Receive will then update on-hand stock.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Stock receipt failed.");
      const product = items.find((item) => item.product.id === match.productId)?.product;
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
        product: {
          name: result.product.name,
          sku: result.product.sku,
          category: result.product.category,
          brand: result.product.brand,
          costPrice: product?.costPrice ?? result.product.costPrice ?? null,
        },
      });
      onNotice(`Received ${quantity} × ${result.product.name}. On hand ${result.previousStock} → ${result.stockOnHand}.`);
      setCode("");
      setMatches([]);
      setPendingCode("");
      setQuantity(1);
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
      if (!found.length) {
        const kind = parseScanPayload(scanned).kind;
        setMatches([]);
        setPendingCode(scanned);
        onError(
          kind === "imei"
            ? `IMEI ${scanned} is not on file. Type the product name or SKU, then Receive — I will ask you to confirm before stock is added.`
            : `No product matches “${scanned}”. Type the product name or SKU (for example iPhone 17 Pro 256) and Receive again.`,
        );
        return;
      }
      if (found.length === 1) {
        await receiveMatch(scanned, found[0]);
        return;
      }
      setPendingCode(scanned);
      setMatches(found);
      onError("");
      onNotice(`Confirm which of ${found.length} matches to receive. Stock updates only after you tap one.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "That scan could not be looked up.");
    }
  }

  handleScanRef.current = handleScan;

  function onScanKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    void handleScan(code, "typed");
  }

  return (
    <section id="scan-arrivals" className="inventory-scan-panel border border-[#e5e5e5] bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#111111] text-white"><ScanLine className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a]">Scan arrivals</h3>
            <p className="mt-1 text-xs text-[#7e897f]">Scan or type the SKU, IMEI or product name, then Receive. If more than one product matches, confirm which one — on-hand stock updates as soon as it is received.</p>
          </div>
        </div>
        <button type="button" onClick={() => { onError(""); setCameraOn((current) => !current); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#c4c4c4] px-3 text-xs font-semibold text-[#2d2d2d] hover:bg-white">
          {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {cameraOn ? "Stop camera" : "Use camera"}
        </button>
      </div>

      {cameraOn ? (
        <div className="mb-4 overflow-hidden rounded-xl bg-[#111111]">
          <video ref={videoRef} className="inventory-scan-video" muted playsInline autoPlay />
          {!cameraReady ? <p className="px-3 py-2 text-xs text-white/80">Opening camera…</p> : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto]">
        <label className="text-xs font-medium text-[#526057]">
          Barcode / SKU / IMEI / name
          <input
            ref={inputRef}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={onScanKey}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Click here, then scan or type"
            className="mt-1.5 w-full rounded-lg border border-[#c4c4c4] px-3 py-2.5 font-mono text-sm text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#e5e5e5]"
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
              void handleScan(code, "typed");
            }}
            className="min-h-10 w-full rounded-lg bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Receiving…" : canReceive ? "Receive" : "View only"}
          </button>
        </div>
      </div>

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
