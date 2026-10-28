"use client";

import {
  DEFAULT_APPROVAL_SESSION_MINUTES,
  allPermissions,
  canBeConditioned,
  ownerOnlyPermissions,
  permissionGroupLabel,
  permissionLabels,
  permissionsForRole,
  type Permission,
  type PermissionGrantMode,
} from "@/lib/access";

export type GrantDraft = Record<string, { mode: PermissionGrantMode; sessionMinutes: number }>;

export function draftsFromGrants(grants: { permission: string; mode: PermissionGrantMode; sessionMinutes?: number | null }[]) {
  return Object.fromEntries(grants.map((grant) => [grant.permission, {
    mode: grant.mode,
    sessionMinutes: grant.sessionMinutes ?? DEFAULT_APPROVAL_SESSION_MINUTES,
  }])) as GrantDraft;
}

export function grantsFromDrafts(drafts: GrantDraft) {
  return Object.entries(drafts).map(([permission, grant]) => ({
    permission,
    mode: grant.mode,
    sessionMinutes: grant.mode === "RESTRICTED" ? grant.sessionMinutes : undefined,
  }));
}

export function PermissionGrantGrid({ role, drafts, onChange }: { role: string; drafts: GrantDraft; onChange: (next: GrantDraft) => void }) {
  const extras = allPermissions.filter((permission) => !ownerOnlyPermissions.includes(permission) && !permissionsForRole(role).includes(permission));
  const groups = ["Inventory", "Finance", "General"] as const;

  function setGrant(permission: Permission, mode: PermissionGrantMode | "OFF", sessionMinutes = DEFAULT_APPROVAL_SESSION_MINUTES) {
    const next = { ...drafts };
    if (mode === "OFF") delete next[permission];
    else next[permission] = { mode: mode === "RESTRICTED" && canBeConditioned(permission) ? "RESTRICTED" : "FULL", sessionMinutes };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const items = extras.filter((permission) => permissionGroupLabel(permission) === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#819087]">{group}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {items.map((permission) => {
                const current = drafts[permission];
                const mode = current?.mode ?? "OFF";
                const conditioned = canBeConditioned(permission);
                return (
                  <div key={permission} className="rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-[11px] font-medium text-[#2d2d2d]">{permissionLabels[permission]}</span>
                      <div role="group" aria-label={`${permissionLabels[permission]} access`} className="flex shrink-0 overflow-hidden rounded-lg border border-[#d4d4d4] text-[9px] font-semibold">
                        {(["OFF", "FULL", ...(conditioned ? ["RESTRICTED"] as const : [])] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={mode === option || (option === "FULL" && mode === "FULL")}
                            onClick={() => setGrant(permission, option)}
                            className={`px-2 py-1 transition ${mode === option ? option === "RESTRICTED" ? "bg-[#a15d3d] text-white" : "bg-[#111111] text-white" : "bg-white text-[#6b6b6b] hover:bg-[#f5f5f5]"}`}
                          >
                            {option === "OFF" ? "Off" : option === "FULL" ? (conditioned ? "Free" : "On") : "Code"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {conditioned && mode === "RESTRICTED" ? (
                      <label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#69746c]">
                        Minutes after the code before logout
                        <input
                          type="number"
                          min={5}
                          max={480}
                          value={current?.sessionMinutes ?? DEFAULT_APPROVAL_SESSION_MINUTES}
                          onChange={(event) => setGrant(permission, "RESTRICTED", Number(event.target.value))}
                          className="w-20 border border-[#c4c4c4] px-2 py-1 text-right text-xs"
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
