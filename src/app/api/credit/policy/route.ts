import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const policySchema = z.object({
  branchId: z.string().cuid(),
  graceDays: z.number().int().min(0).max(30),
  lateFeeAmount: z.number().int().min(0).max(2_000_000_000),
  minimumDepositPercent: z.number().int().min(0).max(100),
  defaultCreditLimit: z.number().int().min(0).max(2_000_000_000),
  earlySettlementDiscountPercent: z.number().int().min(0).max(100),
  managerEscalationDays: z.number().int().min(1).max(60),
  ownerEscalationDays: z.number().int().min(1).max(90),
}).strict().refine((policy) => policy.ownerEscalationDays >= policy.managerEscalationDays, { path: ["ownerEscalationDays"], message: "Owner escalation must be on or after manager escalation." });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(["OWNER", "BRANCH_MANAGER"] as string[]).includes(session.user.role)) return NextResponse.json({ error: "Only owners and branch managers can view Lipa policy." }, { status: 403 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot view Lipa policy." }, { status: 403 });
  const branches = await prisma.branch.findMany({ where: session.user.role === "OWNER" ? { isActive: true } : { id: session.user.branchId ?? "" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const policies = await prisma.creditPolicy.findMany({ where: { branchId: { in: branches.map((branch) => branch.id) } } });
  return NextResponse.json({ branches, policies });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!(["OWNER", "BRANCH_MANAGER"] as string[]).includes(session.user.role)) return NextResponse.json({ error: "Only owners and branch managers can change Lipa policy." }, { status: 403 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot change Lipa policy." }, { status: 403 });
  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid policy values." }, { status: 400 });
  const { branchId, ...data } = parsed.data;
  if (session.user.role !== "OWNER" && session.user.branchId !== branchId) return NextResponse.json({ error: "This policy belongs to another branch." }, { status: 403 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } });
  if (!branch) return NextResponse.json({ error: "Choose an active branch." }, { status: 400 });
  const policy = await prisma.creditPolicy.upsert({ where: { branchId }, create: { branchId, ...data }, update: data });
  return NextResponse.json(policy);
}
