"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, Plus, RotateCcw } from "lucide-react";

const MAX_SHOTS = 4;

type Shot = { id: string; blob: Blob; url: string };

async function toJpeg(source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

/**
 * Open the camera, take one photo, and read it straight away.
 * + opens the camera again for whatever is still blank. Retake replaces a photo and fills only those blanks.
 */
export function DeviceCamera({
  onCode,
  onRead,
  onShots,
  askFor = "",
}: {
  onCode?: (text: string) => void;
  onRead?: (text: string, mode: "replace" | "fill") => void;
  onShots?: (photos: Blob[]) => void;
  askFor?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(false);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { shotsRef.current = shots; }, [shots]);
  useEffect(() => () => { shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url)); }, []);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot open the camera.");
      setOpen(false);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    setReady(false);
    setError("");
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1080 }, height: { ideal: 1440 }, aspectRatio: { ideal: 0.75 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch {
        if (!cancelled) {
          setError("Allow camera access, then open the camera again.");
          setOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
      setReady(false);
    };
  }, [open]);

  async function readOne(blob: Blob, mode: "replace" | "fill", next: Shot[]) {
    setReading(true);
    setError("");
    onShots?.(next.map((shot) => shot.blob));
    try {
      const body = new FormData();
      body.append("photo", blob, "device.jpg");
      const response = await fetch("/api/devices/read-photo", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That photo could not be read.");
      const text = String(data.scanText || "");
      if (!text) throw new Error("Nothing readable was in that photo. Retake it straight on.");
      onRead?.(text, mode);
      onCode?.(text);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "That photo could not be read.");
    } finally {
      setReading(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !ready || reading || (retakeIndex === null && shots.length >= MAX_SHOTS)) return;
    const blob = await toJpeg(video, video.videoWidth, video.videoHeight);
    if (!blob) return;
    const shot = { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
    const replacing = retakeIndex;
    const next = replacing === null ? [...shots, shot] : shots.map((current, index) => {
      if (index !== replacing) return current;
      URL.revokeObjectURL(current.url);
      return shot;
    });
    const mode: "replace" | "fill" = shots.length === 0 && replacing === null ? "replace" : "fill";
    setShots(next);
    setRetakeIndex(null);
    setOpen(false);
    void readOne(blob, mode, next);
  }

  const prompt = shots.length === 0 && retakeIndex === null
    ? "Photograph About, the top of the page"
    : askFor
      ? `Photograph ${askFor}. This fills only what is still blank.`
      : "Photograph the next detail that is still blank";

  return (
    <div className="space-y-2">
      {open ? (
        <div className="space-y-2">
          <div className="device-camera-portrait relative rounded-2xl">
            <video ref={videoRef} playsInline muted autoPlay className={ready ? "" : "opacity-0"} />
            {!ready ? <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-white">Asking to use the camera…</p> : null}
          </div>
          <p className="text-xs font-medium text-[#111111]">{prompt}</p>
          <button type="button" disabled={!ready || reading} onClick={() => void capture()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50">
            <Camera className="h-4 w-4" />Take photo
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!shots.length ? (
            <button type="button" onClick={() => { setRetakeIndex(null); setOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white">
              <Camera className="h-4 w-4" />Open camera
            </button>
          ) : null}
          {shots.map((shot, index) => (
            <span key={shot.id} className="flex flex-col items-center gap-1">
              <img src={shot.url} alt="" className="h-16 w-12 rounded-md object-cover" />
              <button type="button" disabled={reading} onClick={() => { setRetakeIndex(index); setOpen(true); }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#111111] underline disabled:opacity-50">
                <RotateCcw className="h-3 w-3" />Retake
              </button>
            </span>
          ))}
          {shots.length > 0 && shots.length < MAX_SHOTS && askFor ? (
            <button type="button" disabled={reading} aria-label={`Add a photo of ${askFor}`} onClick={() => { setRetakeIndex(null); setOpen(true); }} className="grid h-16 w-12 place-items-center rounded-md border border-dashed border-[#111111] text-[#111111] disabled:opacity-50">
              <Plus className="h-5 w-5" />
            </button>
          ) : null}
          {reading ? <span className="inline-flex items-center gap-1.5 text-xs text-[#526057]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Reading this photo…</span> : null}
        </div>
      )}
      {error ? <p role="alert" className="text-xs text-[#9b4a3d]">{error}</p> : null}
      {!open && !shots.length ? <p className="text-[11px] leading-5 text-[#6b6b6b]">Opens the camera. The first photo is read immediately. + takes the next photo for whatever is still missing, such as colour or battery health.</p> : null}
    </div>
  );
}
