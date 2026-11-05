import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { denied } from "@/lib/authz";
import { findReturningCustomer } from "@/lib/customer-match";
import { prisma } from "@/lib/prisma";

/** As a phone or email is typed at the till, tell staff when this client has been here before. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user, "sales")) return denied(session.user, "sales", "Your role cannot access sales.");
  const branchId = session.user.branchId;
  if (!branchId) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const match = await findReturningCustomer(prisma, branchId, { phone: params.get("phone") ?? "", email: params.get("email") ?? "" });
  if (!match) return NextResponse.json({ match: null }, { headers: { "Cache-Control": "no-store" } });
  const lastSale = await prisma.sale.findFirst({ where: { customerId: match.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return NextResponse.json({
    match: { id: match.id, name: match.name, phone: match.phone, email: match.email, status: match.status, purchases: match._count.sales, lastPurchase: lastSale?.createdAt ?? null, since: match.createdAt },
  }, { headers: { "Cache-Control": "no-store" } });
}
