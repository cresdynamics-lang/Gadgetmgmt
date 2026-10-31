import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { canSeeAllBranches, hasPermission } from "@/lib/access";
import { recordActivity } from "@/lib/activity";
import { denied } from "@/lib/authz";
import { emailConfigured } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { sendSaleReceiptEmail } from "@/lib/sale-receipt-email";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254).optional() }).strict();

/** Email a fresh copy of a sale's receipt or invoice PDF, to the customer or an address typed in. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!hasPermission(session.user, "sales.view") && !hasPermission(session.user, "reports.view")) {
    return denied(session.user, "sales.view", "Your permissions cannot email receipts.");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!emailConfigured("orders")) return NextResponse.json({ error: "Email is not set up on this server yet." }, { status: 503 });

  const { id } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id, ...(canSeeAllBranches(session.user) ? {} : { branchId: session.user.branchId ?? "" }) },
    select: { id: true, invoiceNumber: true, status: true, customerId: true, customer: { select: { email: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Sale was not found." }, { status: 404 });
  if (sale.status !== "PAID" && sale.status !== "PARTIAL") return NextResponse.json({ error: "This sale is still waiting for payment, so there is no receipt to send yet." }, { status: 409 });
  const recipient = parsed.data.email || sale.customer?.email;
  if (!recipient) return NextResponse.json({ error: "This customer has no email on file. Type one in to send the PDF." }, { status: 400 });

  // A typed address is kept on the customer's account when they had none.
  if (parsed.data.email && sale.customerId && !sale.customer?.email) {
    await prisma.customer.update({ where: { id: sale.customerId }, data: { email: parsed.data.email } }).catch(() => null);
  }
  const sent = await sendSaleReceiptEmail(sale.id, recipient, true);
  if (!sent) return NextResponse.json({ error: "The email could not be sent. Check Messages & alerts for the reason." }, { status: 502 });
  await recordActivity({
    userId: session.user.id,
    sessionId: session.user.sessionId,
    action: "RECEIPT_EMAILED",
    summary: `Emailed ${sale.invoiceNumber} to ${recipient}`,
    entityType: "Sale",
    entityId: sale.id,
  });
  return NextResponse.json({ ok: true, recipient });
}
