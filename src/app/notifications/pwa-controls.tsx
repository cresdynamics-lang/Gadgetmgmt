"use client";

import { useEffect, useState } from "react";
import { notificationResponse } from "@/lib/notification-response";
import { notifyInboxChanged, registerNotificationWorker } from "@/lib/notification-events";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type PushState = { subscribed: boolean; publicKey: string | null };
const button = "rounded-lg border border-[#dce6dd] px-3 py-2 text-xs font-semibold text-[#365b43] disabled:opacity-50";

export function PwaControls() {
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [push, setPush] = useState<PushState>({ subscribed: false, publicKey: null });
  const [supported, setSupported] = useState(false);
  const [reason, setReason] = useState("Checking this browser…");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const installedMode = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () => setInstalled(installedMode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const afterInstall = () => { setInstalled(true); setInstall(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", afterInstall);
    installedMode.addEventListener("change", checkInstalled);
    const initial = window.setTimeout(() => {
      checkInstalled();
      if (!window.isSecureContext) { setReason("Browser push requires HTTPS. In-app notifications work on this connection."); return; }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setReason("This browser does not support push. In-app notifications still work. On iPhone or iPad, install the app to your Home Screen first."); return; }
      setSupported(true);
      void (async () => {
        const registration = await registerNotificationWorker();
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const response = await fetch(`/api/notifications/push${subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : ""}`, { cache: "no-store" });
        const result = await notificationResponse<PushState>(response);
        if (!active) return;
        setPush(result);
        setReason(Notification.permission === "denied" ? "Notifications are blocked. Allow them in this site's browser settings, then try again." : !result.publicKey ? "Browser push needs server setup. In-app notifications are available now." : result.subscribed ? "Browser notifications are enabled for your account on this device." : "Enable browser notifications to receive alerts while the app is closed.");
      })().catch(() => { if (active) setReason("Could not check browser notifications. Reload this page to try again."); });
    }, 0);
    return () => { active = false; window.clearTimeout(initial); window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", afterInstall); installedMode.removeEventListener("change", checkInstalled); };
  }, []);

  async function installApp() {
    if (!install) { setMessage("Open your browser's menu and choose Install app or Add to Home Screen. On iPhone or iPad, use Safari's Share menu → Add to Home Screen."); return; }
    await install.prompt();
    const choice = await install.userChoice;
    setInstall(null);
    if (choice.outcome === "accepted") setMessage("Installation requested. You can open GadgetHub from your device's app launcher.");
  }
  async function togglePush() {
    setBusy(true); setError(""); setMessage("");
    try {
      // Ask within the button gesture, before waiting on registration/network requests.
      if (!push.subscribed && await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your browser settings to enable browser alerts. In-app notifications remain available.");
      const registration = await registerNotificationWorker();
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (push.subscribed && subscription) {
        const response = await fetch("/api/notifications/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await notificationResponse(response);
        await subscription.unsubscribe();
        setPush((value) => ({ ...value, subscribed: false }));
        setReason("Browser notifications are disabled on this device. In-app notifications are still available.");
      } else {
        if (!push.publicKey) throw new Error("Browser push needs server setup.");
        const padded = push.publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(push.publicKey.length / 4) * 4, "=");
        const applicationServerKey = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        await notificationResponse(response);
        setPush((value) => ({ ...value, subscribed: true }));
        setReason("Browser notifications are enabled for your account on this device.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update browser notifications."); }
    finally { setBusy(false); }
  }
  async function testPush() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/notifications/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });
      const result = await notificationResponse<{ deliveryPending: boolean }>(response);
      notifyInboxChanged();
      setMessage(result.deliveryPending ? "Test saved to your inbox. Browser delivery will resume when the delivery service reconnects." : "Test notification queued for this account's subscribed devices. It is also available in your in-app inbox.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send a test notification."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-[#dce6dd] bg-[#f8fbf8] p-4" aria-labelledby="device-notifications-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 id="device-notifications-heading" className="text-sm font-semibold text-[#304235]">In-app &amp; device notifications</h4><p className="mt-1 text-xs text-[#69766c]">In-app notifications are always on: use the bell on any page. No email or installation is required.</p></div>{installed ? <span className="text-xs font-semibold text-[#365b43]">App installed</span> : <button type="button" onClick={() => void installApp().catch(() => setError("Could not open installation. Use your browser's Install app menu."))} className={button}>Install app</button>}</div>
    <p className="text-xs text-[#69766c]">{reason}</p>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={!supported || !push.publicKey || busy} onClick={() => void togglePush()} className={button}>{busy ? "Updating…" : push.subscribed ? "Disable browser notifications" : "Enable browser notifications"}</button>{push.subscribed ? <button type="button" disabled={busy} onClick={() => void testPush()} className={button}>Send test notification</button> : null}</div>
    {message ? <p role="status" className="text-xs text-[#365b43]">{message}</p> : null}{error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
  </section>;
}
