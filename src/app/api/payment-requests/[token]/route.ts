import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { normalizeKenyanPhone, requestMpesaStk } from "@/lib/mpesa";

const phoneSchema = z.object({ phone: z.string().trim().min(9).max(20).optional() }).strict();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "This payment link is invalid." }, { status: 404 });
  const paymentRequest = await prisma.paymentRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, amount: true, purpose: true, status: true, expiresAt: true, targetPhone: true, creditPlan: { select: { branch: { select: { name: true } } } }, sale: { select: { branch: { select: { name: true } } } } },
  });
  if (!paymentRequest || (paymentRequest.expiresAt <= new Date() && !["PROCESSING", "REVIEW"].includes(paymentRequest.status)) || paymentRequest.status === "EXPIRED") {
    return NextResponse.json({ error: "This payment request has expired." }, { status: 410 });
  }
  return NextResponse.json({ amount: paymentRequest.amount, purpose: paymentRequest.purpose, status: paymentRequest.status, targetPhone: paymentRequest.targetPhone, branchName: paymentRequest.creditPlan?.branch.name ?? paymentRequest.sale?.branch.name ?? "GadgetHub" });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "This payment link is invalid." }, { status: 404 });
  const parsed = phoneSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid Kenyan M-Pesa phone number." }, { status: 400 });
  const record = await prisma.paymentRequest.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, amount: true, status: true, expiresAt: true, stkAttempts: true, targetPhone: true } });
  if (!record || record.expiresAt <= new Date() || record.status === "EXPIRED") return NextResponse.json({ error: "This payment request has expired." }, { status: 410 });
  const phone = normalizeKenyanPhone(parsed.data.phone ?? record.targetPhone ?? "");
  if (!phone) return NextResponse.json({ error: "Enter a Kenyan mobile number such as 0712 345 678." }, { status: 400 });
  if (record.status === "PAID") return NextResponse.json({ error: "This payment has already been completed." }, { status: 409 });
  if (record.status === "REVIEW") return NextResponse.json({ error: "This payment is being checked by the business. Please do not try again." }, { status: 409 });
  if (record.status === "PROCESSING") return NextResponse.json({ error: "A payment prompt is already awaiting confirmation." }, { status: 409 });
  if (record.stkAttempts >= 3) return NextResponse.json({ error: "This link has reached its M-Pesa retry limit. Please ask the business for a new payment link." }, { status: 429 });

  const configured = await prisma.paymentRequest.updateMany({ where: { id: record.id, status: { in: ["CREATED", "FAILED"] }, stkAttempts: { lt: 3 } }, data: { status: "PROCESSING", payerPhone: phone, stkAttempts: { increment: 1 } } });
  if (configured.count !== 1) return NextResponse.json({ error: "This payment request has already been started. Refresh the page for its latest status." }, { status: 409 });
  try {
    const checkout = await requestMpesaStk({ phone, amount: record.amount, accountReference: record.id, description: "GadgetHub payment" });
    await prisma.paymentRequest.update({ where: { id: record.id }, data: checkout });
    return NextResponse.json({ status: "PROCESSING" }, { status: 202 });
  } catch (error) {
    const uncertain = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error instanceof TypeError);
    if (!uncertain) await prisma.paymentRequest.updateMany({ where: { id: record.id, status: "PROCESSING" }, data: { status: "FAILED" } });
    if (uncertain) return NextResponse.json({ status: "PROCESSING", message: "The response is taking longer than expected. Keep this page open while M-Pesa confirms the request." }, { status: 202 });
    if (error instanceof Error && error.message === "MPESA_NOT_CONFIGURED") return NextResponse.json({ error: "Online M-Pesa is not configured yet. Please contact the business to arrange payment." }, { status: 503 });
    console.error("M-Pesa payment request failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "M-Pesa could not start the payment prompt. Check the number and try again." }, { status: 502 });
  }
}
