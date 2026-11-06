"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, RotateCcw } from "lucide-react";

const MAX_SHOTS = 4;

type Shot = { id: string; blob: Blob; url: string };

function waitForFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => done());
      return;
    }
    requestAnimationFrame(() => done());
  });
}

/** A blank or single-colour frame is the camera not having painted yet, not a photo of a device. */
function frameHasDetail(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 32 || canvas.height < 32) return false;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let min = 255;
  let max = 0;
  for (let index = 0; index < pixels.length; index += 64 * 4) {
    const light = pixels[index] * 0.3 + pixels[index + 1] * 0.59 + pixels[index + 2] * 0.11;
    if (light < min) min = light;
    if (light > max) max = light;
  }
  return max - min > 18;
}

async function toJpeg(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return null;
  await waitForFrame(video);
  const scale = Math.min(1, 1800 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  if (!frameHasDetail(canvas)) {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await waitForFrame(video);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!frameHasDetail(canvas)) return null;
  }
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

const NEXT_PHOTO = ["2nd", "3rd", "4th"];

/**
 * The first photo is read straight away. A 2nd, 3rd and 4th photo can be taken afterwards
 * and are read only into the sections that are still blank. Any photo can be retaken.
 */
export function DeviceCamera({
  onCode,
  onRead,
  onShots,
  askFor = "",
  fillBlanks = false,
}: {
  onCode?: (text: string) => void;
  onRead?: (text: string, mode: "replace" | "fill") => void;
  onShots?: (photos: Blob[]) => void;
  askFor?: string;
  /** A device is already open, so the next photo fills blanks even if this camera was just shown. */
  fillBlanks?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shotsRef = useRef<Shot[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [reading, setReading] = useState(false);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");

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

  async function readShot(blob: Blob, mode: "replace" | "fill") {
    setReading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("photo", blob, "device.jpg");
      const response = await fetch("/api/devices/read-photo", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "That photo could not be read.");
      const text = String(data.scanText || "");
      if (!text) throw new Error("The photo was received, but no device details were in it. Retake it with the text filling the frame.");
      if (data.fields?.category) setKind(String(data.fields.category));
      onRead?.(text, mode);
      onCode?.(text);
      setOpen(false);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "That photo could not be read.");
    } finally {
      setReading(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !ready || reading || (retakeIndex === null && shots.length >= MAX_SHOTS)) return;
    const blob = await toJpeg(video);
    if (!blob) {
      setError("The camera did not capture a frame. Take the photo again.");
      return;
    }
    const shot = { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
    const replacing = retakeIndex;
    const next = replacing === null ? [...shots, shot] : shots.map((current, index) => {
      if (index !== replacing) return current;
      URL.revokeObjectURL(current.url);
      return shot;
    });
    const mode: "replace" | "fill" = replacing === null
      ? (shots.length === 0 && !fillBlanks ? "replace" : "fill")
      : (replacing === 0 && shots.length === 1 && !fillBlanks ? "replace" : "fill");
    setShots(next);
    setRetakeIndex(null);
    setError("");
    onShots?.(next.map((item) => item.blob));
    await readShot(blob, mode);
  }

  const nextLabel = NEXT_PHOTO[shots.length] ?? "";
  const prompt = retakeIndex !== null
    ? `Retake photo ${retakeIndex + 1}.`
    : shots.length === 0
      ? "Photograph the iPhone, iPad, Mac, or the accessory."
      : `This ${nextLabel} photo fills ${askFor || "whatever is still blank"}.`;

  const shotsRow = shots.length ? (
    <div className="flex flex-wrap items-end gap-2">
      {shots.map((shot, index) => (
        <span key={shot.id} className="flex flex-col items-center gap-1">
          <img src={shot.url} alt={`Photo ${index + 1}`} className="h-16 w-12 rounded-md object-cover" />
          <button type="button" disabled={reading} onClick={() => { setRetakeIndex(index); setOpen(true); }} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#111111] underline disabled:opacity-50">
            <RotateCcw className="h-3 w-3" />Retake
          </button>
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div className="space-y-2">
      {open ? (
        <div className="space-y-2">
          <div className="device-camera-portrait relative rounded-2xl">
            <video ref={videoRef} playsInline muted autoPlay className={ready ? "" : "opacity-0"} />
            {!ready ? <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-white">Asking to use the camera…</p> : null}
          </div>
          <p className="text-xs font-medium text-[#111111]">{prompt}</p>
          {shotsRow}
          <button type="button" disabled={!ready || reading || (retakeIndex === null && shots.length >= MAX_SHOTS)} onClick={() => void capture()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50">
            {reading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {reading ? "Reading…" : retakeIndex === null ? (shots.length === 0 ? "Take photo" : `Take ${nextLabel} photo`) : "Retake"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {!shots.length ? (
            <button type="button" onClick={() => { setRetakeIndex(null); setOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white">
              <Camera className="h-4 w-4" />Open camera
            </button>
          ) : null}
          {shotsRow}
          {shots.length && shots.length < MAX_SHOTS ? (
            <button type="button" disabled={reading} onClick={() => { setRetakeIndex(null); setOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white disabled:opacity-50">
              <Camera className="h-4 w-4" />Take {nextLabel} photo{askFor ? ` for ${askFor}` : ""}
            </button>
          ) : null}
        </div>
      )}
      {reading && !open ? <span className="inline-flex items-center gap-1.5 text-xs text-[#526057]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Reading this photo…</span> : null}
      {kind ? <p className="text-xs font-medium text-[#111111]">Recognised as {kind}.</p> : null}
      {error ? <p role="alert" className="text-xs text-[#9b4a3d]">{error}</p> : null}
      {!open && !shots.length ? <p className="text-[11px] leading-5 text-[#6b6b6b]">The first photo is read straight away. It can be an iPhone, iPad, Mac or an accessory, and the reader fills that item’s details. Take a 2nd, 3rd or 4th photo for anything still blank. Retake any photo.</p> : null}
    </div>
  );
}
