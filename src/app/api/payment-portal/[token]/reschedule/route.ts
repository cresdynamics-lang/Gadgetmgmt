import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const schema = z.object({ requestedDueDate: z.string().date(), reason: z.string().trim().min(10).max(300) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "This customer link is invalid." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a date and provide a short reason." }, { status: 400 });

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const plan = await prisma.creditPlan.findUnique({ where: { portalTokenHash: tokenHash }, select: { id: true, balance: true, customerId: true } });
  if (!plan || plan.balance <= 0) return NextResponse.json({ error: "This account is already settled or the link is no longer active." }, { status: 404 });
  const requestedDueDate = new Date(`${parsed.data.requestedDueDate}T12:00:00+03:00`);
  const now = new Date();
  if (requestedDueDate <= now || requestedDueDate.getTime() > now.getTime() + 90 * 86_400_000) return NextResponse.json({ error: "Choose a date within the next 90 days." }, { status: 400 });

  const pending = await prisma.creditRescheduleRequest.findFirst({ where: { creditPlanId: plan.id, status: "PENDING" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "A request is already awaiting the manager's review." }, { status: 409 });
  try {
    const created = await prisma.creditRescheduleRequest.create({ data: { creditPlanId: plan.id, requestedBy: `customer:${plan.customerId}`, requestedDueDate, reason: parsed.data.reason } });
    return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A request is already awaiting the manager's review." }, { status: 409 });
    throw error;
  }
}
