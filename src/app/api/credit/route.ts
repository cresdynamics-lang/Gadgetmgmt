import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
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
      branch: { select: { name: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: [{ nextDueDate: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(plans);
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
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid payment amount, plan and method." }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const plan = await transaction.creditPlan.findFirst({
        where: { id: parsed.data.creditPlanId, branchId },
        select: { id: true, balance: true, nextDueDate: true, status: true },
      });
      if (!plan || plan.status === "PAID_OFF") throw new Error("PLAN_UNAVAILABLE");
      if (parsed.data.amount > plan.balance) throw new Error("PAYMENT_EXCEEDS_BALANCE");

      const updated = await transaction.creditPlan.updateMany({
        where: { id: plan.id, branchId, balance: plan.balance, status: { not: "PAID_OFF" } },
        data: {
          balance: { decrement: parsed.data.amount },
          status: parsed.data.amount === plan.balance ? "PAID_OFF" : plan.nextDueDate < new Date() ? "OVERDUE" : "ACTIVE",
        },
      });
      if (updated.count !== 1) throw new Error("PLAN_CHANGED");

      const payment = await transaction.payment.create({
        data: {
          creditPlanId: plan.id,
          amount: parsed.data.amount,
          method: parsed.data.method,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
        },
      });
      return { payment, balance: plan.balance - parsed.data.amount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_UNAVAILABLE") return NextResponse.json({ error: "Credit plan is unavailable or already paid." }, { status: 404 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "Payment cannot exceed the outstanding balance." }, { status: 400 });
    if (error instanceof Error && error.message === "PLAN_CHANGED") return NextResponse.json({ error: "This account changed during payment. Refresh and retry." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment updated this account. Refresh and retry." }, { status: 409 });
    console.error("Credit payment failed", error);
    return NextResponse.json({ error: "Payment could not be recorded." }, { status: 500 });
  }
}