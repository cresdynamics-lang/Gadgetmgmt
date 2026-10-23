"use client";

import { useState, type FormEvent } from "react";

export function RescheduleForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [minimumDate, setMinimumDate] = useState("");

  function toggleForm() {
    if (!open) {
      const tomorrow = new Date(Date.now() + 86_400_000);
      setMinimumDate(`${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`);
    }
    setOpen(!open);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/payment-portal/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedDueDate: values.get("requestedDueDate"), reason: values.get("reason") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your request could not be sent.");
      form.reset();
      setOpen(false);
      setMessage("Your request was sent. The branch manager will review it; your current due date stays in place until approved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your request could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return <div className="mt-4 rounded-xl border border-[#e9e3d5] px-4 py-3">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-[#596456]">Need more time for a payment?</p><button type="button" onClick={toggleForm} className="text-xs font-semibold text-[#1a1a1a] underline underline-offset-2">{open ? "Close" : "Request a date change"}</button></div>
    {open ? <form onSubmit={submit} className="mt-3 space-y-3">
      <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Requested due date<input name="requestedDueDate" type="date" required min={minimumDate} className="mt-1.5 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#111111]" /></label>
      <label className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#788074]">Reason<textarea name="reason" required minLength={10} maxLength={300} rows={2} className="mt-1.5 w-full rounded-lg border border-[#e3e1d7] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-[#111111]" placeholder="Let us know briefly why you need a different date." /></label>
      <button disabled={sending} className="rounded-lg bg-[#1a1a1a] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">{sending ? "Sending…" : "Send for manager review"}</button>
    </form> : null}
    {message ? <p role="status" className="mt-3 text-xs leading-5 text-[#596456]">{message}</p> : null}
  </div>;
}
