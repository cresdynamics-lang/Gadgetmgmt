"use client";
import { DeviceSignInPolicy } from "@/components/device-sign-in-policy";
import { SecretInput } from "@/components/secret-input";
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { startRegistration, browserSupportsWebAuthn } from "webauthn-browser";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Fingerprint, ShieldCheck, Smartphone } from "lucide-react";

type Device = { id: string; label: string; createdAt: string; lastUsedAt: string; pinAllowed:boolean;passwordAllowed:boolean;biometricsAllowed:boolean;user: { name: string;role:string }; _count: { passkeys: number } };
export function AccountSecurity() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentId, setCurrentId] = useState("");
  const [pinAllowed,setPinAllowed]=useState(false);const [canManageDevices,setCanManageDevices]=useState(false);
  const [pinConfigured,setPinConfigured]=useState(false);
  const [allowed, setAllowed] = useState(false);
  const supported = useSyncExternalStore(() => () => {}, browserSupportsWebAuthn, () => true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revokePassword, setRevokePassword] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      const response = await fetch("/api/auth/devices", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setPinAllowed(body.pinAllowed);setCanManageDevices(body.canManageDevices);setPinConfigured(Boolean(body.pinConfigured));setDevices(body.devices); setCurrentId(body.currentDeviceId); setAllowed(body.biometricsAllowed);
    } catch (e) { setError(e instanceof Error ? e.message : "Devices could not be loaded. Try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Schedule the asynchronous initial fetch after the browser has mounted.
    const controller = new AbortController();
    Promise.resolve().then(() => { if (!controller.signal.aborted) void load(); });
    return () => controller.abort();
  }, [load]);
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/auth/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-options", password: new FormData(form).get("password") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const credential = await startRegistration({ optionsJSON: body.options });
      const verified = await fetch("/api/auth/security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "register-verify", challengeId: body.challengeId, response: credential }) });
      const result = await verified.json();
      if (!verified.ok) throw new Error(result.error);
      form.reset(); setNotice("Passkey ready. Use Face ID, your fingerprint, or your device PIN next time."); await load();
    } catch (e) { setError(e instanceof Error && e.name !== "NotAllowedError" ? e.message : "Passkey setup was cancelled. Try again or use another permitted sign-in method."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password: revokePassword }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setRevokeId(""); setRevokePassword("");
      if (id === currentId) { await signOut({ redirectTo: "/login" }); return; }
      setNotice("Device access revoked. It must be verified again before signing in."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Device could not be revoked."); }
    finally { setBusy(false); }
  }
  return <div className="security-stack">
    <div><p className="security-eyebrow"><ShieldCheck size={16} aria-hidden="true"/> Your account</p><h2 id="account-security-title">Account security</h2><p className="security-detail">Manage how you sign in and which devices can access GadgetHub.</p></div>
    {error && <div role="alert" className="security-error">{error}<button className="security-link" onClick={() => {setError(""); void load();}}>Try again</button></div>}
    {notice && <p role="status" className="security-notice">{notice}</p>}
    <section className="security-panel"><h3>App PIN</h3><p className="security-detail">{loading?"Loading PIN settings…":!pinAllowed?"The Administrator controls whether app PIN sign-in is permitted on this account and device.":pinConfigured?"A six-digit app PIN is set for this device. Use it for everyday sign-in.":"Set a six-digit PIN for everyday sign-in on this device."} Setup and recovery require your password and an emailed code.</p>{pinAllowed?<Link className="security-secondary" href="/login?flow=verify&callbackUrl=%2Fsettings%23account-security">{pinConfigured?"Reset app PIN":"Set up app PIN"}</Link>:!loading&&<p className="security-notice">App PIN sign-in is disabled by the Administrator for this account or device.</p>}</section>
    <section className="security-panel"><Fingerprint size={24} aria-hidden="true"/><h3>Face ID & passkeys</h3><p className="security-detail">Verify with your device’s Face ID, fingerprint, or screen-lock PIN. Your biometric data stays on your device.</p>
      {loading ? <p role="status">Loading security settings…</p> : !allowed ? <p className="security-notice">Ask the Administrator to enable biometric sign-in for your account.</p> : !supported ? <p className="security-notice">This browser does not support passkeys. Use an allowed app PIN or password instead.</p> : <form className="security-stack" onSubmit={enroll}><label className="security-field">Confirm your password<SecretInput name="password"  autoComplete="current-password" required disabled={busy}/></label><button className="security-primary" disabled={busy}>{busy ? "Setting up…" : "Set up Face ID or a passkey"}</button></form>}
    </section>
    <section className="security-panel"><h3>Verified devices</h3><p className="security-detail">Revoking access ends the device’s sessions on its next request. Administrators can manage employee devices. Other Owners’ devices are protected.</p>
      {loading ? <p role="status">Loading devices…</p> : !devices.length ? <p>No verified devices found.</p> : <ul className="security-device-list">{devices.map(device => <li key={device.id}><div className="flex items-start gap-3"><Smartphone className="mt-1 shrink-0" size={20} aria-hidden="true"/><div className="min-w-0"><p className="font-semibold">{device.label}{device.id === currentId && <span className="security-badge">This device</span>}</p><p className="security-detail">{device.user.name} · {device._count.passkeys ? "Passkey enrolled" : "Device verified"}</p><p className="security-detail">Last sign-in {new Date(device.lastUsedAt).toLocaleString()}</p></div></div>{revokeId === device.id ? <div className="security-confirm"><p>{device.id === currentId ? "Revoke this device and sign out?" : "Revoke this device’s access?"} Signing in again requires a password and email code.</p><label className="security-field">Confirm your password<SecretInput autoComplete="current-password" value={revokePassword} onChange={e=>setRevokePassword(e.target.value)} disabled={busy}/></label><div className="flex flex-wrap gap-2"><button className="security-danger" disabled={busy || !revokePassword} onClick={() => void revoke(device.id)}>Revoke access</button><button className="security-secondary" disabled={busy} onClick={() => setRevokeId("")}>Cancel</button></div></div> : <button className="security-link security-revoke" disabled={busy} onClick={() => setRevokeId(device.id)} aria-label={`Revoke ${device.label} for ${device.user.name}`}>Revoke access</button>}{canManageDevices&&device.user.role!=="OWNER"&&<DeviceSignInPolicy device={device} onSaved={()=>void load()}/>}</li>)}</ul>}
    </section>
  </div>;
}
