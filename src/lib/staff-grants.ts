import type { Prisma, PrismaClient } from "@prisma/client";

import {
  canBeConditioned,
  clampSessionMinutes,
  isPermission,
  ownerOnlyPermissions,
  permissionLabels,
  permissionsForRole,
  type Permission,
  type PermissionGrantMode,
} from "@/lib/access";

export type GrantInput = { permission: string; mode: PermissionGrantMode; sessionMinutes?: number | null };

export function normalizeStaffGrants(role: string, grants: GrantInput[]) {
  const fromRole = new Set<string>(permissionsForRole(role));
  const next: { permission: Permission; mode: PermissionGrantMode; sessionMinutes: number | null }[] = [];
  for (const grant of grants) {
    if (!isPermission(grant.permission) || fromRole.has(grant.permission)) continue;
    if (ownerOnlyPermissions.includes(grant.permission)) continue;
    const mode: PermissionGrantMode = grant.mode === "RESTRICTED" && canBeConditioned(grant.permission) ? "RESTRICTED" : "FULL";
    next.push({
      permission: grant.permission,
      mode,
      sessionMinutes: mode === "RESTRICTED" ? clampSessionMinutes(grant.sessionMinutes) : null,
    });
  }
  return [...new Map(next.map((grant) => [grant.permission, grant])).values()];
}

export function grantSummary(grants: { permission: Permission; mode: PermissionGrantMode }[]) {
  if (!grants.length) return "no extra permissions";
  return grants
    .map((grant) => `${permissionLabels[grant.permission]}${grant.mode === "RESTRICTED" ? " (code)" : ""}`)
    .join(", ");
}

export async function replaceStaffGrants(
  db: PrismaClient | Prisma.TransactionClient,
  input: { userId: string; grantedById: string; grants: ReturnType<typeof normalizeStaffGrants> },
) {
  await db.userPermission.deleteMany({
    where: { userId: input.userId, permission: { notIn: input.grants.map((grant) => grant.permission) } },
  });
  for (const grant of input.grants) {
    await db.userPermission.upsert({
      where: { userId_permission: { userId: input.userId, permission: grant.permission } },
      update: { mode: grant.mode, sessionMinutes: grant.sessionMinutes, grantedById: input.grantedById },
      create: {
        userId: input.userId,
        permission: grant.permission,
        mode: grant.mode,
        sessionMinutes: grant.sessionMinutes,
        grantedById: input.grantedById,
      },
    });
  }
  await db.permissionApproval.deleteMany({ where: { userId: input.userId } });
}
