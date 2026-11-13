"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { notificationResponse } from "@/lib/notification-response";

type Settings = { senderEmail: string; senderName: string; apiKeyConfigured: boolean };
const field = "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm";

export function EmailSetup({ onSaved, onClose }: { onSaved: () => Promise<void>; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications/email-settings", { cache: "no-store", signal: controller.signal })
      .then((response) => notificationResponse<Settings>(response))
      .then((result) => { if (!controller.signal.aborted) { setSettings(result); requestAnimationFrame(() => emailInput.current?.focus()); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load email settings."); });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/notifications/email-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senderEmail: data.get("senderEmail"), senderName: data.get("senderName") }) });
      await notificationResponse<{ configured: boolean }>(response);
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save email settings."); }
    finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4" aria-labelledby="email-setup-heading">
    <div className="flex items-center justify-between gap-3"><h4 id="email-setup-heading" className="text-sm font-semibold text-[var(--foreground)]">Configure company email</h4><button type="button" onClick={onClose} disabled={saving} className="text-xs font-semibold text-[var(--foreground)]">Close</button></div>
    <p className="mt-2 text-xs leading-5 text-[var(--foreground)]">Choose the company address used for all automated emails. Its domain must be verified with your email provider. This is separate from your account login email.</p>
    <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-[var(--foreground)] underline">Verify your sender domain in Resend</a>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {!settings ? <p className="mt-3 text-xs text-[var(--foreground)]">Loading email settings…</p> : <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-[var(--foreground)]">Company sender email<input ref={emailInput} name="senderEmail" type="email" required maxLength={254} defaultValue={settings.senderEmail} placeholder="notifications@yourcompany.com" className={field} /></label>
      <label className="text-xs text-[var(--foreground)]">Sender name<input name="senderName" required maxLength={100} defaultValue={settings.senderName || "GadgetHub"} className={field} /></label>
      <p className="text-xs text-[var(--foreground)] sm:col-span-2">{settings.apiKeyConfigured ? "Email service is connected. Saving this sender enables email without restarting the app." : "The sender can be saved now. Your server administrator must also connect the email service before messages can be emailed."}</p>
      <button disabled={saving} className="rounded-lg bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving sender…" : "Save email settings"}</button>
    </form>}
  </section>;
}
