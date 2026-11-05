"use client";

import { ArrowDownToLine, ArrowUpFromLine, CreditCard, Download, History, Repeat, ScanLine, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useSession } from "next-auth/react";

import { AppShell } from "@/components/app-shell";
import { hasPermission } from "@/lib/access";
import { conditionLabels } from "@/lib/catalog";
import { kenyaDateTime } from "@/lib/kenya-time";
import { paymentLabel } from "@/lib/payment-labels";

type Person = { name: string | null; phone: string | null };
type Life = {
  id: string;
  tracked: boolean;
  imei: string | null;
  serial: string | null;
  unitCode: string | null;
  status: "IN_STOCK" | "RESERVED" | "SOLD" | "UNKNOWN";
  product: { name: string; sku: string; condition: string; configuration: string | null; productGroup: string | null };
  details: { colour: string | null; storage: string | null; mpn: string | null; modelNumber: string | null; batteryHealth: number | null; fmi: string | null; sim: string | null; osVersion: string | null };
  received: { at: string; by: string | null; sourceKind: string | null; vendorName: string | null; source: Person | null; reference: string | null; cost: number | null };
  tradeIn: { grade: string; ownershipProof: string; receiptReference: string | null; hasBox: boolean; hasCharger: boolean; value: number | null; seller: Person; assessedBy: string } | null;
  supplierCode: string | null;
  activity: { action: string; summary: string; at: string; by: string | null }[];
  sale: { id: string; invoiceNumber: string; at: string; by: string | null; status: string; paymentMethod: string; customer: Person | null; price: number | null; warranty: { months: number; until: string | null; active: boolean } } | null;
  credit: { planReference: string; status: string; balance: number; totalAmount: number } | null;
};

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const statusLabels: Record<Life["status"], string> = { IN_STOCK: "In stock", RESERVED: "Held for payment", SOLD: "Sold", UNKNOWN: "Out of stock" };
const statusTone: Record<Life["status"], string> = {
  IN_STOCK: "bg-[#e9f3ec] text-[#2f6b43]",
  RESERVED: "bg-[#fff2e8] text-[#8a4b2f]",
  SOLD: "bg-[#f5f5f5] text-[#2d2d2d]",
  UNKNOWN: "bg-[#f5f5f5] text-[#6b6b6b]",
};
const proofLabels: Record<string, string> = { RECEIPT: "Receipt", BOX: "Box", BOTH: "Receipt and box" };

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div className="min-w-0"><dt className="text-[10px] uppercase tracking-[.1em] text-[#848b81]">{label}</dt><dd className="mt-0.5 truncate text-xs font-medium text-[#1a1a1a]">{value}</dd></div>;
}

function personLine(person: Person | null | undefined) {
  return person ? [person.name, person.phone].filter(Boolean).join(" · ") : "";
}

