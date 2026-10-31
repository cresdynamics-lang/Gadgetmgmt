"use client";

import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { Camera, CameraOff, Check, ChevronLeft, ChevronRight, Printer, Repeat2, X } from "lucide-react";

import { parseDeviceScan } from "@/lib/device-scan";
import { BatteryHealthField, PhoneLabelPreview } from "@/components/phone-label-preview";
import { PHONE_LABEL, printPhoneLabel, type PhoneLabelData } from "@/lib/phone-label";

import {
  assessTradeIn,
  ownershipProofFrom,
  tradeInBatteryDevices,
  tradeInBrandLabel,
  tradeInBrands,
  tradeInChecks,
  tradeInDeclaration,
  tradeInDevices,
  tradeInGrades,
  tradeInStorageDevices,
  tradeInStorageSizes,
  type TradeInBrand,
  type TradeInCheckId,
  type TradeInGrade,
} from "@/lib/trade-in";

export type TradeInForm = {
  active: boolean;
  brand: TradeInBrand | "";
  deviceType: string;
  model: string;
  serial: string;
  storage: string;
  grade: TradeInGrade | "";
  batteryHealth: string;
  hasCharger: boolean;
  receiptSeen: boolean;
  boxSeen: boolean;
  receiptReference: string;
  checks: Partial<Record<TradeInCheckId, boolean>>;
  colour: string;
  deviceSerial: string;
  mpn: string;
  modelNumber: string;
  fmi: string;
  sim: string;
  version: string;
  sellerName: string;
  sellerPhone: string;
  value: string;
  resalePrice: string;
  staffConfirmed: boolean;
};

export const blankTradeInForm: TradeInForm = {
  active: false, brand: "", deviceType: "", model: "", serial: "", storage: "", grade: "", batteryHealth: "", hasCharger: false,
  colour: "", deviceSerial: "", mpn: "", modelNumber: "", fmi: "", sim: "", version: "",
  receiptSeen: false, boxSeen: false, receiptReference: "", checks: {}, sellerName: "", sellerPhone: "", value: "", resalePrice: "", staffConfirmed: false,
};

export function tradeInValue(form: TradeInForm, subtotal: number) {
  return form.active ? Math.min(subtotal, Math.max(0, Math.trunc(Number(form.value) || 0))) : 0;
}

export function assessTradeInForm(form: TradeInForm, subtotal: number) {
  return assessTradeIn({
    deviceType: form.deviceType,
    model: form.model,
    serial: form.serial,
    storage: form.storage,
    grade: form.grade,
    batteryHealth: form.batteryHealth ? Number(form.batteryHealth) : null,
    ownershipProof: ownershipProofFrom(form.receiptSeen, form.boxSeen),
    checks: form.checks,
    sellerName: form.sellerName,
    sellerPhone: form.sellerPhone,
    value: tradeInValue(form, subtotal),
    resalePrice: Number(form.resalePrice) || 0,
    staffConfirmed: form.staffConfirmed,
  });
}

/** The trade-in part of the checkout request. */
export function tradeInPayload(form: TradeInForm, subtotal: number) {
  return {
    brand: form.brand,
    deviceType: form.deviceType,
    model: form.model.trim(),
    imei: form.serial,
    ...(tradeInStorageDevices.includes(form.deviceType) && form.storage ? { storage: form.storage } : {}),
    ...(form.colour ? { color: form.colour } : {}),
    grade: form.grade,
    ...(tradeInBatteryDevices.includes(form.deviceType) ? { batteryHealth: Math.trunc(Number(form.batteryHealth)) } : {}),
    ownershipProof: ownershipProofFrom(form.receiptSeen, form.boxSeen),
    ...(form.receiptReference.trim() ? { receiptReference: form.receiptReference.trim() } : {}),
    hasBox: form.boxSeen,
    hasCharger: form.hasCharger,
    checks: form.checks,
    sellerName: form.sellerName.trim(),
    sellerPhone: form.sellerPhone.trim(),
    value: tradeInValue(form, subtotal),
    resalePrice: Math.trunc(Number(form.resalePrice)),
    staffConfirmed: form.staffConfirmed,
  };
}

