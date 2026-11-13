"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CAPABILITY_CATALOG, PAGE_CATALOG } from "@/lib/access";

type Staff = { id: string; name: string; email: string; role: string; status: string; accessExpiresAt: string | null; accessPages: string[]; accessCapabilities: string[]; biometricsAllowed: boolean; lockedAt: string | null };
export function IndividualEditor() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Staff | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      const response = await fetch("/api/auth/access", { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setStaff(result);
    } catch(e) { setError(e instanceof Error ? e.message : "Access could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Schedule the asynchronous initial fetch after the browser has mounted.
    const controller = new AbortController();
    Promise.resolve().then(() => { if (!controller.signal.aborted) void load(); });
    return () => controller.abort();
  }, [load]);
  function choose(id: string) { setSelected(id); setDraft(staff.find(user => user.id === id) ?? null); setNotice(""); setError(""); }
  function toggle(field: "accessPages" | "accessCapabilities", value: string) {
    setDraft(user => user ? { ...user, [field]: user[field].includes(value) ? user[field].filter(item => item !== value) : [...user[field], value] } : null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft) return; setSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/auth/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresAt: draft.accessExpiresAt, password, userId: draft.id, pages: draft.accessPages, capabilities: draft.accessCapabilities, biometricsAllowed: draft.biometricsAllowed, unlock: draft.lockedAt === null && !!staff.find(user => user.id === draft.id)?.lockedAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setStaff(users => users.map(user => user.id === draft.id ? draft : user)); setPassword(""); setNotice(`Access saved for ${draft.name}. Changes apply on their next request.`);
    } catch(e) { setError(e instanceof Error ? e.message : "Changes could not be saved. Your selections are preserved."); }
    finally { setSaving(false); }
  }
  return <div className="security-stack mx-auto max-w-3xl"><div><p className="security-eyebrow">Owner controls</p><h2>Team access</h2><p className="security-detail">Grant each person the screens and actions they need. Buying costs, profit, expenses, and financial totals stay with the Administrator.</p></div>
    {error && <p role="alert" className="security-error">{error}<button className="security-link" onClick={() => void load()}>Reload accounts</button></p>}{notice && <p role="status" className="security-notice">{notice}</p>}
    {loading ? <p role="status">Loading team accounts…</p> : !staff.length ? <p>No staff accounts found. Create an account in Staff & users first.</p> : <label className="security-field">Team member<select aria-label="Team member" value={selected} onChange={event => choose(event.target.value)} disabled={saving}><option value="">Choose a person</option>{staff.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>}
    {draft && (draft.role === "OWNER" ? <section className="security-panel"><h3>Owner access</h3><p>The configured owner has full access. Owner privileges cannot be assigned through this screen.</p></section> : <form onSubmit={save} className="security-stack"><section className="security-panel"><h3>{draft.name}</h3><p className="security-detail break-words">{draft.email} · {draft.status.replaceAll("_", " ")}</p>{draft.lockedAt && <div className="security-error"><p>Locked after failed sign-ins. Verify this person’s identity before unlocking.</p><button type="button" className="security-secondary" disabled={saving} onClick={() => setDraft({...draft, lockedAt: null})}>Unlock when changes are saved</button></div>}<label className="security-check"><input type="checkbox" checked={draft.biometricsAllowed} disabled={saving} onChange={e=>setDraft({...draft, biometricsAllowed:e.target.checked})}/><span>Allow Face ID and device passkeys</span></label></section>
      <fieldset className="security-panel"><legend>Screens</legend><p className="security-detail">A screen grant controls navigation. Grant the matching action below to enable its operations.</p><div className="grid sm:grid-cols-2">{PAGE_CATALOG.filter(page => !["/finance", "/expenses", "/activity"].includes(page.path) && (draft.role === "BRANCH_MANAGER" || page.path !== "/insights")).map(page => <label className="security-check" key={page.path}><input type="checkbox" checked={draft.accessPages.includes(page.path)} disabled={saving} onChange={()=>toggle("accessPages",page.path)}/><span>{page.label}</span></label>)}</div></fieldset>
      <fieldset className="security-panel"><legend>Actions</legend>{CAPABILITY_CATALOG.map(capability => <label className="security-check" key={capability.id}><input type="checkbox" checked={draft.accessCapabilities.includes(capability.id)} disabled={saving} onChange={()=>toggle("accessCapabilities",capability.id)}/><span>{capability.label}<span className="security-detail block">{capability.detail}</span></span></label>)}</fieldset>
      <label className="security-field">Access expires (optional)<input type="datetime-local" value={draft.accessExpiresAt ? new Date(new Date(draft.accessExpiresAt).getTime() - new Date(draft.accessExpiresAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : ""} onChange={event=>setDraft({...draft, accessExpiresAt:event.target.value ? new Date(event.target.value).toISOString() : null})} disabled={saving}/><span className="security-detail">Leave blank for ongoing access. Expired grants stop authorizing server requests.</span></label>
      <label className="security-field">Confirm your password to save<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={saving}/></label>
      <button className="security-primary" disabled={saving}>{saving ? "Saving access…" : `Save access for ${draft.name}`}</button></form>)}
  </div>;
}