function ArrivalPhotos({ unitId }: { unitId: string }) {
  const [photos, setPhotos] = useState<{ id: string; slot: string }[]>([]);
  useEffect(() => {
    void fetch(`/api/devices/${unitId}/photos`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { photos: [] })
      .then((data) => setPhotos(data.photos ?? []))
      .catch(() => setPhotos([]));
  }, [unitId]);
  if (!photos.length) return null;
  const labels: Record<string, string> = { "about-1": "About, top", "about-2": "About, scrolled", battery: "Battery health", side: "Side" };
  return (
    <div className="border-t border-[#eeece4] px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#848b81]">Arrival photos · super admin</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo) => (
          <a key={photo.id} href={`/api/devices/${unitId}/photos?photo=${photo.id}`} target="_blank" rel="noreferrer" className="block">
            <img src={`/api/devices/${unitId}/photos?photo=${photo.id}`} alt={labels[photo.slot] ?? "Arrival photo"} className="h-28 w-20 rounded-lg object-cover" />
            <span className="mt-1 block text-[10px] text-[#69746c]">{labels[photo.slot] ?? photo.slot}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Correct a phone's details, or take out one received by mistake. Every change goes on its timeline. */
function DeviceEditor({ life, onChanged }: { life: Life; onChanged: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const [draft, setDraft] = useState({ imei: life.imei ?? "", serial: life.serial ?? "", supplierCode: life.supplierCode ?? "", colour: life.details.colour ?? "", storage: life.details.storage ?? "", batteryHealth: life.details.batteryHealth ? String(life.details.batteryHealth) : "", vendorName: life.received.vendorName ?? "" });
  const fields = [["imei", "IMEI"], ["serial", "Serial"], ["supplierCode", "Supplier sticker"], ["colour", "Colour"], ["storage", "Storage"], ["batteryHealth", "Battery %"], ["vendorName", "Vendor"]] as const;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setProblem("");
    try {
      const response = await fetch(`/api/devices/${life.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The details could not be saved.");
      setOpen(false);
      onChanged(result.changed ? "Saved. The correction is on this device's activity." : "Nothing changed.");
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "The details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${life.product.name} (${life.unitCode ?? life.imei ?? life.serial}) received by mistake? Stock goes down by one. This cannot be undone.`)) return;
    setSaving(true);
    setProblem("");
    try {
      const response = await fetch(`/api/devices/${life.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The device could not be removed.");
      onChanged(`Removed ${life.product.name} from stock.`);
    } catch (removeError) {
      setProblem(removeError instanceof Error ? removeError.message : "The device could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <div className="flex gap-3 border-t border-[#eeece4] px-5 py-2.5 text-[11px] font-semibold"><button type="button" onClick={() => setOpen(true)} className="text-[#111111] underline underline-offset-2">Edit details</button>{life.status === "IN_STOCK" ? <button type="button" disabled={saving} onClick={() => void remove()} className="text-[#a54f40] underline underline-offset-2 disabled:opacity-50">Remove (received by mistake)</button> : null}{problem ? <span role="alert" className="font-medium text-[#a54f40]">{problem}</span> : null}</div>;
  return (
    <form onSubmit={save} className="grid gap-2 border-t border-[#eeece4] bg-[#fafafa] px-5 py-4 sm:grid-cols-2">
      {fields.map(([key, label]) => <label key={key} className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#748176]">{label}<input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 w-full rounded-lg border border-[#c4c4c4] bg-white px-2.5 py-2 font-mono text-xs normal-case tracking-normal text-[#111111]" /></label>)}
      {problem ? <p role="alert" className="text-xs text-[#a54f40] sm:col-span-2">{problem}</p> : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-[#c4c4c4] px-3 py-1.5 text-xs font-medium">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-[#111111] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}

function LifeCard({ life, showPhotos, canEdit, onChanged }: { life: Life; showPhotos: boolean; canEdit: boolean; onChanged: (message: string) => void }) {
  const details = life.details;
  const source = life.received.sourceKind === "TRADE_IN" || life.tradeIn
    ? `Trade-in${personLine(life.tradeIn?.seller ?? life.received.source) ? ` from ${personLine(life.tradeIn?.seller ?? life.received.source)}` : ""}`
    : life.received.vendorName ? `Vendor ${life.received.vendorName}` : "Source not recorded";
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eeece4] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#111111]">{life.product.name}</h3>
          <p className="mt-1 font-mono text-[11px] text-[#69746c]">{[life.unitCode, life.supplierCode && `Supplier ${life.supplierCode}`, life.imei && `IMEI ${life.imei}`, life.serial && `Sr# ${life.serial}`].filter(Boolean).join(" · ") || life.product.sku}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-[10px] font-semibold text-[#2d2d2d]">{conditionLabels[life.product.condition] ?? life.product.condition}</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone[life.status]}`}>{statusLabels[life.status]}</span>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3 border-b border-[#eeece4] px-5 py-4 sm:grid-cols-4">
        <Fact label="Colour" value={details.colour} />
        <Fact label="Storage" value={details.storage || life.product.configuration} />
        <Fact label="Part number" value={[details.mpn, details.modelNumber].filter(Boolean).join(" · ")} />
        <Fact label="Battery" value={details.batteryHealth ? `${details.batteryHealth}%` : null} />
        <Fact label="Find My" value={details.fmi} />
        <Fact label="SIM" value={details.sim} />
        <Fact label="iOS" value={details.osVersion} />
        <Fact label="SKU" value={life.product.sku} />
      </dl>
      <ol className="space-y-4 px-5 py-4">
        <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#e9f3ec] text-[#2f6b43]">{life.tradeIn ? <Repeat className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}</span>
          <div className="min-w-0 text-xs leading-5">
            <p className="font-semibold text-[#1a1a1a]">Came in · {kenyaDateTime(life.received.at)}</p>
            <p className="text-[#4a4a4a]">{source}</p>
            <p className="text-[#848b81]">{[life.received.by && `Received by ${life.received.by}`, life.received.reference && `Ref ${life.received.reference}`, life.received.cost !== null && life.received.cost > 0 ? `Cost ${money(life.received.cost)}` : null].filter(Boolean).join(" · ")}</p>
            {life.tradeIn ? <p className="text-[#848b81]">{[`Grade ${life.tradeIn.grade.toLowerCase()}`, `Proof: ${proofLabels[life.tradeIn.ownershipProof] ?? life.tradeIn.ownershipProof}`, life.tradeIn.receiptReference && `Receipt ${life.tradeIn.receiptReference}`, life.tradeIn.hasCharger ? "with charger" : null, life.tradeIn.value !== null ? `Valued ${money(life.tradeIn.value)}` : null, `Checked by ${life.tradeIn.assessedBy}`].filter(Boolean).join(" · ")}</p> : null}
          </div>
        </li>
        {life.sale ? <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#f5f5f5] text-[#2d2d2d]"><ArrowUpFromLine className="h-4 w-4" /></span>
          <div className="min-w-0 text-xs leading-5">
            <p className="font-semibold text-[#1a1a1a]">{life.status === "RESERVED" ? "Held for a sale awaiting payment" : "Sold"} · {kenyaDateTime(life.sale.at)}</p>
            <p className="text-[#4a4a4a]">{life.sale.customer ? `To ${personLine(life.sale.customer)}` : "Walk-in customer"}{life.sale.price !== null ? ` · ${money(life.sale.price)}` : ""}</p>
            <p className="text-[#848b81]">{[`Invoice ${life.sale.invoiceNumber}`, paymentLabel(life.sale.paymentMethod), life.sale.by && `Sold by ${life.sale.by}`].filter(Boolean).join(" · ")}</p>
            <p className={life.sale.warranty.active ? "font-medium text-[#2f6b43]" : "text-[#848b81]"}>{life.sale.warranty.months && life.sale.warranty.until ? `Warranty ${life.sale.warranty.months} months, ${life.sale.warranty.active ? "valid until" : "ended"} ${new Date(life.sale.warranty.until).toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" })}` : "No warranty recorded"}</p>
            {life.sale.price !== null ? <a href={`/api/pos/${life.sale.id}/receipt`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#111111] underline-offset-2 hover:underline"><Download className="h-3 w-3" />Download receipt</a> : null}
          </div>
        </li> : null}
        {life.credit ? <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#fff2e8] text-[#8a4b2f]"><CreditCard className="h-4 w-4" /></span>
          <div className="min-w-0 text-xs leading-5">
            <p className="font-semibold text-[#1a1a1a]">Lipa Mdogo Mdogo plan {life.credit.planReference}</p>
            <p className="text-[#848b81]">{life.credit.balance > 0 ? `${money(life.credit.balance)} still owed of ${money(life.credit.totalAmount)}` : "Paid off"}</p>
          </div>
        </li> : null}
      </ol>
      {life.activity.length ? <div className="border-t border-[#eeece4] px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#848b81]">Activity on this device</p>
        <ol className="mt-2 space-y-1.5">{life.activity.map((event, index) => <li key={`${event.at}-${index}`} className="text-xs leading-5"><span className="text-[#848b81]">{kenyaDateTime(event.at)}{event.by ? ` · ${event.by}` : ""}</span><br /><span className="text-[#1a1a1a]">{event.summary}</span></li>)}</ol>
      </div> : null}
      {showPhotos && life.tracked ? <ArrivalPhotos unitId={life.id} /> : null}
      {canEdit && life.tracked ? <DeviceEditor life={life} onChanged={onChanged} /> : null}
      {!life.tracked ? <p className="border-t border-[#eeece4] bg-[#fafafa] px-5 py-2.5 text-[10px] text-[#848b81]">Recorded before per-device tracking, so some details are missing.</p> : null}
    </article>
  );
}

export default function DevicesPage() {
  const { data: session } = useSession();
  const showPhotos = session?.user.role === "OWNER";
  const canEdit = hasPermission(session?.user, "inventory.receive");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [lives, setLives] = useState<Life[]>([]);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/devices?q=${encodeURIComponent(term)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gadget history could not be loaded.");
      setLives(data.lives);
      setSearched(data.query);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gadget history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const term = new URLSearchParams(window.location.search).get("q") || "";
    const frame = window.requestAnimationFrame(() => { setQuery(term); void load(term); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
    void load(query.trim());
    input.current?.select();
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="border-b border-[#e2e6e2] pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a4a4a]">Inventory</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Gadgets history</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#69746c]">A barcode opens that exact device. A name lists every iPhone, Mac, iPad, Watch or accessory that matches. The same model shares a product; each physical unit has its own barcode, serial and photos.</p>
        </div>
        <form onSubmit={search} className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search gadgets</span>
            <ScanLine aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78847a]" />
            <input ref={input} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Barcode, sticker, IMEI, serial, name, client email or phone" className="w-full rounded-xl border border-[#c4c4c4] bg-white py-3 pl-9 pr-3 font-mono text-sm outline-none focus:border-[#111111]" />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white"><Search className="h-4 w-4" />Find</button>
        </form>
        {error ? <p role="alert" className="rounded-xl border border-[#f0d4cc] bg-[#fff6f3] px-4 py-3 text-sm text-[#9b4a3d]">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}
        <p className="flex items-center gap-2 text-xs text-[#69746c]"><History className="h-3.5 w-3.5" />{loading ? "Searching…" : searched ? `${lives.length} ${lives.length === 1 ? "record" : "records"} for “${searched}”` : "Most recently received gadgets"}</p>
        {!loading && !lives.length ? <div className="rounded-2xl border border-dashed border-[#d4d4d4] bg-white px-5 py-10 text-center text-sm text-[#69746c]">{searched ? "No gadget with that barcode or name has passed through the shop." : "Nothing has been scanned in yet. Devices are recorded here from the next stock receipt."}</div> : null}
        <div className="grid gap-4 xl:grid-cols-2">{lives.map((life) => <LifeCard key={`${life.id}-${life.activity.length}`} life={life} showPhotos={showPhotos} canEdit={canEdit} onChanged={(message) => { setNotice(message); void load(searched); }} />)}</div>
      </div>
    </AppShell>
  );
}