export function tradeInLabelData(form: TradeInForm): PhoneLabelData {
  return {
    imei: form.serial,
    serial: form.deviceSerial,
    mpn: form.mpn,
    modelNumber: form.modelNumber,
    storage: form.storage,
    colour: form.colour,
    batteryHealth: form.batteryHealth,
    fmi: form.fmi,
    sim: form.sim,
    version: form.version,
    name: [form.model, form.storage].filter(Boolean).join(" "),
    category: form.deviceType || "iPhone",
    group: form.model,
  };
}

export function applyDeviceScanToTradeIn(raw: string, current: TradeInForm): Partial<TradeInForm> {
  const device = parseDeviceScan(raw);
  const group = (device.group || device.name).replace(/\s+\d+\s*(GB|TB).*/i, "").trim();
  const appleModels = current.brand === "SAMSUNG"
    ? tradeInDevices.SAMSUNG[current.deviceType || "Phone"]?.models ?? []
    : tradeInDevices.APPLE.iPhone.models;
  const listed = appleModels.find((model) => model.toLowerCase() === group.toLowerCase());
  const storage = tradeInStorageSizes.find((size) => size === device.storage) || current.storage;
  return {
    brand: current.brand || (device.category && device.category !== "iPhone" ? current.brand : "APPLE"),
    deviceType: current.deviceType || (device.category === "iPhone" ? "iPhone" : current.deviceType),
    model: listed || group || current.model,
    serial: device.imei || device.serial || current.serial,
    storage,
    batteryHealth: device.batteryHealth || current.batteryHealth,
    colour: device.colour || current.colour,
    deviceSerial: device.serial || current.deviceSerial,
    mpn: device.mpn || current.mpn,
    modelNumber: device.modelNumber || current.modelNumber,
    fmi: device.fmi || current.fmi,
    sim: device.sim || current.sim,
    version: device.version || current.version,
  };
}

const steps = ["Owner", "Device", "Condition", "Checks & price"] as const;
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

function stepDone(form: TradeInForm, step: number, subtotal: number) {
  if (step === 0) return form.sellerName.trim().length >= 2 && form.sellerPhone.replace(/\D/g, "").length >= 9;
  if (step === 1) return Boolean(form.brand && form.deviceType && form.model.trim().length >= 2 && /^[A-Z0-9]{8,20}$/.test(form.serial) && (!tradeInStorageDevices.includes(form.deviceType) || form.storage));
  if (step === 2) {
    const battery = Number(form.batteryHealth);
    return Boolean(form.grade && form.grade !== "FAULTY" && (!tradeInBatteryDevices.includes(form.deviceType) || (battery >= 1 && battery <= 100)));
  }
  const value = tradeInValue(form, subtotal);
  return (form.receiptSeen || form.boxSeen) && tradeInChecks.every((check) => form.checks[check.id]) && value > 0 && value < subtotal && Number(form.resalePrice) > value && form.staffConfirmed;
}

/** A large tap-to-tick row. */
function TickRow({ checked, onToggle, title, detail }: { checked: boolean; onToggle: () => void; title: string; detail?: string }) {
  return <button type="button" role="checkbox" aria-checked={checked} onClick={onToggle} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[.99] ${checked ? "border-[#2f7d4f] bg-[#eef6f0]" : "border-[#e5e5e5] bg-white hover:border-[#c4c4c4]"}`}>
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 ${checked ? "border-[#2f7d4f] bg-[#2f7d4f] text-white" : "border-[#c4c4c4] bg-white"}`}>{checked ? <Check className="h-4 w-4" strokeWidth={3}/> : null}</span>
    <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#1a1a1a]">{title}</span>{detail ? <span className="mt-0.5 block text-[11px] leading-4 text-[#6b6b6b]">{detail}</span> : null}</span>
  </button>;
}

