import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const schema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reviewNote: z.string().trim().max(300).optional() }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(["OWNER", "BRANCH_MANAGER"] as string[]).includes(session.user.role) || !canUseCapability(session.user, "credit")) return NextResponse.json({ error: "Only managers can review reschedule requests." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  const { requestId } = await params;
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const item = await transaction.creditRescheduleRequest.findFirst({ where: { id: requestId, status: "PENDING", ...(session.user.role === "OWNER" ? {} : { creditPlan: { branchId: session.user.branchId ?? "" } }) }, include: { creditPlan: { select: { id: true, branchId: true, balance: true } } } });
      if (!item || item.creditPlan.balance <= 0) throw new Error("REQUEST_UNAVAILABLE");
      const updatedRequest = await transaction.creditRescheduleRequest.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: parsed.data.decision, reviewedById: session.user.id, reviewedAt: new Date(), reviewNote: parsed.data.reviewNote || null } });
      if (updatedRequest.count !== 1) throw new Error("REQUEST_CHANGED");
      if (parsed.data.decision === "APPROVED") {
        const nextInstallment = await transaction.creditInstallment.findFirst({ where: { creditPlanId: item.creditPlanId, paidAt: null }, orderBy: { sequence: "asc" }, select: { id: true } });
        if (nextInstallment) {
          await transaction.creditInstallment.update({ where: { id: nextInstallment.id }, data: { dueDate: item.requestedDueDate } });
          await transaction.creditPlan.update({ where: { id: item.creditPlanId }, data: { nextDueDate: item.requestedDueDate } });
        }
      }
      return { ok: true, decision: parsed.data.decision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["REQUEST_UNAVAILABLE", "REQUEST_CHANGED"].includes(error.message)) return NextResponse.json({ error: "This reschedule request has already been handled or the plan is closed." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "The plan changed while reviewing. Refresh and try again." }, { status: 409 });
    throw error;
  }
}
