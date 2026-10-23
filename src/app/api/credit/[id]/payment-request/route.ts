import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const schema = z.object({ amount: z.number().int().positive().max(2_000_000_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "credit")) return denied(session.user, "credit", "Your role cannot manage credit accounts.");
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });

  const { id } = await params;
  const plan = await prisma.creditPlan.findFirst({
    where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) },
    select: { id: true, balance: true, status: true },
  });
  if (!plan || plan.status === "PAID_OFF") return NextResponse.json({ error: "This account is unavailable or already settled." }, { status: 404 });
  if (parsed.data.amount > plan.balance) return NextResponse.json({ error: "The request cannot exceed the account balance." }, { status: 400 });

  const token = randomBytes(32).toString("hex");
  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      creditPlanId: plan.id,
      amount: parsed.data.amount,
      purpose: "GadgetHub credit account payment",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
    select: { id: true, expiresAt: true },
  });
  return NextResponse.json({ id: paymentRequest.id, token, expiresAt: paymentRequest.expiresAt }, { status: 201 });
}
