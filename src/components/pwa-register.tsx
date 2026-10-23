"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const hintFrame = window.requestAnimationFrame(() => setIosHint(ios && !standalone));
    return () => {
      window.cancelAnimationFrame(hintFrame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (!installEvent && !iosHint) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[80] max-w-sm rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,.16)]">
      <p className="text-sm font-semibold text-[#111111]">Install Gadget Hub</p>
      <p className="mt-1 text-xs leading-5 text-[#667066]">
        {installEvent
          ? "Add this app to your phone or computer for a full-screen, always-ready workspace."
          : "On iPhone, tap Share, then Add to Home Screen."}
      </p>
      <div className="mt-3 flex gap-2">
        {installEvent ? <button type="button" onClick={() => void installEvent.prompt().then(() => setInstallEvent(null))} className="rounded-lg bg-[#111111] px-3 py-2 text-xs font-semibold text-white">Install</button> : null}
        <button type="button" onClick={() => { setInstallEvent(null); setIosHint(false); }} className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-semibold">Later</button>
      </div>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
