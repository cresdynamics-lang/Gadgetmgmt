"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle, ScanText } from "lucide-react";

import type { DevicePhotoFields } from "@/lib/device-photo";

type BarcodeDetectorLike = { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> };

const FORMATS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"];
const FIELD_LABELS: Record<keyof DevicePhotoFields, string> = {
  modelName: "model", modelNumber: "model number", partNumber: "part number", serial: "serial", imei: "IMEI",
  capacity: "storage", colour: "colour", version: "iOS version", batteryHealth: "battery health", simLock: "SIM", findMy: "Find My",
};
/** Fields worth prompting for when the photo does not show them. */
const NEEDED: (keyof DevicePhotoFields)[] = ["modelName", "imei", "serial", "capacity", "batteryHealth"];

function detectorCtor() {
  return (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
}

/** Draw an image (or the live video frame) at most 1600 px on the long side, as JPEG, so uploads stay small. */
async function toJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

async function fileToJpeg(file: File) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return blob ?? file;
}

async function readPhoto(image: Blob) {
  const body = new FormData();
  body.append("photo", image instanceof File ? image : new File([image], "device.jpg", { type: "image/jpeg" }));
  const response = await fetch("/api/devices/read-photo", { method: "POST", body });
  const result = await response.json().catch(() => ({ error: "The photo could not be read." }));
  if (!response.ok) throw new Error(result.error ?? "The photo could not be read.");
  return result as { fields: DevicePhotoFields; scanText: string };
}

/**
 * One camera for everything: it reads barcodes and QR codes by itself, and for a phone with no code
 * (most trade-ins) "Read screen" photographs Settings → General → About and fills in the details.
 * Where the live camera is not available, the same button takes a photo instead.
 */
export function DeviceCamera({ onCode, compact = false }: { onCode: (text: string) => void; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const onCodeRef = useRef(onCode);
  const lastRef = useRef({ code: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [canDetect, setCanDetect] = useState(true);
  const [reading, setReading] = useState(false);
  const [summary, setSummary] = useState<{ found: string[]; missing: string[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { onCodeRef.current = onCode; });

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setReady(true);
        const Detector = detectorCtor();
        setCanDetect(Boolean(Detector));
        if (!Detector) return;
        let detector: BarcodeDetectorLike;
        try {
          detector = new Detector({ formats: FORMATS });
        } catch {
          detector = new Detector();
        }
        timer = window.setInterval(() => {
          void detector.detect(video).then((found) => {
            const value = found[0]?.rawValue?.trim();
            if (!value) return;
            const now = Date.now();
            if (lastRef.current.code === value && now - lastRef.current.at < 2500) return;
            lastRef.current = { code: value, at: now };
            setOpen(false);
            onCodeRef.current(value);
          }).catch(() => undefined);
        }, 250);
      } catch {
        if (cancelled) return;
        setOpen(false);
        setError("The live camera is blocked here. Allow camera access, or use Take a photo.");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setReady(false);
    };
  }, [open]);

  async function read(image: Blob | null) {
    if (!image) return;
    setReading(true);
    setError("");
    setSummary(null);
    try {
      const result = await readPhoto(image);
      setSummary({
        found: (Object.keys(FIELD_LABELS) as (keyof DevicePhotoFields)[]).filter((key) => result.fields[key]).map((key) => FIELD_LABELS[key]),
        missing: NEEDED.filter((key) => !result.fields[key]).map((key) => FIELD_LABELS[key]),
      });
      setOpen(false);
      onCodeRef.current(result.scanText);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The photo could not be read.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function readScreen() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    await read(await toJpeg(video, video.videoWidth, video.videoHeight));
  }

  return <div className="space-y-2">
    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void fileToJpeg(file).then(read); }}/>
    <button
      type="button"
      disabled={reading}
      onClick={() => {
        setError("");
        setSummary(null);
        // Without a live camera (older browsers, or a phone on a plain-http address) the button takes a photo.
        if (!open && !navigator.mediaDevices?.getUserMedia) fileRef.current?.click();
        else setOpen((current) => !current);
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition disabled:opacity-60 ${open ? "border-[#111111] bg-[#111111] text-white" : "border-[#c4c4c4] bg-white text-[#2d2d2d] hover:border-[#111111]"} ${compact ? "min-h-10 px-3 text-xs" : "min-h-11 w-full px-3 text-sm"}`}
    >
      {reading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : open ? <CameraOff className="h-4 w-4"/> : <Camera className="h-4 w-4"/>}
      {reading ? "Reading…" : open ? "Close camera" : "Camera"}
    </button>
    {open ? <div className="overflow-hidden rounded-xl bg-[#111111]">
      <div className="relative">
        <video ref={videoRef} className="inventory-scan-video" muted playsInline autoPlay/>
        {ready && canDetect ? <span aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 -translate-y-1/2 rounded bg-[#eb6834]/80 shadow-[0_0_12px_#eb6834]"/> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-white/80">{!ready ? "Opening camera…" : canDetect ? "Point at a barcode or QR: it reads by itself. No code? Show Settings → General → About and tap Read screen." : "Show the About screen, box or sticker, then tap Read screen."}</p>
        <button type="button" disabled={!ready || reading} onClick={() => void readScreen()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-semibold text-[#111111] disabled:opacity-50">
          {reading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <ScanText className="h-3.5 w-3.5"/>}
          {reading ? "Reading…" : "Read screen"}
        </button>
      </div>
    </div> : null}
    {summary ? <p className="text-[11px] leading-4 text-[#2f7d4f]">Read: {summary.found.join(", ") || "nothing clear"}.{summary.missing.length ? <span className="text-[#8a4b2f]"> Enter by hand: {summary.missing.join(", ")}.</span> : null}</p> : null}
    {error ? <p role="alert" className="text-[11px] leading-4 text-[#a15d3d]">{error} <button type="button" onClick={() => fileRef.current?.click()} className="font-semibold underline">Take a photo</button></p> : null}
  </div>;
}
