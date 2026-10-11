"use client";

import { Plus, UsersRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/app-shell";

type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  branch: { id: string; name: string; code: string } | null;
  _count: { sales: number };
};

type Branch = { id: string; name: string; code: string };
const roleNames: Record<string, string> = { OWNER: "Administrator", BRANCH_MANAGER: "Branch manager", CASHIER: "Cashier", INVENTORY_LEAD: "Inventory lead" };

export default function StaffPage() {
  const { data: session } = useSession();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStaff() {
    const [staffResponse, branchesResponse] = await Promise.all([fetch("/api/staff", { cache: "no-store" }), fetch("/api/branches", { cache: "no-store" })]);
    const staffData = await staffResponse.json();
    const branchData = await branchesResponse.json();
    if (!staffResponse.ok) throw new Error(staffData.error ?? "Could not load staff records.");
    if (!branchesResponse.ok) throw new Error(branchData.error ?? "Could not load branches.");
    setStaff(staffData);
    setBranches(branchData);
  }

  useEffect(() => {
    async function initialLoad() {
      try {
        await loadStaff();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load staff records.");
      } finally {
        setLoading(false);
      }
    }
    void initialLoad();
  }, []);

  const activeCount = staff.filter((member) => member.status === "ACTIVE").length;
  const canManage = session?.user.role === "OWNER" || session?.user.role === "BRANCH_MANAGER";
  const canManageAccess = session?.user.role === "OWNER";

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), role: data.get("role"), branchId: data.get("branchId") || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Staff account could not be created.");
      await loadStaff();
      form.reset();
      setAdding(false);
      setNotice(`Account created for ${result.name}. Share the initial password securely.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Staff account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAccess(id: string, changes: { role?: string; status?: string }) {
    setSavingMemberId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Staff access could not be updated.");
      setStaff((current) => current.map((member) => member.id === id ? { ...member, role: result.role, status: result.status } : member));
      setNotice("Staff access updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Staff access could not be updated.");
    } finally {
      setSavingMemberId("");
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e2e6e2] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#607266]">People and access</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Staff <span className="ml-1 text-base font-normal text-[#69746c]">{staff.length}</span></h2>
          </div>
          {canManage ? (
            <button type="button" onClick={() => { setAdding((current) => !current); setError(""); }} className="inline-flex items-center gap-2 bg-[#173a2b] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[#24513a]">
              <Plus className="h-4 w-4" /> Add staff account
            </button>
          ) : null}
        </div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

        <div className="grid border-y border-[#dfe4df] bg-white sm:grid-cols-3">
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[#69746c]">Staff accounts</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : staff.length}</p>
          </div>
          <div className="border-b border-[#e8ebe8] px-4 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[#69746c]">Active</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : activeCount}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xs text-[#69746c]">Sales recorded by team</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : staff.reduce((sum, member) => sum + member._count.sales, 0)}</p>
          </div>
        </div>

        {adding && canManage ? (
          <form onSubmit={createStaff} className="border border-[#dfe4df] bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-[#315d3f]" />
              <h3 className="text-sm font-semibold">Create staff login</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs font-medium text-[#526057]">Full name
                <input name="name" required minLength={2} maxLength={120} className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-[#526057]">Work email
                <input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-[#526057]">Initial password
                <input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" className="mt-1 w-full border border-[#d6ddd6] px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-[#526057]">Role
                <select name="role" className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm">
                  {session?.user.role === "OWNER" ? (
                    <>
                      <option value="CASHIER">Cashier</option>
                      <option value="INVENTORY_LEAD">Inventory lead</option>
                      <option value="BRANCH_MANAGER">Branch manager</option>
                      <option value="OWNER">Administrator</option>
                    </>
                  ) : (
                    <>
                      <option value="CASHIER">Cashier</option>
                      <option value="INVENTORY_LEAD">Inventory lead</option>
                    </>
                  )}
                </select>
              </label>
              {session?.user.role === "OWNER" ? (
                <label className="text-xs font-medium text-[#526057]">Branch
                  <select name="branchId" defaultValue={session.user.branchId ?? ""} className="mt-1 w-full border border-[#d6ddd6] bg-white px-3 py-2.5 text-sm">
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#69746c]">Use a unique 12+ character password and share it through a private channel.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdding(false)} className="border border-[#d6ddd6] px-3.5 py-2 text-sm font-medium">Cancel</button>
                <button disabled={saving} className="bg-[#173a2b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creating…" : "Create account"}</button>
              </div>
            </div>
          </form>
        ) : null}

        <section className="border border-[#dfe4df] bg-white">
          <div className="border-b border-[#e8ebe8] px-4 py-3.5">
            <h3 className="text-sm font-semibold">Staff directory</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]">
                <tr>
                  <th className="px-4 py-3 font-medium">Staff member</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Sales</th>
                  <th className="px-4 py-3 font-medium">Account status</th>
                  {canManageAccess ? <th className="px-4 py-3 font-medium">Access controls</th> : null}
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0ed]">
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{member.name}</p>
                      <p className="mt-1 text-xs text-[#69746c]">{member.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {canManageAccess && member.id !== session?.user.id ? (
                        <select aria-label={`Role for ${member.name}`} value={member.role} disabled={savingMemberId === member.id} onChange={(event) => void updateAccess(member.id, { role: event.target.value })} className="border border-[#d6ddd6] bg-white px-2 py-1.5 text-sm disabled:opacity-60">
                          <option value="OWNER">Administrator</option>
                          <option value="BRANCH_MANAGER">Branch manager</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="INVENTORY_LEAD">Inventory lead</option>
                        </select>
                      ) : roleNames[member.role] ?? member.role}
                    </td>
                    <td className="px-4 py-3 text-[#69746c]">{member.branch?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{member._count.sales}</td>
                    <td className="px-4 py-3">
                      {canManageAccess && member.id !== session?.user.id ? (
                        <select aria-label={`Status for ${member.name}`} value={member.status} disabled={savingMemberId === member.id} onChange={(event) => void updateAccess(member.id, { status: event.target.value })} className="border border-[#d6ddd6] bg-white px-2 py-1.5 text-sm disabled:opacity-60">
                          <option value="ACTIVE">Active</option>
                          <option value="OFF_SHIFT">Off shift</option>
                          <option value="SUSPENDED">Suspended</option>
                        </select>
                      ) : <span className={`text-xs ${member.status === "ACTIVE" ? "text-[#42684a]" : "text-[#995338]"}`}>{member.status.replace("_", " ")}</span>}
                    </td>
                    {canManageAccess ? <td className="px-4 py-3 text-xs text-[#69746c]">{member.id === session?.user.id ? "Current account" : savingMemberId === member.id ? "Saving…" : "Changes save immediately"}</td> : null}
                    <td className="px-4 py-3 text-xs text-[#69746c]">{new Date(member.createdAt).toLocaleDateString("en-KE")}</td>
                  </tr>
                ))}
                {!loading && !staff.length ? (
                  <tr>
                    <td colSpan={canManageAccess ? 7 : 6} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold">No staff accounts found</p>
                      <p className="mt-1 text-sm text-[#69746c]">Create a staff account to grant a team member access.</p>
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={canManageAccess ? 7 : 6} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading staff records…</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
