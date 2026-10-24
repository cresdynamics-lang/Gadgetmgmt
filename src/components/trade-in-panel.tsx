"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Check, ChevronLeft, ChevronRight, Repeat2, X } from "lucide-react";

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
  sellerName: string;
  sellerPhone: string;
  value: string;
  resalePrice: string;
  staffConfirmed: boolean;
};

export const blankTradeInForm: TradeInForm = {
  active: false, brand: "", deviceType: "", model: "", serial: "", storage: "", grade: "", batteryHealth: "", hasCharger: false,
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

const steps = ["Device", "Condition", "Checks", "Seller & price"] as const;
const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;

function stepDone(form: TradeInForm, step: number, subtotal: number) {
  if (step === 0) return Boolean(form.brand && form.deviceType && form.model.trim().length >= 2 && /^[A-Z0-9]{8,20}$/.test(form.serial) && (!tradeInStorageDevices.includes(form.deviceType) || form.storage));
  if (step === 1) {
    const battery = Number(form.batteryHealth);
    return Boolean(form.grade && form.grade !== "FAULTY" && (!tradeInBatteryDevices.includes(form.deviceType) || (battery >= 1 && battery <= 100)));
  }
  if (step === 2) return (form.receiptSeen || form.boxSeen) && tradeInChecks.every((check) => form.checks[check.id]);
  const value = tradeInValue(form, subtotal);
  return form.sellerName.trim().length >= 2 && form.sellerPhone.replace(/\D/g, "").length >= 9 && value > 0 && value < subtotal && Number(form.resalePrice) > value && form.staffConfirmed;
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
  // Build on the latest form so quick taps never overwrite each other.
  const update = (changes: Partial<TradeInForm>) => onChange((current) => ({ ...current, ...changes }));
  const assessment = assessTradeInForm(form, subtotal);
  const value = tradeInValue(form, subtotal);
  const doneCount = tradeInChecks.filter((check) => form.checks[check.id]).length;
  const models = form.brand && form.deviceType ? tradeInDevices[form.brand][form.deviceType]?.models ?? [] : [];

  if (!form.active) {
    return <button type="button" disabled={subtotal < 1} onClick={() => { setStep(0); onChange({ ...blankTradeInForm, active: true }); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-[#c4c4c4] bg-[#fafafa] px-3.5 py-3 text-left transition hover:border-[#111111] disabled:opacity-50">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#2d2d2d] ring-1 ring-[#e5e5e5]"><Repeat2 className="h-4 w-4"/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1a1a1a]">Add a trade-in</span><span className="block text-[11px] text-[#6b6b6b]">{subtotal < 1 ? "Add an item to the sale first" : "iPhone, iPad, MacBook, Watch, AirPods or Samsung"}</span></span>
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
        {form.deviceType ? <label className={labelClass}>IMEI or serial number<input value={form.serial} maxLength={20} autoCapitalize="characters" autoCorrect="off" onChange={(event) => update({ serial: event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() })} placeholder={form.deviceType === "iPhone" || form.deviceType === "Phone" ? "Dial *#06# to show the IMEI" : "Settings > General > About"} className={`${fieldClass} font-mono tracking-wider`}/></label> : null}
      </> : null}

      {step === 1 ? <>
        <div><p className={labelClass}>How does it look and work?</p><div className="mt-1.5 grid gap-2">{(Object.keys(tradeInGrades) as TradeInGrade[]).map((grade) => <button key={grade} type="button" aria-pressed={form.grade === grade} onClick={() => update({ grade })} className={`min-h-14 rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[.99] ${form.grade === grade ? grade === "FAULTY" ? "border-[#a15d3d] bg-[#a15d3d] text-white" : "border-[#111111] bg-[#111111] text-white" : "border-[#e5e5e5] bg-white text-[#1a1a1a] hover:border-[#c4c4c4]"}`}><span className="block text-sm font-semibold">{tradeInGrades[grade].label}</span><span className={`block text-[11px] ${form.grade === grade ? "text-white/75" : "text-[#6b6b6b]"}`}>{tradeInGrades[grade].detail}</span></button>)}</div>
          {form.grade === "FAULTY" ? <p className="mt-2 rounded-lg bg-[#fff6f1] px-3 py-2 text-xs font-semibold text-[#8a4b2f]">Faulty devices are not accepted as trade-ins.</p> : null}
        </div>
        {tradeInBatteryDevices.includes(form.deviceType) ? <label className={labelClass}>Battery health %<input type="number" inputMode="numeric" min={1} max={100} value={form.batteryHealth} onChange={(event) => update({ batteryHealth: event.target.value.slice(0, 3) })} placeholder="Settings > Battery > Battery Health" className={fieldClass}/></label> : null}
        <TickRow checked={form.hasCharger} onToggle={() => update({ hasCharger: !form.hasCharger })} title="Charger included"/>
      </> : null}

      {step === 2 ? <>
        <div><p className={labelClass}>Proof of ownership · tap at least one</p><div className="mt-1.5 space-y-2">
          <TickRow checked={form.receiptSeen} onToggle={() => update({ receiptSeen: !form.receiptSeen })} title="Original receipt seen" detail="Name and IMEI / serial on it match"/>
          {form.receiptSeen ? <input value={form.receiptReference} maxLength={80} onChange={(event) => update({ receiptReference: event.target.value })} placeholder="Receipt number and shop (optional)" className={fieldClass}/> : null}
          <TickRow checked={form.boxSeen} onToggle={() => update({ boxSeen: !form.boxSeen })} title="Original box handed over" detail="IMEI / serial on the box matches"/>
        </div></div>
        <div><div className="flex items-center justify-between"><p className={labelClass}>Check with the seller</p><span className="text-[11px] font-semibold tabular-nums text-[#6b6b6b]">{doneCount} of {tradeInChecks.length}</span></div><div className="mt-1.5 space-y-2">
          {tradeInChecks.map((check) => <TickRow key={check.id} checked={form.checks[check.id] === true} onToggle={() => onChange((current) => ({ ...current, checks: { ...current.checks, [check.id]: !current.checks[check.id] } }))} title={check.label} detail={check.detail}/>)}
        </div></div>
      </> : null}

      {step === 3 ? <>
        {customer && customer.name ? <button type="button" onClick={() => update({ sellerName: customer.name, sellerPhone: customer.phone })} className="min-h-11 w-full rounded-xl border border-[#d4d4d4] bg-white px-3 text-[13px] font-semibold text-[#2d2d2d] hover:border-[#111111]">Seller is the customer · {customer.name}</button> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Seller’s name (as on ID)<input value={form.sellerName} maxLength={120} autoComplete="off" onChange={(event) => update({ sellerName: event.target.value })} className={fieldClass}/></label>
          <label className={labelClass}>Seller’s phone<input type="tel" inputMode="tel" value={form.sellerPhone} maxLength={20} onChange={(event) => update({ sellerPhone: event.target.value })} placeholder="07xx xxx xxx" className={fieldClass}/></label>
          <label className={labelClass}>We pay (trade-in value)<input type="number" inputMode="numeric" min={1} max={Math.max(1, subtotal - 1)} value={form.value} onChange={(event) => update({ value: event.target.value })} placeholder="KES" className={fieldClass}/></label>
          <label className={labelClass}>We resell for<input type="number" inputMode="numeric" min={1} value={form.resalePrice} onChange={(event) => update({ resalePrice: event.target.value })} placeholder="KES" className={fieldClass}/></label>
        </div>
        {value > 0 && Number(form.resalePrice) > 0 ? <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${Number(form.resalePrice) > value ? "bg-[#eef6f0] text-[#2f7d4f]" : "bg-[#fff6f1] text-[#8a4b2f]"}`}>{Number(form.resalePrice) > value ? `Margin on resale: ${money(Number(form.resalePrice) - value)}` : "The resale price must be higher than what we pay."}</p> : null}
        <TickRow checked={form.staffConfirmed} onToggle={() => update({ staffConfirmed: !form.staffConfirmed })} title="I confirm these checks" detail={tradeInDeclaration(staffName)}/>
      </> : null}

      {assessment.warnings.length && step >= 1 ? assessment.warnings.map((warning) => <p key={warning} className="rounded-lg bg-[#fbf3e4] px-3 py-2 text-xs text-[#876b3e]">{warning}</p>) : null}

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
