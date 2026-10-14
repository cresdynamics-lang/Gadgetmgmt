import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { recordCreditPayment } from "@/lib/credit-payment";
import { daysUntilDue } from "@/lib/credit-lifecycle";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot access credit accounts." }, { status: 403 });

  const plans = await prisma.creditPlan.findMany({
    where: session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { name: true, sku: true } },
      branch: { select: { name: true, creditPolicy: { select: { earlySettlementDiscountPercent: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
      installments: { orderBy: { sequence: "asc" } },
      rescheduleRequests: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
      paymentSubmissions: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
      paymentRequests: { where: { status: "REVIEW", ...(session.user.role === "OWNER" || session.user.role === "BRANCH_MANAGER" ? {} : { id: "" }) }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, mpesaReceipt: true, createdAt: true } },
    },
    orderBy: [{ nextDueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(plans.map((plan) => {
    const { portalTokenHash, ...safePlan } = plan;
    void portalTokenHash;
    const discountPercent = plan.branch.creditPolicy?.earlySettlementDiscountPercent ?? 0;
    const discountAmount = daysUntilDue(plan.nextDueDate, new Date()) > 0
      ? Math.floor(Math.max(0, plan.balance - plan.lateFeeAmount) * discountPercent / 100)
      : 0;
    return { ...safePlan, earlySettlementOffer: discountAmount > 0 ? { discountAmount, payOffAmount: plan.balance - discountAmount, discountPercent } : null };
  }));
}

const paymentSchema = z.object({
  creditPlanId: z.string().cuid(),
  amount: z.number().int().positive().max(2_000_000_000),
  method: z.enum(["CASH", "MPESA", "CARD"]),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot record credit payments." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId && session.user.role !== "OWNER") return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid payment amount, plan and method." }, { status: 400 });

  try {
    const result = await prisma.$transaction(
      (transaction) => recordCreditPayment(transaction, {
        ...parsed.data,
        branchId,
        isOwner: session.user.role === "OWNER",
        userId: session.user.id,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_UNAVAILABLE") return NextResponse.json({ error: "Credit plan is unavailable or already paid." }, { status: 404 });
    if (error instanceof Error && error.message === "DUPLICATE_PAYMENT_REFERENCE") return NextResponse.json({ error: "That M-Pesa reference is already recorded against a credit account." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "Payment cannot exceed the outstanding balance." }, { status: 400 });
    if (error instanceof Error && error.message === "PLAN_CHANGED") return NextResponse.json({ error: "This account changed during payment. Refresh and retry." }, { status: 409 });
    if (error instanceof Error && error.message === "SALE_PAYMENT_EXCEEDS_TOTAL") return NextResponse.json({ error: "This payment would make the sale overpaid. Ask an administrator to reconcile the account." }, { status: 409 });
    if (error instanceof Error && error.message === "SALE_CHANGED") return NextResponse.json({ error: "The linked sale changed during payment. Refresh and retry." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment updated this account. Refresh and retry." }, { status: 409 });
    console.error("Credit payment failed", error);
    return NextResponse.json({ error: "Payment could not be recorded." }, { status: 500 });
  }
}
