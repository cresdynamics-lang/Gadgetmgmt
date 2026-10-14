import type { Prisma, TenderMethod } from "@prisma/client";

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
      balance: true,
      nextDueDate: true,
      status: true,
      installments: { where: { paidAt: null }, orderBy: { sequence: "asc" }, select: { id: true, amount: true, paidAmount: true, dueDate: true } },
      sale: { select: { id: true, total: true, paidAmount: true, status: true } },
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

  const nextBalance = plan.balance - input.amount;
  const now = new Date();
  let remainingPayment = input.amount;
  let nextDueDate: Date | null = null;
  const installmentUpdates: { id: string; paidAmount: number; paidAt: Date | null }[] = [];
  for (const installment of plan.installments) {
    const remainingInstallment = installment.amount - installment.paidAmount;
    const applied = Math.min(remainingPayment, remainingInstallment);
    const paidAmount = installment.paidAmount + applied;
    const paidAt = paidAmount === installment.amount ? now : null;
    if (!paidAt && !nextDueDate) nextDueDate = installment.dueDate;
    installmentUpdates.push({ id: installment.id, paidAmount, paidAt });
    remainingPayment -= applied;
  }
  if (!nextDueDate && nextBalance > 0) nextDueDate = plan.nextDueDate;
  const updated = await transaction.creditPlan.updateMany({
    where: { id: plan.id, ...branchScope, balance: plan.balance, status: { not: "PAID_OFF" } },
    data: {
      balance: { decrement: input.amount },
      status: nextBalance === 0 ? "PAID_OFF" : nextDueDate && nextDueDate < now ? "OVERDUE" : "ACTIVE",
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

  if (plan.sale) {
    const nextSalePaidAmount = plan.sale.paidAmount + input.amount;
    if (nextSalePaidAmount > plan.sale.total) throw new Error("SALE_PAYMENT_EXCEEDS_TOTAL");
    const saleUpdated = await transaction.sale.updateMany({
      where: { id: plan.sale.id, paidAmount: plan.sale.paidAmount, status: { not: "VOIDED" } },
      data: {
        paidAmount: { increment: input.amount },
        status: nextSalePaidAmount === plan.sale.total ? "PAID" : "PARTIAL",
      },
    });
    if (saleUpdated.count !== 1) throw new Error("SALE_CHANGED");
  }

  return { payment, balance: nextBalance, salePaidAmount: plan.sale ? plan.sale.paidAmount + input.amount : null };
}
