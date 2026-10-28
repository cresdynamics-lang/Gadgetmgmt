"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldAlert, X } from "lucide-react";

import { isPermission, permissionLabels } from "@/lib/access";

type Pending = { permission: string; resolve: (approved: boolean) => void };

/** Open the approval prompt from anywhere, e.g. a locked panel on a server-rendered page. */
export function requestApproval(permission: string) {
  window.dispatchEvent(new CustomEvent("gadgethub:approval", { detail: { permission } }));
}

function isApiRequest(input: RequestInfo | URL) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const parsed = new URL(url, window.location.origin);
  return parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/") && !parsed.pathname.startsWith("/api/approvals");
}

/**
 * Restricted permissions answer with 403 + `approvalRequired`. This gate intercepts those
 * responses, asks the super admin for a 5-minute code, then retries the original request.
 */
export function ApprovalGate() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [sentUntil, setSentUntil] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const waiting = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const ask = (permission: string) => {
      const existing = waiting.current.get(permission);
      if (existing) return existing;
      const promise = new Promise<boolean>((resolve) => setPending({ permission, resolve }));
      waiting.current.set(permission, promise);
      void promise.finally(() => waiting.current.delete(permission));
      return promise;
    };

    window.fetch = async (input, init) => {
      const retry = input instanceof Request ? input.clone() : input;
      const response = await originalFetch(input, init);
      if (response.status !== 403 || !isApiRequest(input)) return response;
      const body = await response.clone().json().catch(() => null) as { approvalRequired?: string } | null;
      if (!body?.approvalRequired || !isPermission(body.approvalRequired)) return response;
      const approved = await ask(body.approvalRequired);
      return approved ? originalFetch(retry, init) : response;
    };

    const onRequest = (event: Event) => {
      const permission = (event as CustomEvent<{ permission?: string }>).detail?.permission;
      if (permission && isPermission(permission)) void ask(permission).then((approved) => { if (approved) router.refresh(); });
    };
    window.addEventListener("gadgethub:approval", onRequest);
    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("gadgethub:approval", onRequest);
    };
  }, [router]);

  useEffect(() => {
    if (!sentUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentUntil]);

  if (!pending || !isPermission(pending.permission)) return null;
  const label = permissionLabels[pending.permission];
  const secondsLeft = sentUntil ? Math.max(0, Math.round((sentUntil - now) / 1000)) : 0;
  const expired = Boolean(sentUntil) && secondsLeft === 0;

  function close(approved: boolean) {
    pending?.resolve(approved);
    setPending(null);
    setCode("");
    setSentUntil(null);
    setMessage("");
    setError("");
  }

  async function sendCode() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission: pending.permission }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The approval code could not be sent.");
      setSentUntil(new Date(result.expiresAt).getTime());
      setNow(Date.now());
      setMessage(result.message);
      setCode("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The approval code could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/approvals/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission: pending.permission, code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The code could not be checked.");
      close(true);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "The code could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#111111]/50 px-4 backdrop-blur-[2px]">
    <section role="dialog" aria-modal="true" aria-labelledby="approval-title" className="w-full max-w-sm rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_28px_100px_rgba(0,0,0,.28)]">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2e8] text-[#a15d3d]"><ShieldAlert className="h-5 w-5"/></span>
        <button type="button" onClick={() => close(false)} aria-label="Cancel" className="rounded-lg p-1.5 text-[#6b6b6b] hover:bg-[#f5f5f5]"><X className="h-4 w-4"/></button>
      </div>
      <h2 id="approval-title" className="mt-3 text-base font-semibold text-[#111111]">Approval needed</h2>
      <p className="mt-1 text-sm leading-6 text-[#4a4a4a]"><strong>{label}</strong> needs a super-admin code. The code is emailed to the approval inbox and works for 5 minutes. After you enter it, you stay signed in for the time the admin set, then you are logged out.</p>
      {!sentUntil || expired ? <>
        {expired ? <p className="mt-3 rounded-lg bg-[#fff2e8] px-3 py-2 text-xs text-[#8a4b2f]">The 5 minutes are up. Request a new code to continue.</p> : null}
        <button type="button" disabled={busy} onClick={() => void sendCode()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"><Mail className="h-4 w-4"/>{busy ? "Sending…" : expired ? "Request a new code" : "Email code to the approval inbox"}</button>
      </> : <form onSubmit={verify} className="mt-4 space-y-3">
        {message ? <p className="rounded-lg bg-[#f5f5f5] px-3 py-2 text-xs text-[#4a4a4a]">{message}</p> : null}
        <label className="block text-xs font-semibold text-[#2d2d2d]">Code from the super admin
          <input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-1.5 w-full rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] px-3.5 py-3 text-center font-mono text-lg tracking-[.4em] outline-none focus:border-black focus:bg-white"/>
        </label>
        <p className="text-center text-[11px] tabular-nums text-[#6b6b6b]">Code expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p>
        <button disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111111] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4"/>{busy ? "Checking…" : "Unlock and continue"}</button>
        <button type="button" disabled={busy} onClick={() => void sendCode()} className="w-full text-center text-[11px] font-semibold text-[#4a4a4a] underline-offset-2 hover:underline">Send a new code</button>
      </form>}
      {error ? <p role="alert" className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}
    </section>
  </div>;
}
