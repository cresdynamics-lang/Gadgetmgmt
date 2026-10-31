import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { denied } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { resolveSalesRange, type SalesRange } from "@/lib/sales-periods";

const ranges: SalesRange[] = ["today", "week", "month", "custom"];

/** Every sale's invoice or receipt, newest first, with whether it reached the customer by email. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "sales.view") && !hasPermission(session.user, "reports.view")) {
    return denied(session.user, "sales.view", "Your permissions cannot view invoices.");
  }

  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 80);
  const requested = params.get("range") as SalesRange | "all" | null;
  const range = requested && (ranges as string[]).includes(requested) ? requested as SalesRange : null;
  const window = range ? resolveSalesRange(range, new Date(), params.get("from"), params.get("to")) : null;
  const digits = q.replace(/\D/g, "");

  const where: Prisma.SaleWhereInput = {
    ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }),
    status: { not: "VOIDED" },
    ...(window ? { createdAt: { gte: window.start, lt: window.end } } : {}),
    ...(q ? {
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits } } }, { deviceUnits: { some: { imei: { contains: digits } } } }] : []),
      ],
    } : {}),
  };

  const sales = await prisma.sale.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, invoiceNumber: true, createdAt: true, total: true, paidAmount: true, status: true, paymentMethod: true,
      cashier: { select: { name: true } },
      customer: { select: { name: true, phone: true, email: true } },
      saleItems: { select: { quantity: true, product: { select: { name: true } } } },
    },
  });

  // Receipt and invoice emails are keyed by sale id, so one query finds the latest attempt for each.
  const notices = sales.length ? await prisma.customerNotification.findMany({
    where: {
      channel: "EMAIL",
      OR: sales.flatMap((sale) => [{ dedupeKey: { startsWith: `sale-receipt:${sale.id}` } }, { dedupeKey: { startsWith: `sale-links:${sale.id}` } }]),
    },
    orderBy: { createdAt: "desc" },
    select: { dedupeKey: true, recipient: true, status: true, sentAt: true, createdAt: true, lastError: true },
  }) : [];

  const invoices = sales.map((sale) => {
    const notice = notices.find((row) => row.dedupeKey.split(":")[1] === sale.id);
    const sentCount = notices.filter((row) => row.dedupeKey.split(":")[1] === sale.id && row.status === "SENT").length;
    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      createdAt: sale.createdAt,
      kind: sale.paidAmount < sale.total ? "INVOICE" as const : "RECEIPT" as const,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      total: sale.total,
      paid: sale.paidAmount,
      balance: Math.max(0, sale.total - sale.paidAmount),
      cashier: sale.cashier.name,
      customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone, email: sale.customer.email } : null,
      items: sale.saleItems.map((item) => `${item.product.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", "),
      email: notice ? { recipient: notice.recipient, status: notice.status, at: notice.sentAt ?? notice.createdAt, error: notice.lastError, sentCount } : null,
    };
  });

  return NextResponse.json({ invoices }, { headers: { "Cache-Control": "no-store" } });
}