/** A large tap-to-choose button. */
function Choice({ selected, onClick, children, tone = "dark" }: { selected: boolean; onClick: () => void; children: ReactNode; tone?: "dark" | "warn" }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border px-3 py-2 text-[13px] font-semibold transition active:scale-[.98] ${selected ? tone === "warn" ? "border-[#a15d3d] bg-[#a15d3d] text-white" : "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#2d2d2d] hover:border-[#c4c4c4]"}`}>{children}</button>;
}

const fieldClass = "mt-1.5 h-12 w-full rounded-xl border border-[#d4d4d4] bg-white px-3.5 text-base text-[#111111] outline-none focus:border-[#111111] sm:text-sm";
const labelClass = "block text-[11px] font-semibold uppercase tracking-[.1em] text-[#6b6b6b]";

export function TradeInPanel({ form, onChange, subtotal, staffName, customer }: {
  form: TradeInForm;
  onChange: Dispatch<SetStateAction<TradeInForm>>;
  subtotal: number;
  staffName: string;
  customer?: { name: string; phone: string } | null;
}) {
  const [step, setStep] = useState(0);
  const [otherModel, setOtherModel] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScanRef = useRef({ code: "", at: 0 });
  // Build on the latest form so quick taps never overwrite each other.
  const update = (changes: Partial<TradeInForm>) => onChange((current) => ({ ...current, ...changes }));

  function applyScan(raw: string) {
    const scanned = raw.trim();
    if (scanned.length < 2) return;
    const now = Date.now();
    if (lastScanRef.current.code === scanned && now - lastScanRef.current.at < 1200) return;
    lastScanRef.current = { code: scanned, at: now };
    setScanCode(scanned);
    onChange((current) => {
      const next = applyDeviceScanToTradeIn(scanned, current);
      const models = next.brand && next.deviceType ? tradeInDevices[next.brand as TradeInBrand]?.[next.deviceType]?.models ?? [] : [];
      setOtherModel(Boolean(next.model && !models.includes(next.model)));
      return { ...current, ...next };
    });
  }

  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!video || !Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraOn(false);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        let detector: { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
        try {
          detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "qr_code", "data_matrix"] });
        } catch {
          detector = new Detector();
        }
        setCameraReady(true);
        timer = window.setInterval(() => {
          void detector.detect(video).then((found) => {
            const value = found[0]?.rawValue?.trim();
            if (value) applyScan(value);
          }).catch(() => undefined);
        }, 280);
      } catch {
        if (!cancelled) setCameraOn(false);
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

  function onScanKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();
    applyScan(scanCode);
  }
  const assessment = assessTradeInForm(form, subtotal);
  const value = tradeInValue(form, subtotal);
  const doneCount = tradeInChecks.filter((check) => form.checks[check.id]).length;
  const models = form.brand && form.deviceType ? tradeInDevices[form.brand][form.deviceType]?.models ?? [] : [];

  if (!form.active) {
    return <button type="button" disabled={subtotal < 1} onClick={() => { setStep(0); onChange({ ...blankTradeInForm, active: true }); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-[#c4c4c4] bg-[#fafafa] px-3.5 py-3 text-left transition hover:border-[#111111] disabled:opacity-50">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#2d2d2d] ring-1 ring-[#e5e5e5]"><Repeat2 className="h-4 w-4"/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1a1a1a]">Add a trade-in</span><span className="block text-[11px] text-[#6b6b6b]">{subtotal < 1 ? "Add an item to the sale first" : "Owner details first, then scan and print the phone label"}</span></span>
      <ChevronRight className="h-4 w-4 text-[#9a9a9a]"/>
    </button>;
  }

  return <section aria-label="Trade-in" className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa]">
    <div className="flex items-center justify-between gap-2 border-b border-[#e5e5e5] bg-white px-3.5 py-2.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]"><Repeat2 className="h-4 w-4"/>Trade-in</p>
      <button type="button" onClick={() => onChange(blankTradeInForm)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#6b6b6b] hover:bg-[#f5f5f5]"><X className="h-3.5 w-3.5"/>Remove</button>
    </div>

    <ol className="grid grid-cols-4 gap-1 px-2 pt-2.5">
      {steps.map((label, index) => {
        const done = stepDone(form, index, subtotal);
        return <li key={label}><button type="button" onClick={() => setStep(index)} aria-current={step === index ? "step" : undefined} className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold leading-3 transition ${step === index ? "bg-white text-[#111111] shadow-sm ring-1 ring-[#e5e5e5]" : "text-[#7a7a7a]"}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${done ? "bg-[#2f7d4f] text-white" : step === index ? "bg-[#111111] text-white" : "bg-[#e5e5e5] text-[#6b6b6b]"}`}>{done ? <Check className="h-3 w-3" strokeWidth={3}/> : index + 1}</span>
          <span className="text-center">{label}</span>
        </button></li>;
      })}
    </ol>

    <div className="space-y-4 p-3.5">
      {step === 0 ? <>
        {customer && customer.name ? <button type="button" onClick={() => update({ sellerName: customer.name, sellerPhone: customer.phone })} className="min-h-11 w-full rounded-xl border border-[#d4d4d4] bg-white px-3 text-[13px] font-semibold text-[#2d2d2d] hover:border-[#111111]">Owner is the customer · {customer.name}</button> : null}
        <p className="text-[11px] text-[#6b6b6b]">Take the owner’s name and phone before you scan the device. The 90 × 50 mm phone label prints after the IMEI is in.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Owner’s name (as on ID)<input value={form.sellerName} maxLength={120} autoComplete="off" onChange={(event) => update({ sellerName: event.target.value })} className={fieldClass}/></label>
          <label className={labelClass}>Owner’s phone<input type="tel" inputMode="tel" value={form.sellerPhone} maxLength={20} onChange={(event) => update({ sellerPhone: event.target.value })} placeholder="07xx xxx xxx" className={fieldClass}/></label>
        </div>
      </> : null}

      {step === 1 ? <>
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className={labelClass}>Scan Settings → About, IMEI or QR</p>
            <button type="button" onClick={() => setCameraOn((current) => !current)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d4d4d4] bg-white px-2.5 text-[11px] font-semibold text-[#2d2d2d]">
              {cameraOn ? <CameraOff className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              {cameraOn ? "Stop camera" : "Use camera"}
            </button>
          </div>
          {cameraOn ? (
            <div className="mt-1.5 overflow-hidden rounded-xl bg-[#111111]">
              <video ref={videoRef} className="inventory-scan-video" muted playsInline autoPlay />
              {!cameraReady ? <p className="px-3 py-2 text-xs text-white/80">Opening camera…</p> : null}
            </div>
          ) : null}
          <textarea
            value={scanCode}
            onChange={(event) => setScanCode(event.target.value)}
            onKeyDown={onScanKey}
            rows={2}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Click, then scan or paste About / IMEI / QR"
            className={`${fieldClass} h-auto min-h-12 py-2 font-mono tracking-wide`}
          />
          <p className="mt-1 text-[11px] text-[#6b6b6b]">USB scanner or camera fills the model, IMEI, serial, storage and battery. Print sends a 90 × 50 mm phone label to the label printer.</p>
        </div>
        <div><p className={labelClass}>Brand</p><div className="mt-1.5 grid grid-cols-2 gap-2">{tradeInBrands.map((brand) => <Choice key={brand} selected={form.brand === brand} onClick={() => { setOtherModel(false); update({ brand, deviceType: "", model: "", storage: "" }); }}>{tradeInBrandLabel(brand)}</Choice>)}</div></div>
        {form.brand ? <div><p className={labelClass}>Device</p><div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.keys(tradeInDevices[form.brand]).map((device) => <Choice key={device} selected={form.deviceType === device} onClick={() => { setOtherModel(false); update({ deviceType: device, model: "", storage: "" }); }}>{device}</Choice>)}</div></div> : null}
        {form.deviceType ? <div><p className={labelClass}>Model</p>
          <div className="mt-1.5 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-0.5">
            {models.map((model) => <Choice key={model} selected={!otherModel && form.model === model} onClick={() => { setOtherModel(false); update({ model }); }}>{model}</Choice>)}
            <Choice selected={otherModel} onClick={() => { setOtherModel(true); update({ model: "" }); }}>Other model</Choice>
          </div>
          {otherModel ? <input autoFocus value={form.model} maxLength={80} onChange={(event) => update({ model: event.target.value })} placeholder="Type the model" className={fieldClass}/> : null}
        </div> : null}
        {form.deviceType && tradeInStorageDevices.includes(form.deviceType) ? <div><p className={labelClass}>Storage</p><div className="mt-1.5 grid grid-cols-3 gap-2">{tradeInStorageSizes.map((size) => <Choice key={size} selected={form.storage === size} onClick={() => update({ storage: size })}>{size}</Choice>)}</div></div> : null}
        {form.deviceType ? <label className={labelClass}>IMEI or serial number<input value={form.serial} maxLength={20} autoCapitalize="characters" autoCorrect="off" onChange={(event) => update({ serial: event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })} placeholder={form.deviceType === "iPhone" || form.deviceType === "Phone" ? "Dial *#06# or scan About" : "Settings > General > About"} className={`${fieldClass} font-mono tracking-wider`}/></label> : null}
        {form.deviceType ? <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Colour<input value={form.colour} maxLength={40} onChange={(event) => update({ colour: event.target.value.toUpperCase() })} placeholder="MIDNIGHT" className={fieldClass}/></label>
          <label className={labelClass}>Hardware serial<input value={form.deviceSerial} maxLength={20} autoCapitalize="characters" onChange={(event) => update({ deviceSerial: event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })} placeholder="From About" className={`${fieldClass} font-mono`}/></label>
        </div> : null}
        {tradeInBatteryDevices.includes(form.deviceType) ? <BatteryHealthField value={form.batteryHealth} onChange={(batteryHealth) => update({ batteryHealth })} /> : null}
        {form.serial ? <>
          <PhoneLabelPreview device={tradeInLabelData(form)} />
          <button type="button" onClick={() => printPhoneLabel(tradeInLabelData(form))} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#111111] bg-white px-3 text-sm font-semibold text-[#111111] hover:bg-[#f5f5f5]"><Printer className="h-4 w-4"/>Print {PHONE_LABEL.widthMm}×{PHONE_LABEL.heightMm} mm label</button>
        </> : null}
      </> : null}

      {step === 2 ? <>
        <div><p className={labelClass}>How does it look and work?</p><div className="mt-1.5 grid gap-2">{(Object.keys(tradeInGrades) as TradeInGrade[]).map((grade) => <button key={grade} type="button" aria-pressed={form.grade === grade} onClick={() => update({ grade })} className={`min-h-14 rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[.99] ${form.grade === grade ? grade === "FAULTY" ? "border-[#a15d3d] bg-[#a15d3d] text-white" : "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#c4c4c4]"}`}><span className="block text-sm font-semibold">{tradeInGrades[grade].label}</span><span className={`block text-[11px] ${form.grade === grade ? "text-white/75" : "text-[#6b6b6b]"}`}>{tradeInGrades[grade].detail}</span></button>)}</div>
          {form.grade === "FAULTY" ? <p className="mt-2 rounded-lg bg-[#fff6f1] px-3 py-2 text-xs font-semibold text-[#8a4b2f]">Faulty devices are not accepted as trade-ins.</p> : null}
        </div>
        {tradeInBatteryDevices.includes(form.deviceType) ? <BatteryHealthField value={form.batteryHealth} onChange={(batteryHealth) => update({ batteryHealth })} /> : null}
        <TickRow checked={form.hasCharger} onToggle={() => update({ hasCharger: !form.hasCharger })} title="Charger included"/>
      </> : null}

      {step === 3 ? <>
        <div><p className={labelClass}>Proof of ownership · tap at least one</p><div className="mt-1.5 space-y-2">
          <TickRow checked={form.receiptSeen} onToggle={() => update({ receiptSeen: !form.receiptSeen })} title="Original receipt seen" detail="Name and IMEI / serial on it match"/>
          {form.receiptSeen ? <input value={form.receiptReference} maxLength={80} onChange={(event) => update({ receiptReference: event.target.value })} placeholder="Receipt number and shop (optional)" className={fieldClass}/> : null}
          <TickRow checked={form.boxSeen} onToggle={() => update({ boxSeen: !form.boxSeen })} title="Phone box" detail="Tick if the owner has the original phone box. IMEI / serial on it must match."/>
        </div></div>
        <div><div className="flex items-center justify-between"><p className={labelClass}>Check with the seller</p><span className="text-[11px] font-semibold tabular-nums text-[#6b6b6b]">{doneCount} of {tradeInChecks.length}</span></div><div className="mt-1.5 space-y-2">
          {tradeInChecks.map((check) => <TickRow key={check.id} checked={form.checks[check.id] === true} onToggle={() => onChange((current) => ({ ...current, checks: { ...current.checks, [check.id]: !current.checks[check.id] } }))} title={check.label} detail={check.detail}/>)}
        </div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>We pay (trade-in value)<input type="number" inputMode="numeric" min={1} max={Math.max(1, subtotal - 1)} value={form.value} onChange={(event) => update({ value: event.target.value })} placeholder="KES" className={fieldClass}/></label>
          <label className={labelClass}>We resell for<input type="number" inputMode="numeric" min={1} value={form.resalePrice} onChange={(event) => update({ resalePrice: event.target.value })} placeholder="KES" className={fieldClass}/></label>
        </div>
        {value > 0 && Number(form.resalePrice) > 0 ? <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${Number(form.resalePrice) > value ? "bg-[#eef6f0] text-[#2f7d4f]" : "bg-[#fff6f1] text-[#8a4b2f]"}`}>{Number(form.resalePrice) > value ? `Margin on resale: ${money(Number(form.resalePrice) - value)}` : "The resale price must be higher than what we pay."}</p> : null}
        <TickRow checked={form.staffConfirmed} onToggle={() => update({ staffConfirmed: !form.staffConfirmed })} title="I confirm these checks" detail={tradeInDeclaration(staffName)}/>
      </> : null}

      {assessment.warnings.length && step >= 2 ? assessment.warnings.map((warning) => <p key={warning} className="rounded-lg bg-[#fbf3e4] px-3 py-2 text-xs text-[#876b3e]">{warning}</p>) : null}

      <div className="flex items-center gap-2 pt-1">
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className="inline-flex min-h-12 items-center gap-1 rounded-xl border border-[#d4d4d4] bg-white px-4 text-sm font-semibold text-[#2d2d2d]"><ChevronLeft className="h-4 w-4"/>Back</button> : null}
        {step < steps.length - 1
          ? <button type="button" onClick={() => setStep(step + 1)} className={`inline-flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl px-4 text-sm font-semibold ${stepDone(form, step, subtotal) ? "bg-[#111111] text-white" : "border border-[#d4d4d4] bg-white text-[#2d2d2d]"}`}>Next: {steps[step + 1]}<ChevronRight className="h-4 w-4"/></button>
          : <p className={`flex min-h-12 flex-1 items-center justify-center rounded-xl px-3 text-center text-sm font-semibold ${assessment.eligible ? "bg-[#eef6f0] text-[#2f7d4f]" : "bg-[#fff6f1] text-[#8a4b2f]"}`}>{assessment.eligible ? `Ready · ${money(value)} off the sale` : `${assessment.blockers.length} ${assessment.blockers.length === 1 ? "thing" : "things"} left`}</p>}
      </div>
      {step === steps.length - 1 && !assessment.eligible ? <ul className="list-disc space-y-1 rounded-lg border border-[#e8c4b5] bg-[#fff6f1] py-2 pl-7 pr-3 text-xs text-[#8a4b2f]">{assessment.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
    </div>
  </section>;
}
