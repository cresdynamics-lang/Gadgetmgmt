import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const accessSchema = z.object({
  role: z.enum(["OWNER", "BRANCH_MANAGER", "CASHIER", "INVENTORY_LEAD"]).optional(),
  status: z.enum(["ACTIVE", "OFF_SHIFT", "SUSPENDED"]).optional(),
}).refine((data) => data.role !== undefined || data.status !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "Only an administrator can change account access." }, { status: 403 });

  const parsed = accessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid role or account status." }, { status: 400 });

  const { id } = await context.params;
  if (id === session.user.id) return NextResponse.json({ error: "You cannot change your own administrator access." }, { status: 400 });

  try {
    const updatedUser = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id } });
      if (!user) return null;

      const nextRole = parsed.data.role ?? user.role;
      const nextStatus = parsed.data.status ?? user.status;
      if (user.role === "OWNER" && (nextRole !== "OWNER" || nextStatus !== "ACTIVE")) {
        const activeOwners = await transaction.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
        if (activeOwners <= 1) throw new Error("LAST_ACTIVE_ADMIN");
      }

      return transaction.user.update({
        where: { id },
        data: parsed.data,
        select: { id: true, role: true, status: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!updatedUser) return NextResponse.json({ error: "Staff account was not found." }, { status: 404 });
    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") {
      return NextResponse.json({ error: "At least one active administrator must remain." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another administrator changed account access. Refresh and retry." }, { status: 409 });
    }
    console.error("Staff access update failed", error);
    return NextResponse.json({ error: "Staff access could not be updated." }, { status: 500 });
  }
}