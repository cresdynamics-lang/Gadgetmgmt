import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { recordLayawayPayment } from "@/lib/layaway";
import { prisma } from "@/lib/prisma";

const paymentSchema = z.object({
  amount: z.number().int().positive().max(2_000_000_000),
  method: z.enum(["CASH", "MPESA", "CARD"]),
  reference: z.string().trim().max(100).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "layaway")) return NextResponse.json({ error: "Your role cannot record layaway payments." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const { id } = await context.params;
  if (!z.string().cuid().safeParse(id).success) return NextResponse.json({ error: "Layaway order was not found." }, { status: 404 });
  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid installment amount and payment method." }, { status: 400 });

  try {
    const result = await prisma.$transaction(
      (transaction) => recordLayawayPayment(transaction, { ...parsed.data, orderId: id, branchId, userId: session.user.id }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_ACTIVE") return NextResponse.json({ error: "This layaway order is not accepting payments." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE") return NextResponse.json({ error: "The payment cannot exceed the remaining balance." }, { status: 400 });
    if (error instanceof Error && error.message === "ORDER_CHANGED") return NextResponse.json({ error: "Another payment updated this order. Refresh and try again." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment updated this order. Refresh and try again." }, { status: 409 });
    console.error("Layaway installment failed", error);
    return NextResponse.json({ error: "Installment could not be recorded." }, { status: 500 });
  }
}