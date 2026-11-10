"use client";

import Link from "next/link";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { notificationResponse } from "@/lib/notification-response";

export function NotificationBell() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [state, setState] = useState<{ userId: string; unread: number } | null>(null);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/notifications/unread", { cache: "no-store", signal: controller.signal });
        const result = await notificationResponse<{ unread: number }>(response);
        if (!controller.signal.aborted && typeof result.unread === "number") setState({ userId: userId!, unread: result.unread });
      } catch { /* A transient outage should not disrupt the current workspace. */ }
    }
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 15_000);
    const changed = () => void refresh();
    window.addEventListener("notifications-changed", changed);
    window.addEventListener("focus", changed);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("notifications-changed", changed); window.removeEventListener("focus", changed); };
  }, [userId]);
  const unread = state?.userId === userId ? state?.unread ?? 0 : 0;
  return <Link href="/notifications" aria-label={`Messages and alerts, ${unread} unread`} className="relative grid h-9 w-9 place-items-center rounded-xl border border-[#dce6dd] text-[#365b43] hover:bg-[#f1f7f2]"><BellRing className="h-4 w-4" />{unread > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-[#183b2a] px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span> : null}</Link>;
}
