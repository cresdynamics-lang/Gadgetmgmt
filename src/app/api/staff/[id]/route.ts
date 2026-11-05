import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

const accessSchema = z.object({
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]).optional(),
  status: z.enum(["ACTIVE", "OFF_SHIFT", "SUSPENDED"]).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  branchId: z.string().cuid().nullable().optional(),
  // A new password set by the super admin, shared with the person securely.
  password: z.string().min(8).max(72).optional(),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined));

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "staff.manage") || !canSeeAllBranches(session.user)) {
    return NextResponse.json({ error: "Your permissions cannot change account access." }, { status: 403 });
  }

  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, work email, branch, role, status or a password of at least 8 characters." }, { status: 400 });

  const { id } = await context.params;
  if (id === session.user.id && (parsed.data.role !== undefined || parsed.data.status !== undefined)) return NextResponse.json({ error: "You cannot change your own administrator access." }, { status: 400 });
  const { password, ...fields } = parsed.data;
  const passwordHash = password ? await hash(password, 12) : undefined;

  try {
    const updatedUser = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id } });
      if (!user) return null;

      const nextRole = parsed.data.role ?? user.role;
      const nextStatus = parsed.data.status ?? user.status;
      if (user.role === "OWNER" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE")) {
        const activeOwners = await transaction.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
        if (activeOwners <= 1) throw new Error("LAST_ACTIVE_ADMIN");
      }

      if (fields.branchId) {
        const branch = await transaction.branch.findUnique({ where: { id: fields.branchId }, select: { id: true } });
        if (!branch) throw new Error("BRANCH_NOT_FOUND");
      }
      return transaction.user.update({
        where: { id },
        data: { ...fields, ...(passwordHash ? { passwordHash } : {}) },
        select: { id: true, name: true, email: true, role: true, status: true, branchId: true, branch: { select: { id: true, name: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updatedUser) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    const changed = [fields.name && "name", fields.email && "email", fields.branchId !== undefined && "branch", fields.role && "role", fields.status && "status", password && "password"].filter(Boolean);
    await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "STAFF_UPDATED", summary: `Updated ${updatedUser.name}: ${changed.join(", ")}`, entityType: "User", entityId: updatedUser.id });
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") {
      return NextResponse.json({ error: "At least one active administrator must remain." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "BRANCH_NOT_FOUND") return NextResponse.json({ error: "That branch was not found." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Another account already uses that email." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another administrator changed account access. Refresh and retry." }, { status: 409 });
    }
    console.error("Staff access update failed", error);
    return NextResponse.json({ error: "Staff access could not be updated." }, { status: 500 });
  }
}
/**
 * Remove a staff account added by mistake. Anyone who has already sold, received stock or handled
 * a client keeps their record for the audit trail; suspend them instead.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "staff.manage") || !canSeeAllBranches(session.user)) {
    return NextResponse.json({ error: "Your permissions cannot remove staff accounts." }, { status: 403 });
  }
  const { id } = await context.params;
  if (id === session.user.id) return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, status: true } });
  if (!user) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
  if (user.role === "OWNER" && user.status === "ACTIVE") {
    const activeOwners = await prisma.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (activeOwners <= 1) return NextResponse.json({ error: "At least one active administrator must remain." }, { status: 409 });
  }
  try {
    await prisma.$transaction(async (transaction) => {
      // Sign-ins, granted extras and pending codes belong to the account alone and go with it.
      await transaction.activityEvent.updateMany({ where: { userId: id }, data: { userId: null } });
      await transaction.userSession.deleteMany({ where: { userId: id } });
      await transaction.userPermission.deleteMany({ where: { userId: id } });
      await transaction.permissionApproval.deleteMany({ where: { userId: id } });
      await transaction.assistantChat.deleteMany({ where: { userId: id } });
      await transaction.user.delete({ where: { id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json({ error: `${user.name} has sales, stock or client records, so the account stays for the history. Set it to Suspended instead.` }, { status: 409 });
    }
    console.error("Staff removal failed", error);
    return NextResponse.json({ error: "The staff account could not be removed." }, { status: 500 });
  }
  await recordActivity({ userId: session.user.id, sessionId: session.user.sessionId, action: "STAFF_UPDATED", summary: `Removed staff account ${user.name}`, entityType: "User", entityId: id });
  return NextResponse.json({ ok: true });
}
