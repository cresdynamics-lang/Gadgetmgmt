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
  const allPages = grant.role === "OWNER" && grant.pages.includes("*");
  return {
    role: grant.role,
    allPages,
    pages: allPages ? PAGE_CATALOG.map((page) => page.path) : grant.pages.filter((page) => page !== "*"),
    capabilities: grant.capabilities,
  };
}

function pageLock(role: AppRole, path: string, allPages: boolean) {
  if (role === "OWNER" && allPages) return "Included while every screen is on. Turn that off to choose screens one by one.";
  if (path === "/insights" && role !== "OWNER" && role !== "BRANCH_MANAGER") return "Only the owner and a branch manager can open insights.";
  if ((path === "/finance" || path === "/expenses" || path === "/activity") && role !== "OWNER") return "Only the owner can open this.";
  return "";
}

export function EntitlementEditor() {
  const { update } = useSession();
  const [grants, setGrants] = useState<GrantState[]>([]);
  const [roleId, setRoleId] = useState<AppRole>("OWNER");
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
            pages: grant.role === "OWNER" && grant.allPages ? ["*"] : grant.pages.filter((page) => page !== "*" && (page !== "/insights" || grant.role === "OWNER" || grant.role === "BRANCH_MANAGER") && (grant.role === "OWNER" || (page !== "/finance" && page !== "/expenses" && page !== "/activity"))),
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
      setNotice("Role access saved. Staff already signed in pick this up on their next session check.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Role entitlements could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const selected = ROLE_CATALOG.find((role) => role.id === roleId) ?? ROLE_CATALOG[0];
  const grant = grants.find((item) => item.role === roleId);
  const busy = loading || saving || !ready || !grant;
  const screenCount = grant ? (grant.allPages ? PAGE_CATALOG.length : grant.pages.length) : 0;

  return (
    <form method="post" action="/access" onSubmit={save} className="space-y-5">
      <section className="relative overflow-hidden rounded-[22px] border border-[var(--border)] bg-[linear-gradient(115deg,#e5f5ee_0%,#f4f4f2_55%,#e5f5ee_100%)] px-6 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-8 -top-20 h-60 w-60 rounded-full border border-[#e5f5ee]" />
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--accent-text)]"><ShieldCheck className="h-3.5 w-3.5" />Owner only</p>
        <h2 className="mt-2 text-[27px] font-semibold tracking-[-.045em] text-[var(--foreground)] sm:text-[31px]">Role access</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--foreground)]">Choose one role, then the screens it can open and the work it can do. Both are saved together and checked on the server. This screen stays with the owner.</p>
      </section>

      {error ? <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="border-l-2 border-[#0a7d56] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--foreground)]">{notice}</p> : null}

      <div role="tablist" aria-label="Roles" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ROLE_CATALOG.map((role) => {
          const row = grants.find((item) => item.role === role.id);
          const count = row ? (row.allPages ? PAGE_CATALOG.length : row.pages.length) : 0;
          const active = role.id === roleId;
          return (
            <button key={role.id} type="button" role="tab" aria-selected={active} disabled={loading || !ready} onClick={() => setRoleId(role.id)} className={`min-h-16 rounded-2xl border px-3 py-3 text-left transition ${active ? "border-[#0a7d56] bg-[#0a7d56] text-white shadow-[0_8px_18px_rgb(0_0_0/.16)]" : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:border-[#6b6b66]"} disabled:opacity-60`}>
              <span className="block text-sm font-semibold">{role.label}</span>
              <span className={`mt-1 block text-[11px] ${active ? "text-white/75" : "text-[var(--foreground)]"}`}>{role.detail}</span>
              <span className={`mt-2 block text-[10px] font-semibold uppercase tracking-[.12em] ${active ? "text-[#e5f5ee]" : "text-[var(--accent-text)]"}`}>{loading ? "Loading" : row ? `${count} screens` : "Unavailable"}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <p className="text-sm text-[var(--foreground)]">Loading role access…</p>
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--background)]" />
          <div className="h-64 animate-pulse rounded-2xl bg-[var(--background)]" />
        </div>
      ) : grant ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_5px_22px_rgb(0_0_0/.035)]" aria-labelledby="role-screens-heading">
            <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
              <h3 id="role-screens-heading" className="text-sm font-semibold text-[var(--foreground)]">Screens {selected.label} can open</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{screenCount} of {PAGE_CATALOG.length} screens. A screen that is off is refused on the server, including when someone types the address. This role-access screen is not in the list.</p>
            </div>
            <div className="divide-y divide-[#f4f4f2]">
              {grant.role === "OWNER" ? (
                <label className="flex min-h-14 items-start gap-3 px-4 py-3 sm:px-5">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0a7d56]" checked={grant.allPages} disabled={busy} aria-label="All screens for Owner" onChange={(event) => updateGrant(grant.role, (current) => ({ ...current, allPages: event.target.checked, pages: event.target.checked ? PAGE_CATALOG.map((page) => page.path) : current.pages }))} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--foreground)]">Every screen</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-[var(--muted)]">Includes screens added later. This stays with the owner.</span>
                  </span>
                </label>
              ) : (
                <p className="px-4 py-3 text-[11px] leading-5 text-[var(--muted)] sm:px-5">Every screen, including ones added later, stays with the owner.</p>
              )}
              {PAGE_CATALOG.map((page) => {
                const lock = pageLock(grant.role, page.path, grant.allPages);
                const checked = grant.allPages || grant.pages.includes(page.path);
                return (
                  <label key={page.path} className={`flex min-h-14 items-start gap-3 px-4 py-3 sm:px-5 ${lock ? "bg-[var(--panel)]" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[#0a7d56]"
                      checked={checked}
                      disabled={busy || Boolean(lock)}
                      aria-label={`${page.label} for ${selected.label}`}
                      onChange={(event) => updateGrant(grant.role, (current) => ({
                        ...current,
                        pages: event.target.checked ? [...current.pages, page.path] : current.pages.filter((item) => item !== page.path),
                      }))}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--foreground)]">{page.label}</span>
                      {lock ? <span className="mt-0.5 block text-[11px] leading-5 text-[var(--muted)]">{lock}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_5px_22px_rgb(0_0_0/.035)]" aria-labelledby="role-actions-heading">
            <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
              <h3 id="role-actions-heading" className="text-sm font-semibold text-[var(--foreground)]">What {selected.label} can do</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">These are checked on the server. Branch limits, and who may change a staff role, still apply. {grant.capabilities.length} of {CAPABILITY_CATALOG.length} actions are on.</p>
            </div>
            <div className="divide-y divide-[#f4f4f2]">
              {CAPABILITY_CATALOG.map((capability) => (
                <label key={capability.id} className="flex min-h-14 items-start gap-3 px-4 py-3 sm:px-5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#0a7d56]"
                    checked={grant.capabilities.includes(capability.id)}
                    disabled={busy}
                    aria-label={`${capability.label} for ${selected.label}`}
                    onChange={(event) => updateGrant(grant.role, (current) => ({
                      ...current,
                      capabilities: event.target.checked
                        ? [...current.capabilities, capability.id]
                        : current.capabilities.filter((item) => item !== capability.id),
                    }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--foreground)]">{capability.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-[var(--muted)]">{capability.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <div className="sticky bottom-[4.75rem] z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 shadow-[0_8px_24px_rgb(0_0_0/.06)] backdrop-blur lg:bottom-4 sm:px-5">
        <p className="max-w-xl text-xs leading-5 text-[var(--foreground)]">Switching roles keeps your edits. Save writes all four roles together. Passwords and account details stay out of the page address.</p>
        <button disabled={busy} className="min-h-11 rounded-xl bg-[#0a7d56] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0a7d56] disabled:opacity-60">{saving ? "Saving…" : "Save role access"}</button>
      </div>
    </form>
  );
}
