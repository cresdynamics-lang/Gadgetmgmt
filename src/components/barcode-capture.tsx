"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode, Upload } from "lucide-react";

import { detectDeviceCode, type DetectedCode } from "@/lib/barcode-scanner";

type Barcode = { value: string; format: number };
type BufferedCapture = { file: File; previewUrl: string; barcode?: Barcode };
const MAX_CAPTURES = 10;

export function BarcodeCapture({ onDetected, variant = "buffer" }: { onDetected?: (code: DetectedCode) => void; variant?: "buffer" | "field" }) {
  const field = variant === "field";
  const onDetectedRef = useRef(onDetected);
  const fieldRef = useRef(field);
  const lastDetectedRef = useRef("");
  useEffect(() => {
    onDetectedRef.current = onDetected;
    fieldRef.current = field;
  }, [onDetected, field]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [scanStatus, setScanStatus] = useState("Preparing automatic scanning…");
  const [dragging, setDragging] = useState(false);
  const [captures, setCaptures] = useState<BufferedCapture[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep the original binary files ready for a future multipart upload:
  // bufferRef.current.forEach(({ file }) => formData.append("images", file));
  const bufferRef = useRef<BufferedCapture[]>([]);
  const capturePending = useRef(false);
  const generation = useRef(0);
  const cameraSession = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    const video = videoRef.current;
    let previewTimeout: ReturnType<typeof setTimeout> | undefined;
    const markReady = () => {
      if (cancelled || !video?.videoWidth || video.readyState < 2) return;
      clearTimeout(previewTimeout);
      setReady(true);
      setError("");
    };
    video?.addEventListener("playing", markReady);
    video?.addEventListener("loadeddata", markReady);
    async function startCamera() {
      let stage = "Camera access";
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("navigator.mediaDevices.getUserMedia is unavailable in this browser.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || !video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        // Set the DOM properties before attaching the stream for mobile Safari.
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        stage = "Video playback";
        previewTimeout = setTimeout(() => {
          if (cancelled) return;
          setReady(false);
          setError("The camera has not provided a preview. Try another camera, retry, or take/upload a photo below.");
        }, 12000);
        const track = stream.getVideoTracks()[0];
        track?.addEventListener("ended", () => {
          if (cancelled) return;
          setReady(false);
          setError("Camera access stopped. Retry the camera or take/upload a photo below.");
        });
        // Device labels become available after permission has been granted.
        void Promise.resolve().then(() => navigator.mediaDevices.enumerateDevices()).then((available) => {
          if (!cancelled) setDevices(available.filter((device) => device.kind === "videoinput"));
        }).catch(() => { /* The default camera still works if device listing is unavailable. */ });
        await video.play();
        markReady();
      } catch (cause) {
        if (cancelled) return;
        clearTimeout(previewTimeout);
        setReady(false);
        const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
        console.error(`[Barcode camera] ${stage} failed`, cause);
        if (stage === "Video playback") {
          // Keep the granted stream alive so an explicit user gesture can start it.
          setError(`${stage} failed — ${detail}. Press Start preview below.`);
        } else {
          stream?.getTracks().forEach((track) => track.stop());
          setError(`${stage} failed — ${detail}`);
        }
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      clearTimeout(previewTimeout);
      video?.removeEventListener("playing", markReady);
      video?.removeEventListener("loadeddata", markReady);
      cameraSession.current += 1;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [open, deviceId, attempt]);

  useEffect(() => () => {
    generation.current += 1;
    bufferRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
  }, []);

  const captureImage = useCallback(async (frame?: HTMLCanvasElement, barcode?: Barcode) => {
    const video = videoRef.current;
    if (!video || !ready || capturePending.current || bufferRef.current.length >= MAX_CAPTURES) return;
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      setError("Wait for the camera preview before capturing.");
      return;
    }
    capturePending.current = true;
    setCapturing(true);
    setError("");
    const currentGeneration = generation.current;
    const currentSession = cameraSession.current;
    try {
      const canvas = frame ?? document.createElement("canvas");
      if (!frame) {
        const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Image capture is unavailable in this browser.");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((image) => image ? resolve(image) : reject(new Error("Could not capture the image. Try again.")), "image/jpeg", 0.9);
      });
      if (generation.current !== currentGeneration || cameraSession.current !== currentSession) return;
      const file = new File([blob], `barcode-${crypto.randomUUID()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      bufferRef.current = [...bufferRef.current, { file, previewUrl: URL.createObjectURL(file), barcode }];
      setCaptures(bufferRef.current);
      return true;
    } catch (cause) {
      if (generation.current === currentGeneration && cameraSession.current === currentSession) {
        setError(cause instanceof Error ? cause.message : "Could not capture the image.");
      }
    } finally {
      capturePending.current = false;
      if (generation.current === currentGeneration) setCapturing(false);
    }
  }, [ready]);

  useEffect(() => {
    if (!open || !ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const session = cameraSession.current;
    async function startScanning() {
      try {
        const { createBarcodeDecoder, scanRegion, squareScanRegion } = await import("@/lib/barcode-scanner");
        if (cancelled) return;
        const decode = createBarcodeDecoder();
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Automatic scanning is unavailable. Use Capture image instead.");
        setScanStatus("Scanning automatically. Hold a barcode or QR code inside the guide.");
        async function scan() {
          if (cancelled || cameraSession.current !== session) return;
          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && !video.paused && !document.hidden && !capturePending.current && bufferRef.current.length < MAX_CAPTURES) {
              const regions = [
                squareScanRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight),
                scanRegion(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight),
              ].filter((region): region is { x: number; y: number; width: number; height: number } => Boolean(region));
              let detectedCode: DetectedCode | null = null;
              let barcode: { value: string; format: number } | null = null;
              for (const region of regions) {
                const scale = Math.min(1, 1280 / region.width);
                canvas.width = Math.max(1, Math.round(region.width * scale));
                canvas.height = Math.max(1, Math.round(region.height * scale));
                context!.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
                const candidate = decode(context!.getImageData(0, 0, canvas.width, canvas.height));
                if (!candidate) continue;
                const detected = detectDeviceCode(candidate.value);
                barcode = candidate;
                detectedCode = detected;
                if (detected.imei || detected.serialNumber) break;
              }
              if (barcode && detectedCode && barcode.value !== lastDetectedRef.current) {
                lastDetectedRef.current = barcode.value;
                if (onDetectedRef.current) {
                  onDetectedRef.current(detectedCode);
                  if (detectedCode.imei || detectedCode.serialNumber || detectedCode.productCode) {
                    setOpen(false);
                    setScanStatus(detectedCode.serialNumber ? "Serial number read." : detectedCode.imei ? "IMEI read." : "Code read.");
                    return;
                  }
                }
                if (!fieldRef.current && !bufferRef.current.some((capture) => capture.barcode?.value === barcode.value && capture.barcode.format === barcode.format)) {
                  await captureImage(canvas, barcode);
                }
              }
            }
          } catch (cause) {
            if (!cancelled) setScanStatus(cause instanceof Error ? `Automatic scanning stopped: ${cause.message}. You can still capture manually.` : "Automatic scanning stopped. You can still capture manually.");
            return;
          }
          if (!cancelled) timer = setTimeout(() => void scan(), 300);
        }
        void scan();
      } catch (cause) {
        if (!cancelled) setScanStatus(cause instanceof Error ? `Automatic scanning unavailable: ${cause.message}. Use Capture image instead.` : "Automatic scanning unavailable. Use Capture image instead.");
      }
    }
    void startScanning();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, ready, deviceId, attempt, captureImage]);

  function addPhotos(files: FileList | null) {
    if (!files || capturePending.current) return;
    const available = MAX_CAPTURES - bufferRef.current.length;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!images.length) {
      setError("Choose an image file.");
      return;
    }
    // Preserve original files, including mobile image formats, for backend processing.
    const additions = images.slice(0, available).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    bufferRef.current = [...bufferRef.current, ...additions];
    setCaptures(bufferRef.current);
    setError(images.length > available ? `The buffer holds up to ${MAX_CAPTURES} images. Extra images were not added.` : "");
  }

  function removeCapture(target?: BufferedCapture) {
    generation.current += 1;
    bufferRef.current.filter((capture) => !target || capture === target).forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    bufferRef.current = target ? bufferRef.current.filter((capture) => capture !== target) : [];
    setCaptures(bufferRef.current);
    setCapturing(false);
  }

  return (
    <section aria-label="Barcode image capture" className="mb-5 space-y-3 rounded-xl border border-[#e6e6e2] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="text-sm font-semibold">{field ? "Scan a code" : "Barcode camera"}</h4><p className="mt-1 text-xs text-[#111111]">{field ? "Point at a barcode or QR code. The serial number or IMEI is filled in." : "Capture a barcode or QR code. A serial number is read automatically."}</p></div>
        <button type="button" onClick={() => { setReady(false); setError(""); lastDetectedRef.current = ""; setOpen(!open); }} className="inline-flex items-center gap-2 rounded-lg bg-[#0a0a0a] px-3.5 py-2.5 text-sm font-semibold text-white"><ScanBarcode className="h-4 w-4" />{open ? "Close camera" : "Scan code"}</button>
      </div>
      {open ? <div className="space-y-3">
        {devices.length > 1 ? <label className="block text-xs font-medium">Camera
          <select value={deviceId} onChange={(event) => { setReady(false); setError(""); setDeviceId(event.target.value); }} className="ml-2 rounded border border-[#e6e6e2] bg-white p-2">
            <option value="">Automatic (prefer rear camera)</option>
            {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label> : null}
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live barcode camera preview" className="block h-64 w-full object-cover sm:h-80" />
          {ready ? <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div style={{ width: "72%", aspectRatio: "1" }} className={`relative max-h-[86%] rounded-lg border-2 ${capturing ? "border-emerald-300" : "border-white/90"} shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]`}>
              <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-red-400 shadow-[0_0_10px_rgb(179 38 30 / 0.9)]" />
            </div>
          </div> : null}
          {!ready ? <p role="status" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">{error || "Starting camera… Allow camera access when prompted."}</p> : null}
        </div>
        {!ready ? <button type="button" onClick={async () => {
          const video = videoRef.current;
          if (!video?.srcObject) {
            setError("No camera stream is attached. Retry camera to request access again.");
            return;
          }
          try {
            await video.play();
            if (video.videoWidth && video.readyState >= 2) { setReady(true); setError(""); }
          } catch (cause) {
            const detail = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
            setError(`Video playback failed — ${detail}`);
          }
        }} className="mr-4 text-xs font-semibold text-[#111111]">Start preview</button> : null}
        <button type="button" onClick={() => { setReady(false); setError(""); setAttempt((current) => current + 1); }} className="text-xs font-semibold text-[#111111]">Retry camera</button>
        <p role="status" className="text-xs text-[#111111]">{captures.length >= MAX_CAPTURES && !field ? "Buffer full. Remove images to continue scanning." : ready ? scanStatus : "Center a barcode or QR code in the square. A serial number is filled in automatically."}</p>
        {field ? null : <button type="button" onClick={() => void captureImage()} disabled={!ready || capturing || captures.length >= MAX_CAPTURES} className="inline-flex items-center gap-2 rounded-lg border border-[#e6e6e2] px-3.5 py-2 text-sm font-semibold disabled:opacity-40"><Camera className="h-4 w-4" />{capturing ? "Capturing…" : "Capture image"}</button>}
      </div> : null}
      {field ? null : <label
        onDragOver={(event) => { event.preventDefault(); if (!capturing && captures.length < MAX_CAPTURES) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!capturing) addPhotos(event.dataTransfer.files); }}
        className={`relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition focus-within:ring-2 focus-within:ring-[#6b6b66] ${capturing || captures.length >= MAX_CAPTURES ? "cursor-not-allowed border-[#e6e6e2] bg-[#f4f4f2] opacity-50" : dragging ? "cursor-pointer border-[#0a7d56] bg-[#e6e6e2]" : "cursor-pointer border-[#e6e6e2] bg-[#f4f4f2] hover:border-[#0a7d56] hover:bg-[#f4f4f2]"}`}
      >
        <Upload aria-hidden="true" className="h-6 w-6 text-[#111111]" />
        <span className="text-sm font-semibold text-[#111111]">Drop files here</span>
        <span className="text-xs text-[#111111]">or click to browse · Images only · Up to {MAX_CAPTURES} images</span>
        <input type="file" accept="image/*" multiple aria-label="Choose barcode images" disabled={captures.length >= MAX_CAPTURES || capturing} onChange={(event) => { addPhotos(event.target.files); event.target.value = ""; }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      </label>}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {field ? null : <p role="status" className="text-xs text-[#111111]">{captures.length}/{MAX_CAPTURES} images buffered · {(captures.reduce((bytes, capture) => bytes + capture.file.size, 0) / 1024 / 1024).toFixed(1)} MB. Images stay in memory until removed or this form is closed.</p>}
      {!field && captures.length ? <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {captures.map((capture, index) => <div key={capture.previewUrl} className="space-y-2 rounded-lg border border-[#e6e6e2] p-2">
            {/* Object URLs refer to local, temporary camera captures. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capture.previewUrl} alt={`Buffered barcode capture ${index + 1}`} className="h-24 w-full rounded object-contain" />
            {capture.barcode ? <p className="break-all font-mono text-xs text-[#111111]">{capture.barcode.value}</p> : null}
            <button type="button" onClick={() => removeCapture(capture)} aria-label={`Remove barcode capture ${index + 1}`} className="text-xs font-medium text-red-700">Remove image</button>
          </div>)}
        </div>
        <button type="button" onClick={() => removeCapture()} className="text-xs font-semibold text-[#111111]">Clear buffer</button>
      </> : null}
    </section>
  );
}
