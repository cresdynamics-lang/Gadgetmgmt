"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication } from "webauthn-browser";
import { ArrowRight, Fingerprint, Mail, ShieldCheck } from "lucide-react";
import { hasSensitiveQuery, safeInternalPath } from "@/lib/access";

type Step = "choose" | "password" | "code";
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const supported = useSyncExternalStore(() => () => {}, browserSupportsWebAuthn, () => true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.dataset.authReady = "true";
    const current = new URL(window.location.href);
    const callbackUrl = current.searchParams.get("callbackUrl");
    const safeCallback = safeInternalPath(callbackUrl);
    if (!hasSensitiveQuery(current.searchParams) && (callbackUrl === null || callbackUrl === safeCallback)) return;
    const next = new URL("/login", window.location.origin);
    if (safeCallback && safeCallback !== "/login") next.searchParams.set("callbackUrl", safeCallback);
    window.history.replaceState(null, "", `${next.pathname}${next.search}`);
  }, []);
  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
    if (step === "password") passwordInput.current?.focus();
  }, [step]);
  async function call(body: Record<string, unknown>) {
    const response = await fetch("/api/auth/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign-in could not be completed. Try again.");
    return result;
  }
  async function finish(ticket: string) {
    const result = await signIn("credentials", { ticket, redirect: false });
    if (!result || result.error) throw new Error("Your sign-in expired or this device was revoked. Please sign in again.");
    try { sessionStorage.removeItem("gadgethub-lock-pending"); delete document.documentElement.dataset.lockPending; } catch {}
    const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
    const session = await sessionResponse.json();
    const callback = safeInternalPath(new URLSearchParams(window.location.search).get("callbackUrl"));
    const pages: string[] = session.user?.pages ?? [];
    const next = callback && callback !== "/login" && (pages.includes("*") || callback === "/account" || callback === "/settings" || callback.startsWith("/settings#") || pages.some(page => callback === page || callback.startsWith(`${page}/`))) ? callback : pages.includes("*") || pages.includes("/dashboard") ? "/dashboard" : pages[0] || "/settings";
    router.replace(next); router.refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>, passkey = false) {
    event.preventDefault(); setError(""); setPending(true);
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") ?? email).trim().toLowerCase();
    setEmail(submittedEmail);
    try {
      if (step === "code") {
        const result = await call({ action: "code", challengeId, code: form.get("code") });
        await finish(result.ticket);
      } else if (passkey) {
        const options = await call({ action: "passkey-options", email: submittedEmail });
        const credential = await startAuthentication({ optionsJSON: options.options });
        const result = await call({ action: "passkey-verify", challengeId: options.challengeId, response: credential });
        await finish(result.ticket);
      } else {
        const result = await call({ action: "password", email: submittedEmail, password: form.get("password") });
        if (result.needsCode) { setChallengeId(result.challengeId); setStep("code"); }
        else await finish(result.ticket);
      }
    } catch(e) {
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Verification was cancelled. Try again or use your password." : e instanceof Error && e.name === "TimeoutError" ? "The connection timed out. Your sign-in has not completed. Try again." : e instanceof Error ? e.message : "Cannot connect. Check your connection and try again.");
    } finally { setPending(false); }
  }
  return <main className="security-root"><div className="security-login">
    <div className="security-brand"><span className="brand-logo-surface"><Image src="/brand/logo-on-dark.png" alt="GadgetHub" width={96} height={88} unoptimized priority/></span></div>
    <div className="security-stack">
      <div><p className="security-eyebrow"><ShieldCheck size={16} aria-hidden="true"/> Secure team access</p><h1>{step === "code" ? "Verify this device." : "Welcome back."}</h1><p className="security-detail">{step === "code" ? `Enter the six-digit code sent to ${email}. It expires in five minutes.` : "Sign in to your shop workspace."}</p></div>
      <form className="security-stack" onSubmit={event => void submit(event, step === "choose" && supported)} aria-busy={pending}>
        {step !== "code" ? <><label className="security-field" htmlFor="email">Work email<input id="email" name="email" type="email" autoComplete="username webauthn" autoCapitalize="none" spellCheck={false} required value={email} disabled={pending} onChange={event=>setEmail(event.target.value)} placeholder="you@company.com"/></label>
          {step === "password" || !supported ? <label className="security-field" htmlFor="password">Password<input ref={passwordInput} id="password" name="password" type="password" autoComplete="current-password" required disabled={pending}/></label> : null}</> : <label className="security-field" htmlFor="code"><span className="security-eyebrow"><Mail size={16} aria-hidden="true"/> Email verification code</span><input ref={codeInput} id="code" className="security-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={pending} aria-describedby="code-help"/><span id="code-help" className="security-detail">Check your spam folder too. Never share this code.</span></label>}
        {error && <p role="alert" className="security-error">{error}</p>}
        <button type="submit" className="security-primary" disabled={pending}>{pending ? "Verifying…" : step === "code" ? <>Verify & sign in<ArrowRight size={18} aria-hidden="true"/></> : step === "choose" && supported ? <><Fingerprint size={20} aria-hidden="true"/>Sign in with Face ID or passkey</> : <>Continue<ArrowRight size={18} aria-hidden="true"/></>}</button>
      </form>
      {step === "choose" && supported ? <><div className="security-divider">or</div><button className="security-secondary" disabled={pending} onClick={()=>{setStep("password");setError("");}}>Use password</button><p className="security-detail">New device? Use your password and an email code first. On a verified device, use Face ID, your fingerprint, or your device PIN.</p></> : step === "code" || supported ? <button className="security-link" disabled={pending} onClick={()=>{setStep(step === "code" ? "password" : "choose");setError("");}}>{step === "code" ? "Back to password · request a new code" : supported ? "Use Face ID or passkey instead" : "Back"}</button> : <p className="security-detail">This browser does not support passkeys. Use your password and email verification.</p>}
      <p className="security-detail">Need access or a locked account? Contact the Administrator to verify your identity and restore access.</p>
    </div>
  </div></main>;
}
