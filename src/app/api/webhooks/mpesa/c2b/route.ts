import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { recordCreditPayment } from "@/lib/credit-payment";
import { normalizeKenyanPhone } from "@/lib/mpesa";
import { prisma } from "@/lib/prisma";

type C2BCallback = {
  TransID?: string;
  TransAmount?: string | number;
  BillRefNumber?: string;
  MSISDN?: string | number;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  const secret = process.env.MPESA_C2B_CALLBACK_SECRET;
  if (!secret || secret.length < 32) return false;
  const urlSecret = new URL(request.url).searchParams.get("key") ?? "";
  const headerSecret = request.headers.get("x-c2b-callback-secret") ?? "";
  return safeEqual(secret, urlSecret) || safeEqual(secret, headerSecret);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 404 });
  const payload = await request.json().catch(() => null) as C2BCallback | null;
  const transactionId = payload?.TransID?.trim().toUpperCase();
  const billReference = payload?.BillRefNumber?.trim().toUpperCase();
  const amount = Number(payload?.TransAmount);
  const phone = payload?.MSISDN === undefined ? null : normalizeKenyanPhone(String(payload.MSISDN));
  if (!transactionId || transactionId.length > 40 || !billReference || billReference.length > 32 || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2_000_000_000) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payment details" });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const prior = await transaction.mpesaC2BTransaction.findUnique({ where: { transactionId }, select: { id: true } });
      if (prior) return;
      const plan = await transaction.creditPlan.findFirst({
        where: { planReference: billReference, balance: { gt: 0 }, status: { not: "PAID_OFF" } },
        select: { id: true, branchId: true, balance: true },
      });
      const [existingCreditPayment, existingSalePayment] = await Promise.all([
        transaction.payment.findFirst({ where: { reference: transactionId }, select: { id: true } }),
        transaction.salePayment.findFirst({ where: { reference: transactionId }, select: { id: true } }),
      ]);
      const duplicateReference = Boolean(existingCreditPayment || existingSalePayment);
      const callback = await transaction.mpesaC2BTransaction.create({ data: { transactionId, billReference, phone, amount, creditPlanId: plan?.id ?? null } });
      if (!plan || amount > plan.balance || duplicateReference) {
        const branches = plan ? [{ id: plan.branchId }] : await transaction.branch.findMany({ where: { isActive: true }, select: { id: true } });
        for (const branch of branches) {
          const recipients = await transaction.user.findMany({ where: { status: "ACTIVE", OR: [{ role: "OWNER" }, ...(plan ? [{ role: "BRANCH_MANAGER" as const, branchId: branch.id }] : [])] }, select: { email: true } });
          await transaction.customerNotification.createMany({
            data: [...new Set(recipients.map((user) => user.email.toLowerCase()))].map((recipient) => ({
              branchId: branch.id, channel: "EMAIL" as const, kind: "MPESA_C2B_REVIEW", recipient,
              subject: "M-Pesa C2B payment needs matching",
              body: `M-Pesa receipt ${transactionId} for KES ${amount.toLocaleString("en-KE")} used reference ${billReference}.${duplicateReference ? " Its receipt number already exists in the payment ledger." : !plan ? " No account matched the plan reference." : " The amount exceeds the account balance."} It was not applied automatically. Review unmatched C2B receipts.`,
              dedupeKey: `mpesa-c2b-review:${transactionId}:${recipient}`,
            })), skipDuplicates: true,
          });
        }
        return;
      }
      await recordCreditPayment(transaction, {
        creditPlanId: plan.id,
        amount,
        method: "MPESA",
        reference: transactionId,
        notes: `Daraja C2B auto-match · ${billReference}${phone ? ` · ${phone}` : ""}`,
        branchId: plan.branchId,
        isOwner: false,
        userId: "",
      });
      await transaction.mpesaC2BTransaction.update({ where: { id: callback.id }, data: { matchedAt: new Date() } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ ResultCode: 0, ResultDesc: "Duplicate accepted" });
    console.error("M-Pesa C2B reconciliation failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Payment queued for retry" }, { status: 503 });
  }
}
