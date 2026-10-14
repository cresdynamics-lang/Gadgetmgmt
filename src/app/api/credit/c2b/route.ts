import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { recordCreditPayment } from "@/lib/credit-payment";
import { prisma } from "@/lib/prisma";

const schema = z.object({ transactionId: z.string().min(1).max(40), creditPlanId: z.string().cuid() }).strict();

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(["OWNER", "BRANCH_MANAGER"] as string[]).includes(session.user.role)) return NextResponse.json({ error: "Only managers can review C2B receipts." }, { status: 403 });
  const receipts = await prisma.mpesaC2BTransaction.findMany({
    where: { matchedAt: null, ...(session.user.role === "OWNER" ? {} : { creditPlan: { is: { branchId: session.user.branchId ?? "" } } }) },
    orderBy: { createdAt: "asc" }, take: 200,
  });
  return NextResponse.json(receipts);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(["OWNER", "BRANCH_MANAGER"] as string[]).includes(session.user.role)) return NextResponse.json({ error: "Only managers can match C2B receipts." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a receipt and account." }, { status: 400 });
  try {
    const matched = await prisma.$transaction(async (transaction) => {
      const receipt = await transaction.mpesaC2BTransaction.findFirst({ where: { transactionId: parsed.data.transactionId, matchedAt: null, ...(session.user.role === "OWNER" ? {} : { creditPlan: { is: { branchId: session.user.branchId ?? "" } } }) } });
      const plan = await transaction.creditPlan.findFirst({ where: { id: parsed.data.creditPlanId, balance: { gt: 0 }, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) }, select: { id: true, branchId: true, balance: true } });
      if (!receipt || !plan || receipt.amount > plan.balance) throw new Error("MATCH_UNAVAILABLE");
      await recordCreditPayment(transaction, { creditPlanId: plan.id, amount: receipt.amount, method: "MPESA", reference: receipt.transactionId, notes: `Manager matched C2B receipt · ${receipt.billReference}${receipt.phone ? ` · ${receipt.phone}` : ""}`, branchId: plan.branchId, isOwner: session.user.role === "OWNER", userId: session.user.id });
      const update = await transaction.mpesaC2BTransaction.updateMany({ where: { id: receipt.id, matchedAt: null }, data: { creditPlanId: plan.id, matchedAt: new Date() } });
      if (update.count !== 1) throw new Error("MATCH_UNAVAILABLE");
      return { ok: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(matched);
  } catch (error) {
    if (error instanceof Error && error.message === "MATCH_UNAVAILABLE") return NextResponse.json({ error: "Receipt or account changed. Confirm the amount and outstanding balance, then refresh." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment changed this plan. Refresh and retry." }, { status: 409 });
    console.error("C2B receipt match failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "C2B receipt could not be matched." }, { status: 500 });
  }
}
