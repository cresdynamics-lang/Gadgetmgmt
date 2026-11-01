"use client";

import { useEffect, useRef } from "react";

/**
 * USB / Bluetooth barcode scanners type like a very fast keyboard. This tells them apart from a person
 * by the gap between keys, so a scan works anywhere on the page without clicking into a field first.
 */
const MAX_GAP_MS = 35;
const MIN_FAST_KEYS = 4;
const IDLE_MS = 90;
const MIN_LENGTH = 6;

type ScanHandler = (code: string) => void;

const handlers: ScanHandler[] = [];

/** The newest screen that wants scans gets them (a pop-up over a page wins over the page). */
export function registerScanHandler(handler: ScanHandler) {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function hasScanHandler() {
  return handlers.length > 0;
}

/** Give a scan to the active screen. Returns false when nothing on screen takes scans. */
export function dispatchScan(code: string) {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  handler(code);
  return true;
}

/** Let this component receive every scanner scan while it is mounted and `enabled`. */
export function useScanHandler(handler: ScanHandler, enabled = true) {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; });
  useEffect(() => {
    if (!enabled) return;
    return registerScanHandler((code) => latest.current(code));
  }, [enabled]);
}

function isEditable(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && /^(text|search|tel|number|email|url|password)?$/.test(target.type));
}

/** Take back the first few characters that landed in a field before the burst was recognised as a scan. */
function removeLeakedText(field: HTMLInputElement | HTMLTextAreaElement, leaked: number) {
  if (leaked < 1 || field.type === "number") return;
  const end = field.selectionStart ?? field.value.length;
  const start = Math.max(0, end - leaked);
  const next = field.value.slice(0, start) + field.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  setter?.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.setSelectionRange(start, start);
}

/**
 * Watch the keyboard for scanner bursts and hand each finished scan to `onScan`. Mount once, in the app shell.
 * `wanted` says whether anything would take a scan right now; when it is false, scans type into fields as usual.
 */
export function useKeyboardScanner(onScan: (code: string) => void, wanted: () => boolean) {
  const latest = useRef({ onScan, wanted });
  useEffect(() => { latest.current = { onScan, wanted }; });

  useEffect(() => {
    let buffer = "";
    let last = 0;
    let fastKeys = 0;
    let leaked = 0;
    let target: EventTarget | null = null;
    let capturing = false;
    let idle: number | null = null;

    const reset = () => {
      buffer = "";
      fastKeys = 0;
      leaked = 0;
      target = null;
      capturing = false;
    };

    const finish = () => {
      idle = null;
      const code = buffer.replace(/\r/g, "").trim();
      const wasScan = capturing && fastKeys >= MIN_FAST_KEYS && code.length >= MIN_LENGTH;
      const field = target;
      const leakedCount = leaked;
      reset();
      if (!wasScan) return;
      if (isEditable(field)) removeLeakedText(field, leakedCount);
      latest.current.onScan(code);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const isEnter = event.key === "Enter" || event.key === "Tab";
      if (!isEnter && event.key.length !== 1) return;
      const now = performance.now();
      if (now - last > MAX_GAP_MS * 2 || !buffer) {
        if (idle) window.clearTimeout(idle);
        idle = null;
        reset();
        target = event.target;
      } else if (now - last <= MAX_GAP_MS) {
        fastKeys += 1;
      }
      last = now;
      if (isEnter && !buffer) return;
      buffer += isEnter ? "\n" : event.key;
      if (!capturing && fastKeys >= MIN_FAST_KEYS - 1) capturing = latest.current.wanted();
      if (capturing) {
        // From here the scanner owns the keys: nothing lands in a field and Enter submits nothing.
        event.preventDefault();
        event.stopPropagation();
      } else if (!isEnter) {
        leaked += 1;
      }
      if (idle) window.clearTimeout(idle);
      idle = window.setTimeout(finish, IDLE_MS);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (idle) window.clearTimeout(idle);
    };
  }, []);
}
