import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasPermission, isPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { grantSummary, normalizeStaffGrants, replaceStaffGrants } from "@/lib/staff-grants";

const grantsSchema = z.object({
  grants: z.array(z.object({
    permission: z.string().refine(isPermission),
    mode: z.enum(["FULL", "RESTRICTED"]),
    sessionMinutes: z.number().int().min(5).max(480).optional(),
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

  const grants = normalizeStaffGrants(user.role, parsed.data.grants);
  await replaceStaffGrants(prisma, { userId: id, grantedById: session.user.id, grants });

  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "PERMISSIONS_UPDATED",
    summary: `Set ${user.name}'s extra access: ${grantSummary(grants)}`.slice(0, 500),
    entityType: "User",
    entityId: user.id,
  });
  return NextResponse.json({ id: user.id, permissionGrants: grants });
}
