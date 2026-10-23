import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission, isPermission, ownerOnlyPermissions, permissionLabels, permissionsForRole, type Permission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const grantsSchema = z.object({
  grants: z.array(z.object({
    permission: z.string().refine(isPermission),
    mode: z.enum(["FULL", "RESTRICTED"]),
  })).max(50),
}).strict();

/** Replace a user's extra permissions. Role permissions stay as they are. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "permissions.manage")) return denied(session.user, "permissions.manage", "Only the super admin can grant permissions.");

  const parsed = grantsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose valid permissions and access levels." }, { status: 400 });
  const { id } = await context.params;
  if (id === session.user.id) return NextResponse.json({ error: "You cannot change your own permissions." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true } });
  if (!user) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
  if (user.role === "OWNER") return NextResponse.json({ error: "Super admins already hold every permission." }, { status: 400 });

  const fromRole = new Set<string>(permissionsForRole(user.role));
  const grants = [...new Map(parsed.data.grants.map((grant) => [grant.permission, grant])).values()]
    .filter((grant) => !fromRole.has(grant.permission));
  if (grants.some((grant) => ownerOnlyPermissions.includes(grant.permission as Permission))) {
    return NextResponse.json({ error: "That permission stays with the super admin." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId: id, permission: { notIn: grants.map((grant) => grant.permission) } } }),
    ...grants.map((grant) => prisma.userPermission.upsert({
      where: { userId_permission: { userId: id, permission: grant.permission } },
      update: { mode: grant.mode, grantedById: session.user.id },
      create: { userId: id, permission: grant.permission, mode: grant.mode, grantedById: session.user.id },
    })),
    // Changing access ends any unlock already in progress.
    prisma.permissionApproval.deleteMany({ where: { userId: id } }),
  ]);

  const summary = grants.length
    ? grants.map((grant) => `${permissionLabels[grant.permission as Permission]}${grant.mode === "RESTRICTED" ? " (restricted)" : ""}`).join(", ")
    : "no extra permissions";
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "PERMISSIONS_UPDATED",
    summary: `Set ${user.name}'s extra access: ${summary}`.slice(0, 500),
    entityType: "User",
    entityId: user.id,
  });
  return NextResponse.json({ id: user.id, permissionGrants: grants });
}
