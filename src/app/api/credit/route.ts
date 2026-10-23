import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, canUseCapability, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { recordActivity } from "@/lib/activity";
import { queueAndSendNotice } from "@/lib/customer-notice";
import { recordCreditPayment } from "@/lib/credit-payment";
import { daysUntilDue } from "@/lib/credit-lifecycle";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "credit")) return denied(session.user, "credit", "Your role cannot access credit accounts.");

  const plans = await prisma.creditPlan.findMany({
    where: canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      product: { select: { name: true, sku: true } },
      branch: { select: { name: true, creditPolicy: { select: { earlySettlementDiscountPercent: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
      installments: { orderBy: { sequence: "asc" } },
      rescheduleRequests: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
      paymentSubmissions: { where: { status: "PENDING" }, orderBy: { createdAt: "asc" } },
      paymentRequests: { where: { status: "REVIEW", ...(hasPermission(session.user, "credit.policy") ? {} : { id: "" }) }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, mpesaReceipt: true, createdAt: true } },
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
  if (!canUseCapability(session.user, "credit")) return denied(session.user, "credit", "Your role cannot record credit payments.");
  const branchId = session.user.branchId;
  if (!branchId && !canSeeAllBranches(session.user)) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid payment amount, plan and method." }, { status: 400 });

  try {
    const result = await prisma.$transaction(
      (transaction) => recordCreditPayment(transaction, {
        ...parsed.data,
        branchId,
        isOwner: canSeeAllBranches(session.user),
        userId: session.user.id,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await recordActivity({
      userId: session.user.id,
      sessionId: session.user.sessionId,
      action: "CREDIT_PAYMENT",
      summary: `Recorded Lipa payment of KES ${parsed.data.amount.toLocaleString("en-KE")}`,
      entityType: "CreditPlan",
      entityId: parsed.data.creditPlanId,
    });
    const plan = await prisma.creditPlan.findUnique({
      where: { id: parsed.data.creditPlanId },
      select: {
        id: true,
        branchId: true,
        planReference: true,
        balance: true,
        nextDueDate: true,
        customer: { select: { id: true, name: true, email: true, emailRemindersEnabled: true } },
        branch: { select: { name: true, phone: true } },
      },
    });
    if (plan) {
      await prisma.collectionFollowUp.updateMany({
        where: { creditPlanId: plan.id, status: { in: ["OPEN", "ASSIGNED"] }, ...(plan.balance === 0 ? {} : { dueDate: { lte: new Date() } }) },
        data: { status: "DONE" },
      });
      if (plan.customer.email && plan.customer.emailRemindersEnabled) {
        const nextDue = plan.balance > 0
          ? `Next balance of KES ${plan.balance.toLocaleString("en-KE")} is due ${plan.nextDueDate.toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" })}.`
          : "This account is now fully paid. Thank you.";
        await queueAndSendNotice({
          branchId: plan.branchId,
          customerId: plan.customer.id,
          channel: "EMAIL",
          kind: "PAYMENT_RECEIVED",
          recipient: plan.customer.email,
          subject: `Payment received · ${plan.planReference}`,
          body: `Hello ${plan.customer.name}, Gadget Hub recorded your payment of KES ${parsed.data.amount.toLocaleString("en-KE")} on plan ${plan.planReference}. Remaining balance: KES ${plan.balance.toLocaleString("en-KE")}. ${nextDue} Need help? Call ${plan.branch.name} on ${plan.branch.phone}.`,
          dedupeKey: `payment-received:${result.payment.id}`,
        });
      }
    }
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
