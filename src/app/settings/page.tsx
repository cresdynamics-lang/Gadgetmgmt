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
      <div className="space-y-5">
        <div className="border-b border-[#e2e6e2] pb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">Configuration</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Business settings</h2></div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}
        {selected ? <form key={selected.id} onSubmit={saveBranch} className="border border-[#dfe4df] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe8] px-4 py-3.5"><div><h3 className="text-sm font-semibold">Branch profile</h3><p className="mt-1 text-xs text-[#69746c]">Contact and identity details used by store operations</p></div>{session?.user.role === "OWNER" && branches.length > 1 ? <select aria-label="Select branch" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="border border-[#d6ddd6] bg-white px-3 py-2 text-sm">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} · {branch.code}</option>)}</select> : null}</div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-[#526057]">Branch name<input name="name" required minLength={2} maxLength={120} defaultValue={selected.name} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
            <label className="text-xs font-medium text-[#526057]">Branch code<input name="code" required minLength={2} maxLength={20} defaultValue={selected.code} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm uppercase text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
            <label className="text-xs font-medium text-[#526057] sm:col-span-2">Address<input name="address" required minLength={4} maxLength={240} defaultValue={selected.address} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
            <label className="text-xs font-medium text-[#526057]">Phone<input name="phone" type="tel" required minLength={7} maxLength={30} defaultValue={selected.phone} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
            <label className="text-xs font-medium text-[#526057]">Business email <span className="font-normal">(optional)</span><input name="email" type="email" maxLength={254} defaultValue={selected.email ?? ""} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm text-[#17211b] outline-none focus:border-[#315d3f]" /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8ebe8] px-4 py-3"><span className="text-xs text-[#69746c]">Branch status: {selected.isActive ? "Active" : "Inactive"}</span><button disabled={saving} className="inline-flex items-center gap-2 bg-[#173a2b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#24513a] disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save branch profile"}</button></div>
        </form> : <div className="border border-[#dfe4df] bg-white p-6 text-sm text-[#69746c]">{loading ? "Loading branch settings…" : "No branch is assigned to this account."}</div>}
        <section className="border border-[#dfe4df] bg-white"><div className="border-b border-[#e8ebe8] px-4 py-3.5"><h3 className="text-sm font-semibold">Signed-in account</h3></div><dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-3"><div><dt className="text-xs text-[#69746c]">Name</dt><dd className="mt-1 text-sm font-medium">{session?.user.name ?? "Loading…"}</dd></div><div><dt className="text-xs text-[#69746c]">Email</dt><dd className="mt-1 break-all text-sm font-medium">{session?.user.email ?? "—"}</dd></div><div><dt className="text-xs text-[#69746c]">Access role</dt><dd className="mt-1 text-sm font-medium">{session?.user.role ? roleNames[session.user.role] ?? session.user.role : "—"}</dd></div></dl></section>
      </div>
    </AppShell>
  );
}
