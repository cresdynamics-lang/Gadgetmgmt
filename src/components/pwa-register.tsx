"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { installGuide, type InstallGuide } from "@/lib/install-guide";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const INSTALLED_KEY = "gadgethub-installed";
const LATER_KEY = "gadgethub-install-later";
/** Chrome and Edge fire their install event shortly after load; after this long, fall back to directions. */
const FALLBACK_MS = 5000;

/** Browser storage can be blocked, for example in a private window. Install must still work then. */
function remembered(storage: "local" | "session", key: string) {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}

function remember(storage: "local" | "session", key: string) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, "1");
  } catch {
    // Nothing to keep: the offer simply shows again on the next visit.
  }
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [guide, setGuide] = useState<InstallGuide | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const hidden = standalone || remembered("session", LATER_KEY);
    const offerGuide = !hidden && !remembered("local", INSTALLED_KEY);
    const directions = installGuide(navigator.userAgent, navigator.maxTouchPoints);
    // iPhones and iPads never fire an install event, so they need no wait. Other browsers may still fire one.
    const noEvent = directions.device === "iPhone" || directions.device === "iPad";
    const guideFrame = window.requestAnimationFrame(() => { if (noEvent && offerGuide) setGuide(directions); });
    const fallback = window.setTimeout(() => {
      if (noEvent || !offerGuide) return;
      // Chrome and Edge also stay silent when the app is already installed, so check before offering directions.
      const related = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
      void (related.getInstalledRelatedApps?.() ?? Promise.resolve([])).catch(() => []).then((apps) => {
        if (!apps.length) setGuide(directions);
      });
    }, FALLBACK_MS);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.clearTimeout(fallback);
      if (!hidden) {
        setGuide(null);
        setInstallEvent(event as BeforeInstallPromptEvent);
      }
    };
    const onInstalled = () => {
      remember("local", INSTALLED_KEY);
      setInstallEvent(null);
      setGuide(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.cancelAnimationFrame(guideFrame);
      window.clearTimeout(fallback);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function later() {
    remember("session", LATER_KEY);
    setInstallEvent(null);
    setGuide(null);
  }

  function install() {
    if (!installEvent) return;
    void installEvent.prompt()
      // Browsers allow one prompt per event; if it cannot open, the directions still get the app installed.
      .catch(() => setGuide(installGuide(navigator.userAgent, navigator.maxTouchPoints)))
      .finally(() => setInstallEvent(null));
  }

  if (!installEvent && !guide) return null;
  return (
    <div role="dialog" aria-label="Install Gadget Hub" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[80] rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,.22)] print:hidden sm:left-auto sm:right-4 sm:w-96">
      <p className="text-sm font-semibold text-[#111111]">Install Gadget Hub</p>
      {guide && !installEvent ? (
        <>
          <p className="mt-1 text-xs leading-5 text-[#667066]">On this {guide.device}:</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-5 text-[#2d2d2d]">
            {guide.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </>
      ) : (
        <p className="mt-1 text-xs leading-5 text-[#667066]">Add this app to your phone or computer for a full-screen, always-ready workspace.</p>
      )}
      <div className="mt-3 flex gap-2">
        {installEvent ? <button type="button" onClick={install} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" />Install</button> : null}
        <button type="button" onClick={later} className={`min-h-11 rounded-xl border border-[#d4d4d4] px-4 text-sm font-semibold text-[#2d2d2d] ${installEvent ? "" : "flex-1"}`}>{installEvent ? "Later" : "Got it"}</button>
      </div>
    </div>
  );
}
