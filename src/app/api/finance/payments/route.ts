import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOrigin } from "@/lib/staff-alerts";
import { recordSaleEvents, tenderLabels } from "@/lib/money-in";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const tickInput = z.object({ paymentIds: z.array(z.string().cuid()).min(1).max(100) }).strict();

/** M-Pesa and bank entries recorded by staff, waiting for the owner's tick. Trade-in credit is confirmed at inspection instead. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in first." }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the owner can confirm money in." }, 403);
  const payments = await prisma.salePayment.findMany({
    where: { requiresVerification: true, verifiedAt: null, method: { in: ["MPESA", "BANK"] }, sale: { status: { not: "VOIDED" } } },
    select: { id: true, amount: true, method: true, reference: true, createdAt: true, sale: { select: { id: true, invoiceNumber: true, cashier: { select: { name: true } }, customer: { select: { name: true } }, branch: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return json({ payments });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Open this action from GadgetHub." }, 403);
  const session = await auth();
  if (!session?.user) return json({ error: "Sign in first." }, 401);
  if (session.user.role !== "OWNER") return json({ error: "Only the owner can confirm money in." }, 403);
  const input = tickInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return json({ error: "Choose the payments to confirm." }, 400);
  const ownerId = session.user.id;
  const verified = await prisma.$transaction(async (tx) => {
    const pending = await tx.salePayment.findMany({
      where: { id: { in: input.data.paymentIds }, requiresVerification: true, verifiedAt: null, method: { in: ["MPESA", "BANK"] } },
      select: { id: true, amount: true, method: true, reference: true, sale: { select: { id: true, branchId: true } } },
    });
    if (!pending.length) return 0;
    const now = new Date();
    const updated = await tx.salePayment.updateMany({ where: { id: { in: pending.map((payment) => payment.id) }, verifiedAt: null }, data: { verifiedAt: now, verifiedById: ownerId } });
    if (updated.count !== pending.length) throw new Error("PAYMENT_CHANGED");
    for (const payment of pending) {
      await recordSaleEvents(tx, payment.sale, ownerId, [{ kind: "Payment confirmed", note: `Owner ticked ${tenderLabels[payment.method]}${payment.reference ? ` ${payment.reference}` : ""}`, amount: payment.amount }]);
    }
    return pending.length;
  }).catch((error: unknown) => (error instanceof Error && error.message === "PAYMENT_CHANGED" ? null : Promise.reject(error)));
  if (verified === null) return json({ error: "Another session confirmed some of these payments. Refresh and try again." }, 409);
  return json({ verified });
}
