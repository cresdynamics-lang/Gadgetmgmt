import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const schema = z.object({ requestedDueDate: z.string().date(), reason: z.string().trim().min(10).max(300) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot request a reschedule." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a future date and give a short reason." }, { status: 400 });
  const { id } = await params;
  const plan = await prisma.creditPlan.findFirst({ where: { id, balance: { gt: 0 }, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) }, select: { id: true, branchId: true } });
  if (!plan) return NextResponse.json({ error: "Open Lipa plan was not found." }, { status: 404 });
  const requestedDueDate = new Date(`${parsed.data.requestedDueDate}T12:00:00+03:00`);
  const now = new Date();
  if (requestedDueDate <= now || requestedDueDate.getTime() > now.getTime() + 90 * 86_400_000) return NextResponse.json({ error: "Choose a date within the next 90 days." }, { status: 400 });
  const pending = await prisma.creditRescheduleRequest.findFirst({ where: { creditPlanId: id, status: "PENDING" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "This plan already has a reschedule request awaiting approval." }, { status: 409 });
  const created = await prisma.creditRescheduleRequest.create({ data: { creditPlanId: id, requestedBy: session.user.id, requestedDueDate, reason: parsed.data.reason } });
  return NextResponse.json(created, { status: 201 });
}
