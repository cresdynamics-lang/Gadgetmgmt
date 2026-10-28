import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { isPermission, permissionLabels, type Permission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { clampSessionMinutes, DEFAULT_APPROVAL_SESSION_MINUTES } from "@/lib/access";
import { hashApprovalCode } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;
const verifySchema = z.object({
  permission: z.string().refine(isPermission),
  code: z.string().trim().regex(/^\d{6}$/),
}).strict();

/** Unlock a restricted permission until its code expires (5 minutes after it was issued). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code from the super admin." }, { status: 400 });
  const permission = parsed.data.permission as Permission;

  const approval = await prisma.permissionApproval.findFirst({
    where: { userId: session.user.id, permission, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, expiresAt: true },
  });
  if (!approval) return NextResponse.json({ error: "This code has expired. Request a new code to continue." }, { status: 410 });
  if (approval.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: "Too many wrong attempts. Request a new code." }, { status: 429 });

  const expected = Buffer.from(approval.codeHash);
  const actual = Buffer.from(hashApprovalCode(session.user.id, permission, parsed.data.code));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await prisma.permissionApproval.update({ where: { id: approval.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - approval.attempts - 1;
    return NextResponse.json({ error: left > 0 ? `That code is not correct. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong attempts. Request a new code." }, { status: 400 });
  }

  const grant = await prisma.userPermission.findUnique({
    where: { userId_permission: { userId: session.user.id, permission } },
    select: { sessionMinutes: true },
  });
  const sessionEndsAt = new Date(Date.now() + clampSessionMinutes(grant?.sessionMinutes ?? DEFAULT_APPROVAL_SESSION_MINUTES) * 60_000);
  const verified = await prisma.permissionApproval.updateMany({
    where: { id: approval.id, verifiedAt: null },
    data: { verifiedAt: new Date(), sessionEndsAt },
  });
  if (verified.count !== 1) return NextResponse.json({ error: "This code was already used. Request a new code." }, { status: 409 });
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "APPROVAL_GRANTED",
    summary: `Unlocked "${permissionLabels[permission]}" with a super admin code`,
    entityType: "PermissionApproval",
    entityId: approval.id,
  });
  return NextResponse.json({ unlockedUntil: sessionEndsAt, accessUntil: sessionEndsAt });
}
