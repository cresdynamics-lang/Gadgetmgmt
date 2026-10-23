import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { capabilityPermission, needsApproval, permissionLabels, type AccessCapability, type AccessSubject, type Permission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const APPROVAL_WINDOW_MS = 5 * 60 * 1000;

export function hashApprovalCode(userId: string, permission: string, code: string) {
  return createHash("sha256").update(`${process.env.NEXTAUTH_SECRET ?? ""}:${userId}:${permission}:${code}`).digest("hex");
}

function toPermission(need: Permission | AccessCapability): Permission {
  return need in capabilityPermission ? capabilityPermission[need as AccessCapability] : need as Permission;
}

/**
 * 403 response. When the user holds the permission as a locked restricted grant, the body
 * carries `approvalRequired` so the client can ask the super admin for a 5-minute code.
 */
export function denied(subject: AccessSubject, need: Permission | AccessCapability, message: string) {
  const permission = toPermission(need);
  if (needsApproval(subject, permission)) {
    return NextResponse.json({
      error: `"${permissionLabels[permission]}" is a restricted permission. Request an approval code from the super admin to continue.`,
      approvalRequired: permission,
    }, { status: 403 });
  }
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Load per-user grants and the restricted ones unlocked by a verified, unexpired code. */
export async function loadPermissionGrants(userId: string) {
  const [grants, approvals] = await Promise.all([
    prisma.userPermission.findMany({ where: { userId }, select: { permission: true, mode: true } }),
    prisma.permissionApproval.findMany({
      where: { userId, verifiedAt: { not: null }, expiresAt: { gt: new Date() } },
      select: { permission: true },
    }),
  ]);
  return { grants, unlocked: approvals.map((approval) => approval.permission) };
}
