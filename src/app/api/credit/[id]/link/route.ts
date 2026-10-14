import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit")) return NextResponse.json({ error: "Your role cannot manage credit accounts." }, { status: 403 });
  const { id } = await params;
  const branchId = session.user.branchId;
  if (!branchId && session.user.role !== "OWNER") return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const plan = await prisma.creditPlan.findFirst({
    where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: branchId! }) },
    select: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Credit account was not found." }, { status: 404 });
  const token = randomBytes(32).toString("hex");
  await prisma.creditPlan.update({
    where: { id: plan.id },
    data: { portalTokenHash: createHash("sha256").update(token).digest("hex") },
  });
  return NextResponse.json({ token });
}
