"use client";

import { useState, type FormEvent } from "react";

export function PaymentSubmissionForm({ token, scheduledAmount, balance }: { token: string; scheduledAmount: number; balance: number }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/payment-portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(data.get("amount")), reference: data.get("reference") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Payment reference could not be submitted.");
      setSubmitted(true);
      form.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Payment reference could not be submitted.");
    } finally {
      setSending(false);
    }
  }

  if (submitted) return <div role="status" className="mt-5 rounded-xl border border-[#e6e6e2] bg-[#e5f5ee] p-4 text-sm text-[#111111]">Your payment reference was sent to the branch for confirmation. Your balance will update after it is verified.</div>;

  return <form onSubmit={submitPayment} className="mt-5 space-y-3 border-t border-[#8a5a12] pt-5">
    {error ? <p role="alert" className="rounded-lg bg-[#fdeceb] px-3 py-2 text-xs text-[#b3261e]">{error}</p> : null}
    <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#111111]">Amount paid (KES)<input name="amount" type="number" min="1" max={balance} defaultValue={Math.min(scheduledAmount, balance)} required className="mt-1.5 w-full rounded-lg border border-[#8a5a12] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#111111]"/></label>
    <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#111111]">M-Pesa transaction code<input name="reference" minLength={6} maxLength={32} required placeholder="e.g. QWE123ABC" className="mt-1.5 w-full rounded-lg border border-[#8a5a12] bg-white px-3 py-2.5 text-sm uppercase normal-case tracking-normal text-[#111111] placeholder:normal-case placeholder:tracking-normal"/></label>
    <button type="submit" disabled={sending} className="w-full rounded-lg bg-[#0a7d56] px-4 py-3 text-xs font-semibold text-white transition hover:bg-[#111111] disabled:opacity-60">{sending ? "Sending reference…" : "Submit payment for confirmation"}</button>
    <p className="text-[10px] leading-4 text-[#6b6b66]">The branch will verify the transaction before your balance changes. Never share your M-Pesa PIN.</p>
  </form>;
}
