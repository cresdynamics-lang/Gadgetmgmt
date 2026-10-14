import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const submissionSchema = z.object({
  amount: z.number().int().positive().max(2_000_000_000),
  reference: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,32}$/),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "This customer link is invalid." }, { status: 404 });
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount and M-Pesa transaction code." }, { status: 400 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const plan = await prisma.creditPlan.findUnique({ where: { portalTokenHash: tokenHash }, select: { id: true, balance: true, status: true } });
  if (!plan || plan.status === "PAID_OFF") return NextResponse.json({ error: "This account is already settled or the link is no longer active." }, { status: 404 });
  if (parsed.data.amount > plan.balance) return NextResponse.json({ error: "The submitted amount is greater than the remaining account balance." }, { status: 400 });

  try {
    const [recordedCreditPayment, recordedSalePayment] = await Promise.all([
      prisma.payment.findFirst({ where: { reference: parsed.data.reference }, select: { id: true } }),
      prisma.salePayment.findFirst({ where: { reference: parsed.data.reference }, select: { id: true } }),
    ]);
    if (recordedCreditPayment || recordedSalePayment) return NextResponse.json({ error: "That transaction code is already recorded." }, { status: 409 });
    const pendingCount = await prisma.creditPaymentSubmission.count({ where: { creditPlanId: plan.id, status: "PENDING" } });
    if (pendingCount >= 5) return NextResponse.json({ error: "The branch has several payments to review for this account. Please call them before submitting another." }, { status: 429 });
    const submission = await prisma.creditPaymentSubmission.create({ data: { creditPlanId: plan.id, amount: parsed.data.amount, reference: parsed.data.reference } });
    return NextResponse.json({ id: submission.id, status: submission.status }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That M-Pesa transaction code has already been submitted." }, { status: 409 });
    }
    console.error("Customer payment reference submission failed", error);
    return NextResponse.json({ error: "Payment reference could not be submitted." }, { status: 500 });
  }
}
