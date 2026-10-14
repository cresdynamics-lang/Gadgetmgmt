import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { canUseCapability } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!canUseCapability(session.user.role, "credit") || !["OWNER", "BRANCH_MANAGER"].includes(session.user.role)) return NextResponse.json({ error: "Only owners and branch managers can reconcile M-Pesa payments." }, { status: 403 });
  const { token: requestId } = await params;
  const paymentRequest = await prisma.paymentRequest.findFirst({
    where: { id: requestId, status: "REVIEW", ...(session.user.role === "OWNER" ? {} : { OR: [{ creditPlan: { branchId: session.user.branchId ?? "" } }, { sale: { branchId: session.user.branchId ?? "" } }] }) },
    select: { id: true, amount: true, mpesaReceipt: true, creditPlanId: true, saleId: true },
  });
  if (!paymentRequest || !paymentRequest.mpesaReceipt) return NextResponse.json({ error: "This payment does not need reconciliation." }, { status: 404 });

  try {
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.paymentRequest.findUnique({ where: { id: paymentRequest.id }, select: { status: true, amount: true, mpesaReceipt: true, creditPlanId: true, saleId: true } });
      if (!current || current.status !== "REVIEW" || !current.mpesaReceipt) throw new Error("REQUEST_CHANGED");
      if (current.creditPlanId) {
        const payment = await transaction.payment.findFirst({ where: { creditPlanId: current.creditPlanId, amount: current.amount, reference: current.mpesaReceipt }, select: { id: true } });
        if (!payment) throw new Error("CREDIT_LEDGER_PAYMENT_MISSING");
      } else if (current.saleId) {
        const sale = await transaction.sale.findUnique({ where: { id: current.saleId }, include: { saleItems: { select: { productId: true, quantity: true } } } });
        if (!sale || sale.status !== "PENDING" || sale.paidAmount !== 0 || sale.total !== current.amount) throw new Error("PENDING_SALE_UNAVAILABLE");
        const [duplicateSale, duplicateCredit] = await Promise.all([
          transaction.salePayment.findFirst({ where: { reference: current.mpesaReceipt }, select: { id: true } }),
          transaction.payment.findFirst({ where: { reference: current.mpesaReceipt }, select: { id: true } }),
        ]);
        if (duplicateSale || duplicateCredit) throw new Error("DUPLICATE_PAYMENT_REFERENCE");
        const updatedSale = await transaction.sale.updateMany({ where: { id: sale.id, status: "PENDING", paidAmount: 0 }, data: { paidAmount: current.amount, status: "PAID" } });
        if (updatedSale.count !== 1) throw new Error("PENDING_SALE_CHANGED");
        await transaction.salePayment.create({ data: { saleId: sale.id, amount: current.amount, method: "MPESA", reference: current.mpesaReceipt } });
        for (const item of sale.saleItems) {
          const inventory = await transaction.inventoryItem.updateMany({ where: { branchId: sale.branchId, productId: item.productId, stockOnHand: { gte: item.quantity }, reservedStock: { gte: item.quantity } }, data: { stockOnHand: { decrement: item.quantity }, reservedStock: { decrement: item.quantity } } });
          if (inventory.count !== 1) throw new Error("PENDING_SALE_STOCK_UNAVAILABLE");
          await transaction.inventoryMovement.create({ data: { branchId: sale.branchId, productId: item.productId, userId: sale.cashierId, saleId: sale.id, type: "SALE", quantity: -item.quantity, reference: sale.invoiceNumber, note: "Sale reconciled after verified third-party M-Pesa payment" } });
        }
      } else {
        throw new Error("PAYMENT_REQUEST_OWNER_MISSING");
      }
      const updated = await transaction.paymentRequest.updateMany({ where: { id: paymentRequest.id, status: "REVIEW" }, data: { status: "PAID" } });
      if (updated.count !== 1) throw new Error("REQUEST_CHANGED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "CREDIT_LEDGER_PAYMENT_MISSING") return NextResponse.json({ error: "Verify the receipt and record the payment against its credit plan first. This link remains locked against another charge." }, { status: 409 });
    if (error instanceof Error && error.message === "PENDING_SALE_UNAVAILABLE") return NextResponse.json({ error: "This sale is no longer waiting for payment. Check stock and the M-Pesa statement, then contact the business administrator to resolve this charge." }, { status: 409 });
    if (error instanceof Error && error.message === "PENDING_SALE_STOCK_UNAVAILABLE") return NextResponse.json({ error: "The payment is verified, but the reserved stock needs an administrator to reconcile inventory." }, { status: 409 });
    if (error instanceof Error && error.message === "DUPLICATE_PAYMENT_REFERENCE") return NextResponse.json({ error: "This M-Pesa receipt is already recorded on another account. Review the existing payment before reconciling." }, { status: 409 });
    if (error instanceof Error && error.message === "REQUEST_CHANGED") return NextResponse.json({ error: "The request changed while being reconciled. Refresh and try again." }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Another payment changed this sale. Refresh and reconcile again." }, { status: 409 });
    console.error("Payment request reconciliation failed", paymentRequest.id, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Payment could not be reconciled." }, { status: 500 });
  }
}
