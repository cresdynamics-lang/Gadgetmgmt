import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability, type AccessSubject } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

function accessError(user: AccessSubject) {
  return !canUseCapability(user, "layaway")
    ? denied(user, "layaway", "Your role cannot access layaway orders.")
    : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const forbidden = accessError(session.user);
  if (forbidden) return forbidden;
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });

  const orders = await prisma.layawayOrder.findMany({
      where: { branchId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        branch: { select: { name: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          include: { receivedBy: { select: { name: true } } },
        },
        sale: { select: { invoiceNumber: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

  return NextResponse.json(orders);
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const forbidden = accessError(session.user);
  if (forbidden) return forbidden;
  return NextResponse.json({ error: "Save & Collect has been retired. Use Lipa Mdogo Mdogo for new installment purchases." }, { status: 410 });
}
