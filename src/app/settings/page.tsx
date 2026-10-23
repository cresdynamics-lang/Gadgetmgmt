"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/app-shell";

type Branch = { id: string; name: string; code: string; address: string; phone: string; email: string | null; isActive: boolean };
const roleNames: Record<string, string> = { OWNER: "Administrator", BRANCH_MANAGER: "Branch manager", CASHIER: "Cashier", INVENTORY_LEAD: "Inventory lead" };

export default function SettingsPage() {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = branches.find((branch) => branch.id === selectedId) ?? branches[0];

  async function loadBranches() {
    const response = await fetch("/api/branches", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load branch profile.");
    setBranches(data);
    setSelectedId((current) => current || data[0]?.id || "");
  }

  useEffect(() => {
    async function initialLoad() {
      try {
        await loadBranches();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load branch profile.");
      } finally {
        setLoading(false);
      }
    }
    void initialLoad();
  }, []);

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/branches/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), code: data.get("code"), address: data.get("address"), phone: data.get("phone"), email: data.get("email") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Branch profile could not be saved.");
      setBranches((current) => current.map((branch) => branch.id === result.id ? result : branch));
      setNotice("Branch profile saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Branch profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="settings-workspace space-y-5">
        <div className="settings-hero rounded-2xl border border-[#e5e5e5] bg-white px-5 py-5 shadow-[0_4px_18px_rgba(0,0,0,.035)] sm:px-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4a4a4a]">Configuration</p><h2 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#111111]">Business settings</h2><p className="mt-1.5 text-sm text-[#77837a]">Manage branch identity and review the account you’re signed in with.</p></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#4a4a4a] bg-[#f5f5f5] px-4 py-3 text-sm text-[#1a1a1a]">{notice}</p> : null}
        {selected ? <form key={selected.id} onSubmit={saveBranch} className="settings-branch-card overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_6px_22px_rgba(0,0,0,.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] bg-[#f5f5f5] px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-[#1a1a1a]">Branch profile</h3><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${selected.isActive ? "bg-[#f5f5f5] text-[#2d2d2d]" : "bg-[#f1f3f1] text-[#718078]"}`}>{selected.isActive ? "Active" : "Inactive"}</span></div><p className="mt-1 text-xs text-[#77847a]">Contact and identity details used across store operations</p></div>{session?.user.role === "OWNER" && branches.length > 1 ? <label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#849087]">Branch<select aria-label="Select branch" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block min-w-48 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[#1a1a1a]">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select></label> : null}</div>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="text-xs font-medium text-[#526057]">Branch name<input name="name" required minLength={2} maxLength={120} defaultValue={selected.name} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
            <label className="text-xs font-medium text-[#526057]">Branch code<input name="code" required minLength={2} maxLength={20} defaultValue={selected.code} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm uppercase text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
            <label className="text-xs font-medium text-[#526057] sm:col-span-2">Address<input name="address" required minLength={4} maxLength={240} defaultValue={selected.address} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
            <label className="text-xs font-medium text-[#526057]">Phone<input name="phone" type="tel" required minLength={7} maxLength={30} defaultValue={selected.phone} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
            <label className="text-xs font-medium text-[#526057]">Business email <span className="font-normal">(optional)</span><input name="email" type="email" maxLength={254} defaultValue={selected.email ?? ""} className="mt-1 w-full border border-[#c4c4c4] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#1a1a1a]" /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e5e5] bg-[#f5f5f5] px-5 py-4 sm:px-6"><span className="text-xs text-[#77847a]">Changes apply to this branch only.</span><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2d2d2d] disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save branch profile"}</button></div>
        </form> : <div className="border border-[#e5e5e5] bg-white p-6 text-sm text-[#69746c]">{loading ? "Loading branch settings…" : "No branch is assigned to this account."}</div>}
        <section className="settings-account-card overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_4px_18px_rgba(0,0,0,.03)]"><div className="border-b border-[#e5e5e5] bg-[#f5f5f5] px-5 py-4 sm:px-6"><h3 className="text-sm font-semibold text-[#1a1a1a]">Signed-in account</h3><p className="mt-1 text-xs text-[#77847a]">Your current identity and access level</p></div><dl className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">{[["Name", session?.user.name ?? "Loading…"], ["Email", session?.user.email ?? "—"], ["Access role", session?.user.role ? roleNames[session.user.role] ?? session.user.role : "—"]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] p-3"><dt className="text-[9px] font-bold uppercase tracking-[.12em] text-[#849087]">{label}</dt><dd className="mt-1.5 break-all text-sm font-semibold text-[#1a1a1a]">{value}</dd></div>)}</dl></section>
      </div>
    </AppShell>
  );
}
