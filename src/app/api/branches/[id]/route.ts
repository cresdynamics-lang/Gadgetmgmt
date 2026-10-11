import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20).transform((code) => code.toUpperCase()),
  address: z.string().trim().min(4).max(240),
  phone: z.string().trim().min(7).max(30),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (session.user.role !== "OWNER" && session.user.role !== "BRANCH_MANAGER") return NextResponse.json({ error: "Your role cannot update branch settings." }, { status: 403 });

  const { id } = await context.params;
  if (session.user.role !== "OWNER" && session.user.branchId !== id) return NextResponse.json({ error: "You can only update your assigned branch." }, { status: 403 });

  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter valid branch name, code, address, phone and email details." }, { status: 400 });

  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: { ...parsed.data, email: parsed.data.email || null },
      select: { id: true, name: true, code: true, address: true, phone: true, email: true, isActive: true },
    });
    return NextResponse.json(branch);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "That branch code is already in use." }, { status: 409 });
    console.error("Branch profile update failed", error);
    return NextResponse.json({ error: "Branch profile could not be updated." }, { status: 500 });
  }
}