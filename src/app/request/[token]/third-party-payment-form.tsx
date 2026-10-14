"use client";

import { useEffect, useState, type FormEvent } from "react";

type Status = "CREATED" | "PROCESSING" | "PAID" | "REVIEW" | "FAILED" | "EXPIRED";

export function ThirdPartyPaymentForm({ token, amount, initialStatus }: { token: string; amount: number; initialStatus: Status }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "PROCESSING") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/payment-requests/${token}`, { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok && data.status) setStatus(data.status as Status);
      } catch { /* Keep waiting; a temporary connection issue should not mark a payment as failed. */ }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [status, token]);

  async function startPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/payment-requests/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The payment prompt could not be started.");
      setStatus("PROCESSING");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The payment prompt could not be started.");
    } finally { setSending(false); }
  }

  if (status === "PAID") return <div role="status" className="rounded-xl border border-[#dce9d9] bg-[#f0f6ed] p-4 text-sm text-[#365a3b]">Payment received and applied to the customer’s account. Thank you.</div>;
  if (status === "REVIEW") return <div role="status" className="rounded-xl border border-[#eadfc7] bg-[#fbf7ed] p-4 text-sm leading-6 text-[#735d39]">M-Pesa reported this payment, and the business is checking its account record. Please do not submit another payment.</div>;
  if (status === "EXPIRED") return <div role="status" className="rounded-xl border border-[#eadfc7] bg-[#fbf7ed] p-4 text-sm text-[#735d39]">This payment request has expired. Ask the business for a new link.</div>;
  if (status === "PROCESSING") return <div role="status" className="rounded-xl border border-[#e3e7df] bg-[#f7f8f3] p-4"><p className="text-sm font-semibold text-[#39483a]">Check your phone</p><p className="mt-1 text-xs leading-5 text-[#747a70]">An M-Pesa prompt was sent to {phone || "the payer’s phone"}. Enter your PIN on your phone only. This page will update when the payment is confirmed.</p></div>;

  return <form onSubmit={startPayment} className="space-y-4">
    {status === "FAILED" ? <p role="status" className="rounded-lg border border-[#eadfc7] bg-[#fbf7ed] px-3 py-2.5 text-xs text-[#735d39]">The previous prompt was not completed. You can request a new one.</p> : null}
    {error ? <p role="alert" className="rounded-lg bg-[#fff0ed] px-3 py-2.5 text-xs text-[#984c40]">{error}</p> : null}
    <label className="block text-xs font-semibold text-[#526057]">Payer’s M-Pesa phone number<input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" required placeholder="0712 345 678" className="mt-2 w-full rounded-xl border border-[#d6ddd6] bg-white px-3.5 py-3 text-sm font-normal text-[#27352b] outline-none focus:border-[#315d3f]"/><span className="mt-1.5 block text-[10px] font-normal text-[#8b9188]">Enter the number that should receive the payment prompt.</span></label>
    <button type="submit" disabled={sending} className="w-full rounded-xl bg-[#1f4935] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(31,73,53,.15)] transition hover:bg-[#285940] disabled:cursor-wait disabled:opacity-60">{sending ? "Connecting to M-Pesa…" : `Pay KES ${amount.toLocaleString("en-KE")} with M-Pesa`}</button>
  </form>;
}
