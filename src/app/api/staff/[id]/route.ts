import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { hasAnyQuery } from "@/lib/access";
import { prisma } from "@/lib/prisma";

import { sameOrigin } from "@/lib/staff-alerts";

const accessSchema = z.object({
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]).optional(),
  status: z.enum(["ACTIVE", "OFF_SHIFT", "SUSPENDED"]).optional(),
}).refine((data) => data.role !== undefined || data.status !== undefined);

const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Access denied." }, { status: 403, headers: noStore });
  if (hasAnyQuery(request.url)) return NextResponse.json({ error: "Staff requests do not accept account details or other query parameters." }, { status: 400, headers: noStore });
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "Only an administrator can change account access." }, { status: 403, headers: noStore });

  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid role or account status." }, { status: 400 });

  if (parsed.data.role === "OWNER") return NextResponse.json({ error: "Owner access cannot be assigned to staff." }, { status: 403, headers: noStore });
  const { id } = await context.params;
  if (id === session.user.id) return NextResponse.json({ error: "You cannot change your own administrator access." }, { status: 400 });

  try {
    const updatedUser = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id } });
      if (!user) return null;

      if (user.role === "OWNER") throw new Error("PROTECTED_OWNER");

      return transaction.user.update({
        where: { id },
        data: parsed.data,
        select: { id: true, role: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updatedUser) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message === "PROTECTED_OWNER") {
      return NextResponse.json({ error: "Owner accounts cannot be blocked, demoted or changed by another account." }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another administrator changed account access. Refresh and retry." }, { status: 409 });
    }
    console.error("Staff access update failed.");
    return NextResponse.json({ error: "Staff access could not be updated." }, { status: 500 });
  }
}