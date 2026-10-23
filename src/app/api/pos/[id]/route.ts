import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "sales")) return denied(session.user, "sales", "Your role cannot view sales.");
  const { id } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) },
    include: {
      customer: { select: { name: true, phone: true } },
      branch: { select: { name: true, address: true, phone: true } },
      cashier: { select: { name: true } },
      saleItems: { include: { product: { select: { name: true, sku: true, configuration: true, condition: true } } } },
      payments: true,
      paymentRequests: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  if (!sale) return NextResponse.json({ error: "Sale was not found." }, { status: 404 });
  return NextResponse.json(sale, { headers: { "Cache-Control": "no-store" } });
}
