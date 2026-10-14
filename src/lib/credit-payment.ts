import type { Prisma, TenderMethod } from "@prisma/client";
import { creditStatusForDays, daysUntilDue } from "@/lib/credit-lifecycle";

type Transaction = Prisma.TransactionClient;

export async function recordCreditPayment(
  transaction: Transaction,
  input: {
    creditPlanId: string;
    amount: number;
    method: TenderMethod;
    reference?: string;
    notes?: string;
    branchId: string | null;
    isOwner: boolean;
    userId: string;
  },
) {
  const paymentReference = input.reference?.trim().toUpperCase();
  if (!input.isOwner && !input.branchId) throw new Error("BRANCH_REQUIRED");
  const branchScope = input.isOwner ? {} : { branchId: input.branchId! };
  const plan = await transaction.creditPlan.findFirst({
    where: { id: input.creditPlanId, ...branchScope },
    select: {
      id: true,
      branchId: true,
      customerId: true,
      balance: true,
      totalAmount: true,
      lateFeeAmount: true,
      nextDueDate: true,
      status: true,
      installments: { where: { paidAt: null }, orderBy: { sequence: "asc" }, select: { id: true, amount: true, paidAmount: true, dueDate: true } },
      sale: { select: { id: true, total: true, discountAmount: true, paidAmount: true, status: true } },
    },
  });
  if (!plan || plan.status === "PAID_OFF") throw new Error("PLAN_UNAVAILABLE");
  if (input.amount > plan.balance) throw new Error("PAYMENT_EXCEEDS_BALANCE");
  if (paymentReference) {
    const [duplicateCredit, duplicateSale] = await Promise.all([
      transaction.payment.findFirst({ where: { reference: paymentReference }, select: { id: true } }),
      transaction.salePayment.findFirst({ where: { reference: paymentReference }, select: { id: true } }),
    ]);
    if (duplicateCredit || duplicateSale) throw new Error("DUPLICATE_PAYMENT_REFERENCE");
  }

  const now = new Date();
  const policy = await transaction.creditPolicy.findUnique({ where: { branchId: plan.branchId }, select: { graceDays: true, earlySettlementDiscountPercent: true } });
  const eligibleForEarlyDiscount = daysUntilDue(plan.nextDueDate, now) > 0;
  const productBalance = Math.max(0, plan.balance - plan.lateFeeAmount);
  const discountOffer = eligibleForEarlyDiscount ? Math.floor(productBalance * (policy?.earlySettlementDiscountPercent ?? 0) / 100) : 0;
  const earlySettlementDiscount = discountOffer > 0 && input.amount === plan.balance - discountOffer ? discountOffer : 0;
  const nextBalance = earlySettlementDiscount > 0 ? 0 : plan.balance - input.amount;
  let remainingPayment = input.amount + earlySettlementDiscount;
  let nextDueDate: Date | null = null;
  const installmentUpdates: { id: string; paidAmount: number; paidAt: Date | null }[] = [];
  let onTimeInstallments = 0;
  for (const installment of plan.installments) {
    const remainingInstallment = installment.amount - installment.paidAmount;
    const applied = Math.min(remainingPayment, remainingInstallment);
    const paidAmount = installment.paidAmount + applied;
    const paidAt = paidAmount === installment.amount ? now : null;
    if (paidAt && daysUntilDue(installment.dueDate, now) >= 0) onTimeInstallments += 1;
    if (!paidAt && !nextDueDate) nextDueDate = installment.dueDate;
    installmentUpdates.push({ id: installment.id, paidAmount, paidAt });
    remainingPayment -= applied;
  }
  if (!nextDueDate && nextBalance > 0) nextDueDate = plan.nextDueDate;
  const updated = await transaction.creditPlan.updateMany({
    where: { id: plan.id, ...branchScope, balance: plan.balance, status: { not: "PAID_OFF" } },
    data: {
      balance: { decrement: earlySettlementDiscount > 0 ? plan.balance : input.amount },
      ...(earlySettlementDiscount > 0 ? {
        totalAmount: { decrement: earlySettlementDiscount },
        earlySettlementDiscountAmount: { increment: earlySettlementDiscount },
      } : {}),
      status: nextBalance === 0 ? "PAID_OFF" : creditStatusForDays(daysUntilDue(nextDueDate ?? plan.nextDueDate, now), policy?.graceDays ?? 3),
      ...(nextDueDate ? { nextDueDate } : {}),
    },
  });
  if (updated.count !== 1) throw new Error("PLAN_CHANGED");

  const payment = await transaction.payment.create({
    data: {
      creditPlanId: plan.id,
      amount: input.amount,
      method: input.method,
      reference: paymentReference || null,
      notes: input.notes || null,
    },
  });

  for (const installment of installmentUpdates) {
    await transaction.creditInstallment.update({
      where: { id: installment.id },
      data: { paidAmount: installment.paidAmount, paidAt: installment.paidAt },
    });
  }

  if (onTimeInstallments) {
    const scoreDelta = Math.min(onTimeInstallments * 2, 10);
    await transaction.customerReliabilityEvent.create({ data: { customerId: plan.customerId, scoreDelta, reason: `${onTimeInstallments} installment${onTimeInstallments === 1 ? "" : "s"} paid by the due date.` } });
    const customer = await transaction.customer.findUnique({ where: { id: plan.customerId }, select: { reliabilityScore: true } });
    if (customer) await transaction.customer.update({ where: { id: plan.customerId }, data: { reliabilityScore: Math.min(100, customer.reliabilityScore + scoreDelta) } });
  }

  if (plan.sale) {
    const saleTotalAfterDiscount = plan.sale.total - earlySettlementDiscount;
    const nextSalePaidAmount = Math.min(saleTotalAfterDiscount, plan.sale.paidAmount + input.amount);
    const saleUpdated = await transaction.sale.updateMany({
      where: { id: plan.sale.id, paidAmount: plan.sale.paidAmount, status: { not: "VOIDED" } },
      data: {
        paidAmount: nextSalePaidAmount,
        total: { decrement: earlySettlementDiscount },
        discountAmount: { increment: earlySettlementDiscount },
        status: nextSalePaidAmount === saleTotalAfterDiscount ? "PAID" : "PARTIAL",
      },
    });
    if (saleUpdated.count !== 1) throw new Error("SALE_CHANGED");
  }

  return { payment, balance: nextBalance, earlySettlementDiscount, salePaidAmount: plan.sale ? Math.min(plan.sale.total - earlySettlementDiscount, plan.sale.paidAmount + input.amount) : null };
}
