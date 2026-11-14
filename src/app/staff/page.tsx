"use client";
import { PasswordChoice } from "@/components/password-choice";
import { PasswordReset } from "@/components/password-reset";
import { SecretInput } from "@/components/secret-input";

import { ArrowUpRight, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
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
  const [initialPassword,setInitialPassword]=useState("");
  const [resetUser,setResetUser]=useState<StaffMember|null>(null);
  const [handover,setHandover]=useState<{name:string;email:string;password:string}|null>(null);
  const [canProvisionOwners, setCanProvisionOwners] = useState(false);
  const [newRole, setNewRole] = useState("CASHIER");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<"ALL" | "ACTIVE" | "ATTENTION">("ALL");

  async function loadStaff() {
    const [staffResponse, branchesResponse] = await Promise.all([fetch("/api/staff", { cache: "no-store" }), fetch("/api/branches", { cache: "no-store" })]);
    const staffData = await staffResponse.json();
    const branchData = await branchesResponse.json();
    if (!staffResponse.ok) throw new Error(staffData.error ?? "Could not load staff records.");
    if (!branchesResponse.ok) throw new Error(branchData.error ?? "Could not load branches.");
    setStaff(staffData);
    setCanProvisionOwners(staffResponse.headers.get("X-Can-Provision-Owners") === "true");
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
  const attentionCount = staff.filter((member) => member.status !== "ACTIVE").length;
  const filteredStaff = staff.filter((member) => {
    const matchesSearch = `${member.name} ${member.email} ${member.branch?.name ?? ""} ${roleNames[member.role] ?? member.role}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = teamFilter === "ALL" || (teamFilter === "ACTIVE" ? member.status === "ACTIVE" : member.status !== "ACTIVE");
    return matchesSearch && matchesStatus;
  });

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
        body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), role: data.get("role"), emailCredentials: data.get("emailCredentials")==="on", actorPassword: data.get("actorPassword") || undefined, branchId: data.get("branchId") || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Staff account could not be created.");
      await loadStaff();
      form.reset();
      setAdding(false);
      setHandover(result.emailStatus==="accepted"?null:{name:result.name,email:result.email,password:initialPassword});
      setInitialPassword("");
      setNotice(`Account created for ${result.name}. ${result.emailStatus==="accepted"?"Email accepted for delivery.":result.emailStatus==="unconfirmed"?"Email delivery is unconfirmed. Share the password privately, or reset and email a new one.":"Email was not requested. Share the password privately."}`);
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
    <>
      <div className="space-y-5">
        <div className="staff-welcome relative flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-[22px] border border-[var(--border)] bg-[linear-gradient(115deg,#e5f5ee_0%,#f4f4f2_55%,#e5f5ee_100%)] px-6 py-6 sm:px-7">
          <div className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full border border-[#e5f5ee]"/><div className="pointer-events-none absolute right-9 -top-14 h-44 w-44 rounded-full border border-[#e5f5ee]"/>
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--accent-text)]"><ShieldCheck className="h-3.5 w-3.5"/>People make the difference</p>
            <h2 className="mt-2 text-[27px] font-semibold tracking-[-.045em] text-[var(--foreground)] sm:text-[31px]">Meet your team</h2><p className="mt-1.5 text-sm text-[var(--foreground)]">A thoughtful team makes every customer visit better.</p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            {canManageAccess ? <Link href="/access" className="inline-flex items-center gap-2 rounded-xl border border-[#0a7d56] bg-[var(--panel)] px-4 py-3 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--accent-soft)]">Role access</Link> : null}
            {canManage ? (
              <button type="button" onClick={() => { setAdding((current) => !current); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-[#0a7d56] px-4 py-3 text-sm font-semibold text-white shadow-[0_7px_18px_rgb(0_0_0/.16)] hover:bg-[#0a7d56]">
                <Plus className="h-4 w-4" /> Add a teammate <ArrowUpRight className="ml-1 h-4 w-4 text-white/60"/>
              </button>
            ) : null}
          </div>
        </div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#0a7d56] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]">{notice}</p> : null}

        {handover&&<section className="security-panel security-stack"><h3>Share privately with {handover.name}</h3><p className="security-detail">{handover.email}. This password is available here only until you dismiss this panel.</p><label className="security-field">Initial password<SecretInput readOnly value={handover.password} autoComplete="off"/></label><button className="security-secondary" onClick={()=>setHandover(null)}>Done</button></section>}
        {resetUser&&<PasswordReset key={resetUser.id} user={resetUser} onClose={()=>setResetUser(null)} onDone={()=>void loadStaff().catch(()=>setError("Password reset completed. Reload the team list."))}/>}
        <div className="staff-metrics grid gap-3 sm:grid-cols-3">
          <div className="border-b border-[var(--border)] px-4 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[var(--foreground)]">Staff accounts</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : staff.length}</p>
          </div>
          <div className="border-b border-[var(--border)] px-4 py-4 sm:border-b-0 sm:border-r">
            <p className="text-xs text-[var(--foreground)]">Active</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : activeCount}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xs text-[var(--foreground)]">Sales recorded by team</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : staff.reduce((sum, member) => sum + member._count.sales, 0)}</p>
          </div>
        </div>

        {adding && canManage ? (
          <form method="post" action="/staff" onSubmit={createStaff} className="border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-[var(--accent-text)]" />
              <h3 className="text-sm font-semibold">Create staff login</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs font-medium text-[var(--foreground)]">Full name
                <input name="name" required minLength={2} maxLength={120} className="mt-1 w-full border border-[var(--border)] px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-medium text-[var(--foreground)]">Work email
                <input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1 w-full border border-[var(--border)] px-3 py-2.5 text-sm" />
              </label>
              <PasswordChoice label="Initial password" value={initialPassword} onChange={setInitialPassword} disabled={saving}/>
              <label className="text-xs font-medium text-[var(--foreground)]">Role
                <select name="role" value={newRole} onChange={event=>setNewRole(event.target.value)} className="mt-1 w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm">
                  {session?.user.role === "OWNER" ? (
                    <>
                      <option value="CASHIER">Cashier</option>
                      <option value="INVENTORY_LEAD">Inventory lead</option>
                      <option value="BRANCH_MANAGER">Branch manager</option>
                      {canProvisionOwners && <option value="OWNER">Owner</option>}
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
                <label className="text-xs font-medium text-[var(--foreground)]">Branch
                  <select name="branchId" defaultValue={session.user.branchId ?? ""} className="mt-1 w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-sm">
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <label className="security-check mt-4"><input name="emailCredentials" type="checkbox" defaultChecked disabled={saving}/>Email the account credentials to this person</label>
            {newRole === "OWNER" && <div className="security-stack mt-4"><p className="security-notice">Owners receive full access, including finance. Owners cannot block, demote, revoke or change one another’s accounts.</p><label className="security-field">Confirm your current password<SecretInput name="actorPassword" autoComplete="current-password" required disabled={saving}/></label></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--foreground)]">Use a unique 12+ character password and share it through a private channel.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdding(false)} className="border border-[var(--border)] px-3.5 py-2 text-sm font-medium">Cancel</button>
                <button disabled={saving} className="bg-[#0a0a0a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Creating…" : "Create account"}</button>
              </div>
            </div>
          </form>
        ) : null}

        <section className="staff-directory overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_5px_22px_rgb(0_0_0/.035)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div><h3 className="text-sm font-semibold text-[var(--foreground)]">Your people</h3><p className="mt-1 text-xs text-[var(--muted)]">{staff.length} team {staff.length === 1 ? "member" : "members"}</p></div>
            <label className="flex min-w-[210px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted)] focus-within:border-[#6b6b66] focus-within:ring-4 focus-within:ring-[#e5f5ee]"><Search className="h-4 w-4"/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search team" placeholder="Find a teammate..." className="w-full border-0 bg-transparent outline-none placeholder:text-[var(--muted)]"/></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3 sm:px-5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">View</span>
            {[{ id: "ALL", label: "Everyone", count: staff.length }, { id: "ACTIVE", label: "Active", count: activeCount }, { id: "ATTENTION", label: "Needs attention", count: attentionCount }].map((option) => <button key={option.id} type="button" aria-pressed={teamFilter === option.id} onClick={() => setTeamFilter(option.id as typeof teamFilter)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${teamFilter === option.id ? "border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent-text)]" : "border-transparent bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--foreground)]"}`}><span>{option.label}</span><span className={`tabular-nums ${teamFilter === option.id ? "text-[var(--muted)]" : "text-[var(--muted)]"}`}>{loading ? "—" : option.count}</span></button>)}
            <span className="ml-auto hidden text-[10px] text-[var(--muted)] sm:inline">Select a member to review access</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)]">
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
              <tbody className="divide-y divide-[#f4f4f2]">
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[var(--accent-soft)] text-xs font-bold tracking-wide text-[var(--accent-text)] ring-1 ring-[var(--border)]">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold text-[var(--foreground)]">{member.name}</p><p className="mt-1 truncate text-[11px] text-[var(--muted)]">{member.email}</p></div></div>
                    </td>
                    <td className="px-4 py-3">
                      {canManageAccess && member.role !== "OWNER" && member.id !== session?.user.id ? (
                        <select aria-label={`Role for ${member.name}`} value={member.role} disabled={savingMemberId === member.id} onChange={(event) => void updateAccess(member.id, { role: event.target.value })} className="border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm disabled:opacity-60">
                          <option value="BRANCH_MANAGER">Branch manager</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="INVENTORY_LEAD">Inventory lead</option>
                        </select>
                      ) : <span className="inline-flex rounded-full bg-[var(--background)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)]">{roleNames[member.role] ?? member.role}</span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{member.branch?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{member._count.sales}</td>
                    <td className="px-4 py-3">
                      {canManageAccess && member.role !== "OWNER" && member.id !== session?.user.id ? (
                        <select aria-label={`Status for ${member.name}`} value={member.status} disabled={savingMemberId === member.id} onChange={(event) => void updateAccess(member.id, { status: event.target.value })} className="border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm disabled:opacity-60">
                          <option value="ACTIVE">Active</option>
                          <option value="OFF_SHIFT">Off shift</option>
                          <option value="SUSPENDED">Suspended</option>
                        </select>
                      ) : <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${member.status === "ACTIVE" ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : member.status === "SUSPENDED" ? "bg-[var(--danger-soft)] text-[var(--danger-text)]" : "bg-[var(--background)] text-[var(--warning-text)]"}`}><span className={`h-1.5 w-1.5 rounded-full ${member.status === "ACTIVE" ? "bg-[#0a7d56]" : member.status === "SUSPENDED" ? "bg-[#b3261e]" : "bg-[#8a5a12]"}`}/>{member.status.replace("_", " ")}</span>}
                    </td>
                    {canManageAccess ? <td className="px-4 py-3 text-xs text-[var(--foreground)]">{member.id === session?.user.id ? "Current account" : member.role === "OWNER" ? "Protected Owner" : savingMemberId === member.id ? "Saving…" : "Changes save immediately"}{member.role!=="OWNER"&&<button type="button" className="security-link block" aria-label={`Reset password for ${member.name}`} onClick={()=>setResetUser(member)}>Reset password</button>}</td> : null}
                    <td className="px-4 py-3 text-xs text-[var(--foreground)]">{new Date(member.createdAt).toLocaleDateString("en-KE")}</td>
                  </tr>
                ))}
                {!loading && !filteredStaff.length ? (
                  <tr>
                    <td colSpan={canManageAccess ? 7 : 6} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold">{query ? "No teammates match that search" : staff.length ? "No teammates in this view" : "Your team is just getting started"}</p>
                      <p className="mt-1 text-sm text-[var(--foreground)]">{query ? "Try another name, role, email or branch." : staff.length ? "Choose another team filter to see more people." : "Create a staff account to welcome someone to the team."}</p>
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={canManageAccess ? 7 : 6} className="px-4 py-8 text-center text-sm text-[var(--foreground)]">Loading staff records…</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
