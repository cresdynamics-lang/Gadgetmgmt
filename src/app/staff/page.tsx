"use client";

import { ArrowUpRight, Plus, Search, ShieldCheck, UsersRound } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<"ALL" | "ACTIVE" | "ATTENTION">("ALL");

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
        <div className="staff-welcome relative flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-[22px] border border-[#dcebe0] bg-[linear-gradient(115deg,#e8f5ec_0%,#f6faf6_55%,#eef6f1_100%)] px-6 py-6 sm:px-7">
          <div className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full border border-[#d2e8d8]"/><div className="pointer-events-none absolute right-9 -top-14 h-44 w-44 rounded-full border border-[#d2e8d8]"/>
          <div>
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#438061]"><ShieldCheck className="h-3.5 w-3.5"/>People make the difference</p>
            <h2 className="mt-2 text-[27px] font-semibold tracking-[-.045em] text-[#20382c] sm:text-[31px]">Meet your team</h2><p className="mt-1.5 text-sm text-[#6f8376]">A thoughtful team makes every customer visit better.</p>
          </div>
          {canManage ? (
            <button type="button" onClick={() => { setAdding((current) => !current); setError(""); }} className="relative inline-flex items-center gap-2 rounded-xl bg-[#174b37] px-4 py-3 text-sm font-semibold text-white shadow-[0_7px_18px_rgba(23,75,55,.16)] hover:bg-[#236347]">
              <Plus className="h-4 w-4" /> Add a teammate <ArrowUpRight className="ml-1 h-4 w-4 text-white/60"/>
            </button>
          ) : null}
        </div>
        {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

        <div className="staff-metrics grid gap-3 sm:grid-cols-3">
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

        <section className="staff-directory overflow-hidden rounded-2xl border border-[#e2e9e2] bg-white shadow-[0_5px_22px_rgba(24,54,37,.035)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ebe8] px-4 py-4 sm:px-5">
            <div><h3 className="text-sm font-semibold text-[#23372b]">Your people</h3><p className="mt-1 text-xs text-[#819087]">{staff.length} team {staff.length === 1 ? "member" : "members"}</p></div>
            <label className="flex min-w-[210px] items-center gap-2 rounded-xl border border-[#e5ece7] bg-[#fafcfa] px-3 py-2 text-xs text-[#839087] focus-within:border-[#8ebba2] focus-within:ring-4 focus-within:ring-[#dcefe3]"><Search className="h-4 w-4"/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search team" placeholder="Find a teammate..." className="w-full border-0 bg-transparent outline-none placeholder:text-[#a2aea7]"/></label>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#edf1ed] bg-[#fcfdfc] px-4 py-3 sm:px-5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#98a49c]">View</span>
            {[{ id: "ALL", label: "Everyone", count: staff.length }, { id: "ACTIVE", label: "Active", count: activeCount }, { id: "ATTENTION", label: "Needs attention", count: attentionCount }].map((option) => <button key={option.id} type="button" aria-pressed={teamFilter === option.id} onClick={() => setTeamFilter(option.id as typeof teamFilter)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold transition ${teamFilter === option.id ? "border-[#cde2d2] bg-[#edf7ef] text-[#34724d]" : "border-transparent bg-white text-[#829087] hover:border-[#e3ebe4] hover:text-[#516858]"}`}><span>{option.label}</span><span className={`tabular-nums ${teamFilter === option.id ? "text-[#669274]" : "text-[#a0aba3]"}`}>{loading ? "—" : option.count}</span></button>)}
            <span className="ml-auto hidden text-[10px] text-[#98a49c] sm:inline">Select a member to review access</span>
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
                {filteredStaff.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#eaf4ed] text-xs font-bold tracking-wide text-[#326247] ring-1 ring-[#dcebe0]">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold text-[#263b2e]">{member.name}</p><p className="mt-1 truncate text-[11px] text-[#87948c]">{member.email}</p></div></div>
                    </td>
                    <td className="px-4 py-3">
                      {canManageAccess && member.id !== session?.user.id ? (
                        <select aria-label={`Role for ${member.name}`} value={member.role} disabled={savingMemberId === member.id} onChange={(event) => void updateAccess(member.id, { role: event.target.value })} className="border border-[#d6ddd6] bg-white px-2 py-1.5 text-sm disabled:opacity-60">
                          <option value="OWNER">Administrator</option>
                          <option value="BRANCH_MANAGER">Branch manager</option>
                          <option value="CASHIER">Cashier</option>
                          <option value="INVENTORY_LEAD">Inventory lead</option>
                        </select>
                      ) : <span className="inline-flex rounded-full bg-[#f2f5f2] px-2.5 py-1 text-[11px] font-semibold text-[#5f7165]">{roleNames[member.role] ?? member.role}</span>}
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
                      ) : <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${member.status === "ACTIVE" ? "bg-[#eaf6ed] text-[#367d50]" : member.status === "SUSPENDED" ? "bg-[#fff0ed] text-[#aa5543]" : "bg-[#f4f2ea] text-[#897948]"}`}><span className={`h-1.5 w-1.5 rounded-full ${member.status === "ACTIVE" ? "bg-[#50a56c]" : member.status === "SUSPENDED" ? "bg-[#d97864]" : "bg-[#c1a854]"}`}/>{member.status.replace("_", " ")}</span>}
                    </td>
                    {canManageAccess ? <td className="px-4 py-3 text-xs text-[#69746c]">{member.id === session?.user.id ? "Current account" : savingMemberId === member.id ? "Saving…" : "Changes save immediately"}</td> : null}
                    <td className="px-4 py-3 text-xs text-[#69746c]">{new Date(member.createdAt).toLocaleDateString("en-KE")}</td>
                  </tr>
                ))}
                {!loading && !filteredStaff.length ? (
                  <tr>
                    <td colSpan={canManageAccess ? 7 : 6} className="px-4 py-10 text-center">
                      <p className="text-sm font-semibold">{query ? "No teammates match that search" : staff.length ? "No teammates in this view" : "Your team is just getting started"}</p>
                      <p className="mt-1 text-sm text-[#69746c]">{query ? "Try another name, role, email or branch." : staff.length ? "Choose another team filter to see more people." : "Create a staff account to welcome someone to the team."}</p>
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
