import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "sales")) return NextResponse.json({ error: "Your role cannot view sales." }, { status: 403 });
  const { id } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id, ...(session.user.role === "OWNER" ? {} : { branchId: session.user.branchId ?? "" }) },
    include: {
      customer: { select: { name: true, phone: true } },
      branch: { select: { name: true, address: true, phone: true } },
      cashier: { select: { name: true } },
      saleItems: { include: { product: { select: { name: true, sku: true, configuration: true, condition: true } } } },
      payments: true,
    },
  });
  if (!sale) return NextResponse.json({ error: "Sale was not found." }, { status: 404 });
  return NextResponse.json(sale, { headers: { "Cache-Control": "no-store" } });
}
