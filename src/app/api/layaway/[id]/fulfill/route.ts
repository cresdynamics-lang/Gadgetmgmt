import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { fulfillLayawayOrder } from "@/lib/layaway";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "layaway")) return NextResponse.json({ error: "Your role cannot fulfill layaway orders." }, { status: 403 });
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const { id } = await context.params;
  if (!z.string().cuid().safeParse(id).success) return NextResponse.json({ error: "Layaway order was not found." }, { status: 404 });

  try {
    const sale = await prisma.$transaction(
      (transaction) => fulfillLayawayOrder(transaction, { orderId: id, branchId, userId: session.user.id }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_READY") return NextResponse.json({ error: "Collect the full balance before handing over this order." }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_LEDGER_MISMATCH") return NextResponse.json({ error: "The payment ledger does not match the order total; ask an administrator to review it." }, { status: 409 });
    if (error instanceof Error && error.message === "RESERVATION_UNAVAILABLE") return NextResponse.json({ error: "Reserved stock is no longer available. Ask an administrator to reconcile inventory." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "This order changed during pickup. Refresh and try again." }, { status: 409 });
    console.error("Layaway fulfillment failed", error);
    return NextResponse.json({ error: "Layaway order could not be fulfilled." }, { status: 500 });
  }
}