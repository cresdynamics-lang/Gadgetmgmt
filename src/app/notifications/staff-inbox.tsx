"use client";

import { EmailSetup } from "./email-setup";
import { notificationResponse } from "@/lib/notification-response";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Alert = { id: string; title: string; body: string; scheduledAt: string; readAt: string | null; deliveries: { channel: string; status: string }[] };
type Recipient = { id: string; name: string };
const field = "w-full rounded-lg border border-[#dce6dd] bg-white px-3 py-2 text-sm";
const button = "rounded-lg border border-[#dce6dd] px-3 py-2 text-xs font-semibold text-[#365b43] disabled:opacity-50";

type SentAlert = Omit<Alert, "deliveries"> & { user: { name: string }; deliveries: { channel: string; status: string; attempts: number; lastError: string | null }[] };
type InboxResponse = { canConfigureEmail: boolean; sent: SentAlert[]; canManage: boolean; emailConfigured: boolean; emailTestMode: boolean; workerOnline: boolean; alerts: Alert[]; recipients: Recipient[]; unread: number; pushPublicKey: string | null; deliveryPending?: boolean };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  return notificationResponse<InboxResponse>(response);
}

export function StaffInbox() {
  const requestId = useRef<string | null>(null);
  const [sent, setSent] = useState<SentAlert[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canConfigureEmail, setCanConfigureEmail] = useState(false);
  const [emailSetupOpen, setEmailSetupOpen] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailTestMode, setEmailTestMode] = useState(false);
  const [workerOnline, setWorkerOnline] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [unread, setUnread] = useState(0);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [timing, setTiming] = useState("now");
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  async function refresh() {
    const result = await api("/api/notifications/inbox");
    if (!Array.isArray(result.alerts) || !Array.isArray(result.recipients) || !Array.isArray(result.sent)) throw new Error("Notification data is incomplete. Please refresh.");
    setSent(result.sent); setCanManage(result.canManage); setCanConfigureEmail(result.canConfigureEmail); setEmailConfigured(result.emailConfigured); setEmailTestMode(result.emailTestMode); setWorkerOnline(result.workerOnline); setLoaded(true); setLoadedAt(Date.now()); setError(""); window.dispatchEvent(new Event("notifications-changed"));
    setAlerts(result.alerts); setRecipients(result.recipients); setUnread(result.unread); setKey(result.pushPublicKey);
  }
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh().catch((cause) => setError(cause.message));
      if ("serviceWorker" in navigator && "PushManager" in window && window.isSecureContext) {
        setSupported(true);
        void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
          setSubscribed(Boolean(await registration?.pushManager.getSubscription()));
        }).catch(() => undefined);
      }
    }, 0);
    const timer = window.setInterval(() => void refresh().catch(() => setError("Could not refresh notifications. Displaying the last loaded messages.")), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const schedule = String(data.get("scheduledAt") || "");
      requestId.current ??= crypto.randomUUID();
      const result = await api("/api/notifications/inbox", "POST", { requestId: requestId.current, sendNow: timing === "now", userId: data.get("userId"), title: data.get("title"), body: data.get("body"), ...(timing === "scheduled" && schedule ? { scheduledAt: new Date(schedule).toISOString() } : {}), email: data.get("email") === "on", push: data.get("push") === "on" });
      requestId.current = null; form.reset(); setTiming("now");
      setNotice(timing === "scheduled" ? "Message scheduled for the selected time." : result.deliveryPending ? "Message is available in the recipient’s inbox. Email or push delivery is pending until the worker reconnects." : "Message is available in the recipient’s inbox. Any selected email or push delivery has been queued.");
      await refresh().catch(() => setError("Message saved, but the inbox could not refresh. Refresh to see the latest messages."));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save alert."); }
    finally { setBusy(false); }
  }

  async function togglePush() {
    setPushBusy(true); setError(""); setNotice("");
    try {
      const registration = await navigator.serviceWorker.register("/notifications-sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscribed && subscription) {
        await api("/api/notifications/push", "DELETE", { endpoint: subscription.endpoint });
        await subscription.unsubscribe(); setSubscribed(false);
        setNotice("Browser notifications disabled on this device.");
      } else {
        if (!key) throw new Error("Browser push is not configured.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Allow notifications in browser settings to enable push.");
        const binary = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
        const applicationServerKey = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        await api("/api/notifications/push", "POST", subscription.toJSON());
        setSubscribed(true); setNotice("Browser notifications enabled for your account on this device.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update browser notifications."); }
    finally { setPushBusy(false); }
  }

  async function markRead(id: string) {
    try { await api("/api/notifications/inbox", "PATCH", { id }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark alert read."); }
  }

  return <section className="space-y-4 rounded-2xl border border-[#e2e9e2] bg-white p-5" aria-labelledby="staff-inbox-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="staff-inbox-heading" className="font-semibold text-[#304235]">Your inbox · {unread} unread</h3><p className="mt-1 text-xs text-[#7c897f]">Staff messages and scheduled alerts. Times use your device timezone.</p></div><button className={button} disabled={!supported || (!key && !subscribed) || pushBusy} onClick={() => void togglePush()}>{pushBusy ? "Updating…" : subscribed ? "Disable browser notifications" : "Enable browser notifications"}</button></div>
    <p className="text-xs text-[#7c897f]">Browser notifications require HTTPS. On iPhone or iPad, add the app to your Home Screen first. Enable notifications for your account on each device you use.</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-green-800">{notice}</p> : null}
    {canManage ? <>
    <div className={`rounded-xl border p-3 ${emailConfigured && !emailTestMode ? "border-[#dce6dd] bg-[#f8fbf8]" : "border-[#ead8b7] bg-[#fffaf0]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#69766c]" role="status">{emailConfigured ? emailTestMode ? "Email is using a test sender. Configure your company sender before sending broadly." : "Company email is configured." : canConfigureEmail ? "Email is not configured. Add your company sender here to enable email notifications." : "Email is not configured. Ask the company owner to add the sender in Messages & alerts."}</p>{canConfigureEmail ? <button type="button" className={button} onClick={() => setEmailSetupOpen(true)}>{emailConfigured && !emailTestMode ? "Edit email settings" : "Configure email"}</button> : null}</div>
      {!workerOnline ? <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#69766c]">Email delivery is paused or starting. In-app messages are available; queued deliveries are safely saved. Your administrator may need to start the delivery service.</p><button type="button" className={button} onClick={() => void refresh().catch(() => setError("Could not check delivery status. Please try again."))}>Check delivery status</button></div> : <p className="mt-2 text-xs text-[#69766c]">Delivery service is online.</p>}
    </div>
    {emailSetupOpen && canConfigureEmail ? <EmailSetup onClose={() => setEmailSetupOpen(false)} onSaved={async () => { await refresh(); setEmailSetupOpen(false); setNotice("Company sender saved. Email delivery will use it automatically."); }} /> : null}
    <details className="rounded-xl border border-[#e2e9e2] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#365b43]">Compose an alert</summary><form onSubmit={submit} onChange={() => { requestId.current = null; }} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs">Recipient<select aria-label="Recipient" required name="userId" className={field}><option value="">Choose a staff member</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name}</option>)}</select></label>
      <label className="space-y-1 text-xs">When to send<select aria-label="When to send" value={timing} onChange={(event) => setTiming(event.target.value)} className={field}><option value="now">Send now</option><option value="scheduled">Schedule for later</option></select></label>
      {timing === "scheduled" ? <label className="space-y-1 text-xs sm:col-span-2">Send at<input required name="scheduledAt" type="datetime-local" className={field} /></label> : null}
      <label className="space-y-1 text-xs sm:col-span-2">Title<input required name="title" maxLength={160} className={field} /></label>
      <label className="space-y-1 text-xs sm:col-span-2">Message<textarea required name="body" maxLength={4000} rows={3} className={field} /></label>
      <div className="flex flex-wrap gap-4 text-xs sm:col-span-2"><span>Always delivered in app</span><label><input name="email" type="checkbox" disabled={!emailConfigured} /> Also email</label><label><input name="push" type="checkbox" disabled={!key} /> Also browser push</label></div>
      <button disabled={busy} className={button}>{busy ? "Saving…" : timing === "now" ? "Send now" : "Schedule message"}</button>
    </form></details>
    <details className="rounded-xl border border-[#e2e9e2] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#365b43]">Sent &amp; scheduled messages ({sent.length})</summary><div className="divide-y divide-[#edf1ed]">{sent.map((message) => <article key={message.id} className="py-3"><p className="text-sm font-semibold">{message.title} · {message.user.name}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#69766c]">{message.body}</p><p className="mt-1 text-xs text-[#7c897f]">{new Date(message.scheduledAt).getTime() > loadedAt ? "Scheduled for" : "Available in app since"} {new Date(message.scheduledAt).toLocaleString()} · {message.readAt ? "Read" : "Unread"}</p>{message.deliveries.map((delivery) => <p key={delivery.channel} className="mt-1 text-xs text-[#69766c]">{delivery.channel}: {delivery.status === "SENT" ? "Accepted by provider" : delivery.status.toLowerCase()} · {delivery.attempts} attempts{delivery.lastError ? ` · ${delivery.lastError}` : ""}</p>)}</article>)}{!sent.length ? <p className="py-3 text-sm text-[#69766c]">No sent messages yet.</p> : null}</div></details>
    </> : null}
    <div className="divide-y divide-[#edf1ed]">{alerts.map((alert) => <article key={alert.id} className="py-4"><div className="flex items-start justify-between gap-3"><h4 className={`text-sm ${alert.readAt ? "text-[#69766c]" : "font-semibold text-[#20382d]"}`}>{alert.title}</h4>{!alert.readAt ? <button className={button} onClick={() => void markRead(alert.id)}>Mark read</button> : <span className="text-xs text-[#7c897f]">Read</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#69766c]">{alert.body}</p><p className="mt-2 text-xs text-[#7c897f]">{new Date(alert.scheduledAt).toLocaleString()}{alert.deliveries.map((delivery) => ` · ${delivery.channel}: ${delivery.status.toLowerCase()}`).join("")}</p></article>)}{!alerts.length ? <p className="py-6 text-center text-sm text-[#7c897f]">{loaded ? "Your inbox is empty." : "Loading your inbox…"}</p> : null}</div>
  </section>;
}
