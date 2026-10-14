import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { recordCreditPayment } from "@/lib/credit-payment";
import { prisma } from "@/lib/prisma";

const reviewSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot review credit payments." }, { status: 403 });
  if (!session.user.branchId && session.user.role !== "OWNER") return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  const { submissionId } = await params;

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const submission = await transaction.creditPaymentSubmission.findFirst({
        where: { id: submissionId, ...(session.user.role === "OWNER" ? {} : { creditPlan: { branchId: session.user.branchId! } }) },
        include: { creditPlan: { select: { id: true, branchId: true } } },
      });
      if (!submission || submission.status !== "PENDING") throw new Error("SUBMISSION_UNAVAILABLE");

      if (parsed.data.decision === "APPROVE") {
        await recordCreditPayment(transaction, {
          creditPlanId: submission.creditPlan.id,
          amount: submission.amount,
          method: "MPESA",
          reference: submission.reference,
          branchId: session.user.branchId ?? submission.creditPlan.branchId,
          isOwner: session.user.role === "OWNER",
          userId: session.user.id,
        });
      }

      const updated = await transaction.creditPaymentSubmission.updateMany({
        where: { id: submission.id, status: "PENDING" },
        data: { status: parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedAt: new Date(), reviewedById: session.user.id },
      });
      if (updated.count !== 1) throw new Error("SUBMISSION_UNAVAILABLE");
      return { status: parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "SUBMISSION_UNAVAILABLE") return NextResponse.json({ error: "This payment was already reviewed or no longer exists." }, { status: 409 });
    if (error instanceof Error && error.message === "PLAN_UNAVAILABLE") return NextResponse.json({ error: "The linked account has already been settled." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "This submitted payment is now greater than the remaining balance." }, { status: 409 });
    if (error instanceof Error && error.message === "DUPLICATE_PAYMENT_REFERENCE") return NextResponse.json({ error: "This M-Pesa reference is already recorded against an account." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment updated this account. Refresh and retry." }, { status: 409 });
    console.error("Credit payment review failed", error);
    return NextResponse.json({ error: "Payment could not be reviewed." }, { status: 500 });
  }
}
