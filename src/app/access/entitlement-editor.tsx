"use client";

import { ShieldCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";

import { CAPABILITY_CATALOG, PAGE_CATALOG, ROLE_CATALOG, ROLE_IDS, type AccessCapability, type AppRole } from "@/lib/access";

type GrantState = {
  role: AppRole;
  allPages: boolean;
  pages: string[];
  capabilities: AccessCapability[];
};

type GrantResponse = {
  role: AppRole;
  pages: string[];
  capabilities: AccessCapability[];
};

function toState(grant: GrantResponse): GrantState {
  const allPages = grant.pages.includes("*");
  return {
    role: grant.role,
    allPages,
    pages: allPages ? PAGE_CATALOG.map((page) => page.path) : grant.pages,
    capabilities: grant.capabilities,
  };
}

export function EntitlementEditor() {
  const { update } = useSession();
  const [grants, setGrants] = useState<GrantState[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/entitlements", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Role entitlements could not be loaded.");
        const rows = Array.isArray(result.grants) ? result.grants as GrantResponse[] : [];
        if (rows.length !== ROLE_IDS.length || ROLE_IDS.some((role) => !rows.some((row) => row.role === role))) {
          throw new Error("Role entitlements could not be loaded.");
        }
        setGrants(ROLE_IDS.map((role) => toState(rows.find((row) => row.role === role) ?? { role, pages: [], capabilities: [] })));
        setReady(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Role entitlements could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function updateGrant(role: AppRole, change: (grant: GrantState) => GrantState) {
    setGrants((current) => current.map((grant) => grant.role === role ? change(grant) : grant));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/entitlements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grants: grants.map((grant) => ({
            role: grant.role,
            pages: grant.role === "OWNER" && grant.allPages ? ["*"] : grant.pages.filter((page) => page !== "*" && (page !== "/insights" || grant.role === "OWNER" || grant.role === "BRANCH_MANAGER")),
            capabilities: grant.capabilities,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Role entitlements could not be saved.");
      const rows = Array.isArray(result.grants) ? result.grants as GrantResponse[] : [];
      if (rows.length !== ROLE_IDS.length || ROLE_IDS.some((role) => !rows.some((row) => row.role === role))) {
        throw new Error("Role entitlements could not be saved.");
      }
      setGrants(ROLE_IDS.map((role) => toState(rows.find((row) => row.role === role) ?? { role, pages: [], capabilities: [] })));
      await update();
      setNotice("Role entitlements saved. Staff already signed in pick this up on their next session check.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Role entitlements could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form method="post" action="/access" onSubmit={save} className="space-y-5">
      <section className="relative overflow-hidden rounded-[22px] border border-[#dcebe0] bg-[linear-gradient(115deg,#e8f5ec_0%,#f6faf6_55%,#eef6f1_100%)] px-6 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full border border-[#d2e8d8]" />
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#438061]"><ShieldCheck className="h-3.5 w-3.5" />Owner only</p>
        <h2 className="mt-2 text-[27px] font-semibold tracking-[-.045em] text-[#20382c] sm:text-[31px]">Role access</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-[#6f8376]">Choose the pages and actions for each role. Only the Gadgethub owner can open or change this screen. That check runs on the server. All-pages access stays with the owner, and business insights stay with the owner and branch managers.</p>
      </section>

      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="border-l-2 border-[#6a843f] bg-[#f2f6ec] px-4 py-3 text-sm text-[#31533a]">{notice}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-[#e2e9e2] bg-white shadow-[0_5px_22px_rgba(24,54,37,.035)]">
        <div className="border-b border-[#e8ebe8] px-4 py-4 sm:px-5">
          <h3 className="text-sm font-semibold text-[#23372b]">Pages</h3>
          <p className="mt-1 text-xs text-[#819087]">All pages includes current and future screens. This role-access screen stays with the owner either way.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]">
              <tr>
                <th className="px-4 py-3 font-medium">Page</th>
                {ROLE_CATALOG.map((role) => <th key={role.id} className="px-4 py-3 font-medium">{role.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ed]">
              <tr>
                <td className="px-4 py-3 font-medium text-[#263b2e]">All pages</td>
                {grants.map((grant) => (
                  <td key={grant.role} className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={grant.allPages}
                      disabled={loading || saving || !ready || grant.role !== "OWNER"}
                      aria-label={`All pages for ${ROLE_CATALOG.find((role) => role.id === grant.role)?.label ?? grant.role}`}
                      onChange={(event) => updateGrant(grant.role, (current) => ({ ...current, allPages: event.target.checked, pages: event.target.checked ? PAGE_CATALOG.map((page) => page.path) : current.pages }))}
                    />
                  </td>
                ))}
              </tr>
              {PAGE_CATALOG.map((page) => (
                <tr key={page.path}>
                  <td className="px-4 py-3 text-[#263b2e]">{page.label}</td>
                  {grants.map((grant) => {
                    const checked = grant.allPages || grant.pages.includes(page.path);
                    return (
                      <td key={grant.role} className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={loading || saving || !ready || grant.allPages || (page.path === "/insights" && grant.role !== "OWNER" && grant.role !== "BRANCH_MANAGER")}
                          aria-label={`${page.label} for ${ROLE_CATALOG.find((role) => role.id === grant.role)?.label ?? grant.role}`}
                          onChange={(event) => updateGrant(grant.role, (current) => ({
                            ...current,
                            pages: event.target.checked ? [...current.pages, page.path] : current.pages.filter((item) => item !== page.path),
                          }))}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#e2e9e2] bg-white shadow-[0_5px_22px_rgba(24,54,37,.035)]">
        <div className="border-b border-[#e8ebe8] px-4 py-4 sm:px-5">
          <h3 className="text-sm font-semibold text-[#23372b]">Capabilities</h3>
          <p className="mt-1 text-xs text-[#819087]">APIs check these on the server. Existing limits, such as branch scoping and who may change a staff role, still apply.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[#e8ebe8] bg-[#f7f8f6] text-xs text-[#66736a]">
              <tr>
                <th className="px-4 py-3 font-medium">Capability</th>
                {ROLE_CATALOG.map((role) => <th key={role.id} className="px-4 py-3 font-medium">{role.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ed]">
              {CAPABILITY_CATALOG.map((capability) => (
                <tr key={capability.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#263b2e]">{capability.label}</p>
                    <p className="mt-1 text-[11px] text-[#87948c]">{capability.detail}</p>
                  </td>
                  {grants.map((grant) => (
                    <td key={grant.role} className="px-4 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={grant.capabilities.includes(capability.id)}
                        disabled={loading || saving || !ready}
                        aria-label={`${capability.label} for ${ROLE_CATALOG.find((role) => role.id === grant.role)?.label ?? grant.role}`}
                        onChange={(event) => updateGrant(grant.role, (current) => ({
                          ...current,
                          capabilities: event.target.checked
                            ? [...current.capabilities, capability.id]
                            : current.capabilities.filter((item) => item !== capability.id),
                        }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && !grants.length ? (
                <tr>
                  <td colSpan={ROLE_CATALOG.length + 1} className="px-4 py-8 text-center text-sm text-[#69746c]">Role entitlements could not be shown.</td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={ROLE_CATALOG.length + 1} className="px-4 py-8 text-center text-sm text-[#69746c]">Loading role entitlements…</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eee8] bg-[#fbfdfb] px-4 py-4 sm:px-5">
          <p className="max-w-xl text-xs text-[#69746c]">Passwords and account details are not sent in the page address. Saving uses the signed-in session.</p>
          <button disabled={loading || saving || !ready} className="rounded-xl bg-[#174b37] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#236347] disabled:opacity-60">{saving ? "Saving…" : "Save entitlements"}</button>
        </div>
      </section>
    </form>
  );
}
