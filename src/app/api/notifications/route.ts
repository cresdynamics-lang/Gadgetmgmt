import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "notifications")) return NextResponse.json({ error: "Your role cannot access message delivery." }, { status: 403 });
  const scope = session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" };
  const [messages, queued, sent, failed] = await Promise.all([
    prisma.customerNotification.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.customerNotification.count({ where: { ...scope, status: { in: ["QUEUED", "PROCESSING"] } } }),
    prisma.customerNotification.count({ where: { ...scope, status: "SENT" } }),
    prisma.customerNotification.count({ where: { ...scope, status: "FAILED" } }),
  ]);
  const paymentReviews = await prisma.paymentRequest.findMany({
    where: { status: "REVIEW", ...(session.user.role === "OWNER" ? {} : { OR: [{ creditPlan: { branchId: session.user.branchId ?? "" } }, { sale: { branchId: session.user.branchId ?? "" } }] }) },
    include: {
      creditPlan: { select: { customer: { select: { name: true } }, product: { select: { name: true } }, branch: { select: { name: true } } } },
      sale: { select: { invoiceNumber: true, branch: { select: { name: true } }, customer: { select: { name: true } }, saleItems: { select: { product: { select: { name: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ messages, paymentReviews, counts: { queued, sent, failed } });
}
