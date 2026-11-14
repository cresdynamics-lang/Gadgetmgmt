"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

export type PendingPayment = { id: string; amount: number; method: "MPESA" | "BANK"; reference: string | null; createdAt: string; invoiceNumber: string; seller: string; client: string | null; branch: string };

const money = (amount: number) => `KES ${amount.toLocaleString("en-KE")}`;
const label = { MPESA: "M-Pesa", BANK: "Bank transfer" } as const;

export function PaymentTicks({ payments }: { payments: PendingPayment[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function tick(ids: string[], key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/finance/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentIds: ids }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not confirm the payment.");
      router.refresh();
    } catch (tickError) {
      setError(tickError instanceof Error ? tickError.message : "Could not confirm the payment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="security-panel" aria-label="Money in waiting for your tick">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3>Money in waiting for your tick</h3>
          <p className="security-detail">Staff recorded these M-Pesa and bank payments. Check each code or reference against the statement, then tick it. The system never collects money itself.</p>
        </div>
        {payments.length > 1 ? <button type="button" disabled={busy !== null} onClick={() => void tick(payments.map((payment) => payment.id), "all")} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-50">{busy === "all" ? "Confirming…" : `Tick all ${payments.length}`}</button> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger-text)]">{error}</p> : null}
      {payments.length ? payments.map((payment) => (
        <div className="workflow-row flex flex-wrap items-center justify-between gap-3" key={payment.id}>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--foreground)]">{label[payment.method]} · <span className="font-mono">{payment.reference ?? "No reference"}</span></span>
            <span className="block text-xs text-[var(--muted)]">{payment.invoiceNumber} · {payment.client ?? "Walk-in"} · sold by {payment.seller} · {payment.branch} · {new Date(payment.createdAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</span>
          </span>
          <span className="flex items-center gap-3">
            <strong className="tabular-nums">{money(payment.amount)}</strong>
            <button type="button" disabled={busy !== null} onClick={() => void tick([payment.id], payment.id)} aria-label={`Confirm ${label[payment.method]} ${payment.reference ?? ""} for ${money(payment.amount)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a7d56] px-3 py-2 text-xs font-semibold text-white hover:bg-[#111111] disabled:opacity-50"><Check className="h-3.5 w-3.5" />{busy === payment.id ? "Confirming…" : "Tick"}</button>
          </span>
        </div>
      )) : <p className="security-detail">Nothing waiting. Every recorded M-Pesa and bank payment is confirmed.</p>}
    </section>
  );
}
