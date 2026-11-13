"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { notificationResponse } from "@/lib/notification-response";
import { notifyInboxChanged, registerNotificationWorker } from "@/lib/notification-events";

type Alert = { id: string; title: string; body: string; readAt: string | null; scheduledAt: string };
type NotificationCard = Alert & { userId: string; confirmation?: boolean };
type Feed = { unread: number; alerts: Alert[] };

export function NotificationBell() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [state, setState] = useState<(Feed & { userId: string }) | null>(null);
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<NotificationCard[]>([]);
  const currentToast = cards.find((card) => card.userId === userId);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let seen: Set<string> | null = null;
    let inFlight = false;
    let refreshAgain = false;
    let readVersion = 0;
    const acknowledgedReads = new Set<string>();
    function applyRead(value: unknown) {
      if (typeof value !== "string" || acknowledgedReads.has(value)) return;
      acknowledgedReads.add(value); readVersion += 1;
      const readAt = new Date().toISOString();
      setState((current) => {
        if (!current || current.userId !== userId) return current;
        const known = current.alerts.find((alert) => alert.id === value);
        return { ...current, unread: known?.readAt ? current.unread : Math.max(0, current.unread - 1), alerts: current.alerts.map((alert) => alert.id === value ? { ...alert, readAt } : alert) };
      });
      setCards((current) => current.filter((card) => card.confirmation || card.id !== value));
    }
    async function refresh() {
      if (inFlight) { refreshAgain = true; return; }
      inFlight = true;
      const version = readVersion;
      try {
        const response = await fetch("/api/notifications/unread", { cache: "no-store", signal: controller.signal });
        const result = await notificationResponse<Feed>(response);
        if (controller.signal.aborted || !Array.isArray(result.alerts) || typeof result.unread !== "number") return;
        if (version !== readVersion) { refreshAgain = true; return; }
        const arrivals = seen ? result.alerts.filter((alert) => !alert.readAt && !seen!.has(alert.id)).reverse() : [];
        seen ??= new Set();
        result.alerts.forEach((alert) => seen!.add(alert.id));
        if (arrivals.length) setCards((current) => [...current.filter((card) => card.userId === userId), ...arrivals.map((alert) => ({ ...alert, userId: userId! }))]);
        setState({ ...result, userId: userId! });
        setError("");
      } catch { /* Keep the last loaded inbox available during a transient outage. */ }
      finally {
        inFlight = false;
        if (refreshAgain && !controller.signal.aborted) { refreshAgain = false; void refresh(); }
      }
    }
    let sequence = 0;
    const feedback = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: unknown; body?: unknown }>).detail;
      if (typeof detail?.title !== "string" || typeof detail.body !== "string") return;
      const card: NotificationCard = { id: `feedback-${Date.now()}-${sequence++}`, userId: userId!, title: detail.title, body: detail.body, readAt: null, scheduledAt: new Date().toISOString(), confirmation: true };
      setCards((current) => [...current.filter((item) => item.userId === userId), card]);
    };
    window.addEventListener("notification-feedback", feedback);
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 10_000);
    const changed = (event: Event) => {
      applyRead((event as CustomEvent<{ readId?: string }>).detail?.readId);
      void refresh();
    };
    const workerMessage = (event: MessageEvent) => { if (event.data?.type === "NOTIFICATIONS_CHANGED") void refresh(); };
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("gadgethub-notifications") : null;
    if (channel) channel.onmessage = (event) => { applyRead(event.data?.readId); void refresh(); };
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void registerNotificationWorker().catch(() => undefined);
      navigator.serviceWorker.addEventListener("message", workerMessage);
    }
    window.addEventListener("notifications-changed", changed);
    window.addEventListener("focus", changed);
    return () => {
      window.removeEventListener("notification-feedback", feedback);
      controller.abort(); channel?.close(); window.clearTimeout(initial); window.clearInterval(interval);
      window.removeEventListener("notifications-changed", changed); window.removeEventListener("focus", changed);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
    };
  }, [userId]);
  useEffect(() => {
    if (!open) return;
    const click = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => {
    if (!currentToast) return;
    const id = currentToast.id;
    const timeout = window.setTimeout(() => setCards((current) => current.filter((card) => card.id !== id)), 10_000);
    return () => window.clearTimeout(timeout);
  }, [currentToast]);
  const feed = state?.userId === userId ? state : null;
  const unread = feed?.unread ?? 0;
  const dismissCard = () => setCards((current) => current.filter((card) => card.id !== currentToast?.id));
  async function markRead(id: string) {
    try {
      const response = await fetch("/api/notifications/inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      await notificationResponse<{ ok: boolean }>(response);
      notifyInboxChanged(id);
    } catch { setError("Could not mark the notification read. Please try again."); }
  }
  return <>
    <div className="relative" ref={panel}>
      <button type="button" aria-label={`Messages and alerts, ${unread} unread`} aria-busy={!feed} aria-expanded={open} aria-controls="recent-notifications" onClick={() => setOpen((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background)]"><BellRing className="h-4 w-4" />{unread > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#0a0a0a] px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}</button>
      {open ? <section id="recent-notifications" aria-label="Recent notifications" className="absolute right-0 top-12 z-50 max-h-[70vh] w-[min(360px,calc(100vw-2rem))] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-xl"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Notifications · {unread} unread</h3><button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>{error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}<div className="mt-3 divide-y divide-[#f4f4f2]">{feed?.alerts.map((alert) => <article key={alert.id} className="py-3"><Link href="/notifications" onClick={() => setOpen(false)} className={`text-sm ${alert.readAt ? "text-[var(--foreground)]" : "font-semibold text-[var(--foreground)]"}`}>{alert.title}</Link><p className="mt-1 break-words text-xs text-[var(--foreground)]">{alert.body.slice(0, 160)}</p>{!alert.readAt ? <button type="button" onClick={() => void markRead(alert.id)} className="mt-2 text-xs font-semibold text-[var(--foreground)]">Mark read</button> : null}</article>)}{!feed?.alerts.length ? <p className="py-3 text-xs text-[var(--foreground)]">{feed ? "No notifications yet." : "Loading notifications…"}</p> : null}</div><Link href="/notifications" onClick={() => setOpen(false)} className="mt-3 block border-t border-[var(--border)] pt-3 text-xs font-semibold text-[var(--foreground)]">Open Messages &amp; alerts</Link></section> : null}
    </div>
    {currentToast ? createPortal(<aside role="status" aria-label={currentToast.confirmation ? "Message confirmation" : "New in-app notification"} className="fixed bottom-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-[#6b6b66] bg-[var(--panel)] p-4 shadow-xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--foreground)]">{currentToast.confirmation ? "Message update" : "New notification"}</p><p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{currentToast.title}</p></div><button type="button" aria-label="Dismiss notification" onClick={dismissCard}><X className="h-4 w-4" /></button></div><p className="mt-2 break-words text-xs text-[var(--foreground)]">{currentToast.body.slice(0, 160)}</p>{cards.filter((card) => card.userId === userId).length > 1 ? <p className="mt-2 text-xs text-[var(--foreground)]">{cards.filter((card) => card.userId === userId).length - 1} more notifications queued</p> : null}<Link href="/notifications" onClick={dismissCard} className="mt-3 inline-block text-xs font-semibold text-[var(--foreground)]">View message</Link></aside>, document.body) : null}
  </>;
}
