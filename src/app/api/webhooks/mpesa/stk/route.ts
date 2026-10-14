import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";

import { recordCreditPayment } from "@/lib/credit-payment";
import { getDarajaConfig, normalizeKenyanPhone } from "@/lib/mpesa";
import { prisma } from "@/lib/prisma";

type StkCallback = {
  Body?: { stkCallback?: {
    CheckoutRequestID?: string;
    ResultCode?: number;
    CallbackMetadata?: { Item?: { Name?: string; Value?: string | number }[] };
  } };
};

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const config = getDarajaConfig();
  const url = new URL(request.url);
  const requestId = url.searchParams.get("request") ?? "";
  const signature = url.searchParams.get("signature") ?? "";
  const expected = config && requestId ? createHmac("sha256", config.callbackSecret).update(requestId).digest("hex") : "";
  if (!config || !requestId || !secureEqual(signature, expected)) return Response.json({ error: "Not found" }, { status: 404 });

  const payload = await request.json().catch(() => null) as StkCallback | null;
  const callback = payload?.Body?.stkCallback;
  if (!callback?.CheckoutRequestID || typeof callback.ResultCode !== "number") return Response.json({ Result: "Accepted" });
  const paymentRequest = await prisma.paymentRequest.findUnique({ where: { id: requestId }, select: { id: true, amount: true, status: true, creditPlanId: true, saleId: true, checkoutRequestId: true, payerPhone: true } });
  if (!paymentRequest || paymentRequest.checkoutRequestId !== callback.CheckoutRequestID || paymentRequest.status === "PAID") return Response.json({ Result: "Accepted" });
  if (callback.ResultCode !== 0) {
    await prisma.paymentRequest.updateMany({ where: { id: paymentRequest.id, status: "PROCESSING" }, data: { status: "FAILED" } });
    return Response.json({ Result: "Accepted" });
  }

  const items = callback.CallbackMetadata?.Item ?? [];
  const itemValue = (name: string) => items.find((item) => item.Name === name)?.Value;
  const amount = Number(itemValue("Amount"));
  const receipt = itemValue("MpesaReceiptNumber");
  const payerPhone = itemValue("PhoneNumber");
  const normalizedCallbackPhone = payerPhone === undefined ? null : normalizeKenyanPhone(String(payerPhone));
  if (!Number.isSafeInteger(amount) || amount !== paymentRequest.amount || typeof receipt !== "string" || !/^[A-Z0-9]{6,20}$/.test(receipt) || !normalizedCallbackPhone || normalizedCallbackPhone !== paymentRequest.payerPhone) {
    console.error("M-Pesa success callback failed payment validation", paymentRequest.id);
    return Response.json({ Result: "Accepted" });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const current = await transaction.paymentRequest.findUnique({ where: { id: paymentRequest.id }, select: { status: true, creditPlanId: true, saleId: true } });
      if (!current || current.status === "PAID" || current.status === "REVIEW") return;
      if (current.creditPlanId) {
        await recordCreditPayment(transaction, {
          creditPlanId: current.creditPlanId,
          amount,
          method: "MPESA",
          reference: receipt,
          notes: `Third-party payment from ${normalizedCallbackPhone}`,
          branchId: null,
          isOwner: true,
          userId: "",
        });
      } else if (current.saleId) {
        const sale = await transaction.sale.findUnique({ where: { id: current.saleId }, include: { saleItems: { select: { productId: true, quantity: true } } } });
        if (!sale || sale.status !== "PENDING" || sale.paidAmount !== 0 || sale.total !== amount) throw new Error("PENDING_SALE_UNAVAILABLE");
        const duplicateSale = await transaction.salePayment.findFirst({ where: { reference: receipt }, select: { id: true } });
        const duplicateCredit = await transaction.payment.findFirst({ where: { reference: receipt }, select: { id: true } });
        if (duplicateSale || duplicateCredit) throw new Error("DUPLICATE_PAYMENT_REFERENCE");
        const updatedSale = await transaction.sale.updateMany({ where: { id: sale.id, status: "PENDING", paidAmount: 0 }, data: { paidAmount: amount, status: "PAID" } });
        if (updatedSale.count !== 1) throw new Error("PENDING_SALE_CHANGED");
        await transaction.salePayment.create({ data: { saleId: sale.id, amount, method: "MPESA", reference: receipt } });
        for (const item of sale.saleItems) {
          const inventory = await transaction.inventoryItem.updateMany({ where: { branchId: sale.branchId, productId: item.productId, stockOnHand: { gte: item.quantity }, reservedStock: { gte: item.quantity } }, data: { stockOnHand: { decrement: item.quantity }, reservedStock: { decrement: item.quantity } } });
          if (inventory.count !== 1) throw new Error("PENDING_SALE_STOCK_UNAVAILABLE");
          await transaction.inventoryMovement.create({ data: { branchId: sale.branchId, productId: item.productId, userId: sale.cashierId, saleId: sale.id, type: "SALE", quantity: -item.quantity, reference: sale.invoiceNumber, note: "Sale completed after confirmed third-party M-Pesa payment" } });
        }
      } else {
        throw new Error("PAYMENT_REQUEST_OWNER_MISSING");
      }
      const updated = await transaction.paymentRequest.updateMany({ where: { id: paymentRequest.id, status: current.status }, data: { status: "PAID", mpesaReceipt: receipt, paidAt: new Date() } });
      if (updated.count !== 1) throw new Error("PAYMENT_REQUEST_ALREADY_HANDLED");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!(error instanceof Error && error.message === "PAYMENT_REQUEST_ALREADY_HANDLED")) {
      console.error("Verified M-Pesa callback needs reconciliation", paymentRequest.id, error instanceof Error ? error.message : "unknown error");
      try {
        await prisma.$transaction(async (transaction) => {
          const current = await transaction.paymentRequest.findUnique({ where: { id: paymentRequest.id }, select: { status: true, creditPlan: { select: { branchId: true, branch: { select: { name: true } } } }, sale: { select: { branchId: true, branch: { select: { name: true } } } } } });
          if (!current || current.status === "PAID" || current.status === "REVIEW") return;
          const moved = await transaction.paymentRequest.updateMany({ where: { id: paymentRequest.id, status: current.status }, data: { status: "REVIEW", mpesaReceipt: receipt, paidAt: new Date() } });
          if (moved.count !== 1) return;
          const branchId = current.creditPlan?.branchId ?? current.sale?.branchId;
          const branchName = current.creditPlan?.branch.name ?? current.sale?.branch.name ?? "GadgetHub";
          if (!branchId) return;
          const recipients = await transaction.user.findMany({ where: { status: "ACTIVE", OR: [{ role: "OWNER" }, { role: "BRANCH_MANAGER", branchId }] }, select: { email: true } });
          await transaction.customerNotification.createMany({
            data: [...new Set(recipients.map((user) => user.email.toLowerCase()))].map((recipient) => ({
              branchId,
              channel: "EMAIL" as const,
              kind: "MPESA_RECONCILIATION",
              recipient,
              subject: `Action required · M-Pesa payment needs reconciliation · ${branchName}`,
              body: `M-Pesa confirmed KES ${amount.toLocaleString("en-KE")} (receipt ${receipt}) for payment request ${paymentRequest.id}, but the account could not be safely updated. Check the M-Pesa statement and sale or credit account, then reconcile the verified payment. The payer link is locked against another charge.`,
              dedupeKey: `mpesa-reconciliation:${paymentRequest.id}:${recipient}`,
            })),
          });
        });
      } catch (alertError) {
        console.error("Could not queue M-Pesa reconciliation alert", paymentRequest.id, alertError instanceof Error ? alertError.message : "unknown error");
      }
    }
  }
  return Response.json({ Result: "Accepted" });
}
