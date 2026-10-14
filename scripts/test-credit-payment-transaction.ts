import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { recordCreditPayment } from "../src/lib/credit-payment";

const prisma = new PrismaClient();
const rollbackMarker = "ROLLBACK_CREDIT_PAYMENT_SMOKE_TEST";

async function main() {
  try {
    await prisma.$transaction(async (transaction) => {
      const branches = await transaction.branch.findMany({ where: { isActive: true }, select: { id: true }, take: 10 });
      const owner = await transaction.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true, branchId: true } });
      const branch = branches.find((candidate) => candidate.id !== owner?.branchId) ?? branches[0];
      const product = branch
        ? await transaction.product.findFirst({ where: { branchId: branch.id }, select: { id: true } })
        : null;
      if (!branch || !owner || !product) {
        throw new Error("Credit payment smoke test requires an active branch, owner, and product.");
      }

      const suffix = randomBytes(6).toString("hex").toUpperCase();
      const customer = await transaction.customer.create({
        data: { name: `Credit smoke ${suffix}`, phone: `000${suffix}`, branchId: branch.id },
        select: { id: true },
      });
      const sale = await transaction.sale.create({
        data: {
          invoiceNumber: `GH-CREDIT-TEST-${suffix}`,
          branchId: branch.id,
          cashierId: owner.id,
          customerId: customer.id,
          total: 200,
          paidAmount: 0,
          paymentMethod: "CREDIT",
          status: "PARTIAL",
        },
        select: { id: true },
      });
      const plan = await transaction.creditPlan.create({
        data: {
          saleId: sale.id,
          branchId: branch.id,
          customerId: customer.id,
          productId: product.id,
          totalAmount: 200,
          balance: 200,
          installmentCount: 2,
          nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      const otherBranch = branches.find((candidate) => candidate.id !== branch.id);
      if (otherBranch) {
        await assert.rejects(
          recordCreditPayment(transaction, {
            creditPlanId: plan.id,
            amount: 1,
            method: "CASH",
            branchId: otherBranch.id,
            isOwner: false,
            userId: owner.id,
          }),
          /PLAN_UNAVAILABLE/,
        );
      }

      const first = await recordCreditPayment(transaction, {
        creditPlanId: plan.id,
        amount: 75,
        method: "CASH",
        reference: `CREDIT-TEST-${suffix}-1`,
        branchId: null,
        isOwner: true,
        userId: owner.id,
      });
      const afterFirst = await transaction.sale.findUniqueOrThrow({ where: { id: sale.id }, select: { paidAmount: true, status: true } });
      assert.equal(first.balance, 125);
      assert.equal(afterFirst.paidAmount, 75);
      assert.equal(afterFirst.status, "PARTIAL");

      const final = await recordCreditPayment(transaction, {
        creditPlanId: plan.id,
        amount: 125,
        method: "MPESA",
        reference: `CREDIT-TEST-${suffix}-2`,
        branchId: branch.id,
        isOwner: false,
        userId: owner.id,
      });
      const [savedSale, savedPlan, paymentCount] = await Promise.all([
        transaction.sale.findUniqueOrThrow({ where: { id: sale.id }, select: { paidAmount: true, total: true, status: true } }),
        transaction.creditPlan.findUniqueOrThrow({ where: { id: plan.id }, select: { balance: true, status: true } }),
        transaction.payment.count({ where: { creditPlanId: plan.id } }),
      ]);
      assert.equal(final.balance, 0);
      assert.equal(savedPlan.balance, 0);
      assert.equal(savedPlan.status, "PAID_OFF");
      assert.equal(savedSale.paidAmount, savedSale.total);
      assert.equal(savedSale.status, "PAID");
      assert.equal(paymentCount, 2);
      throw new Error(rollbackMarker);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMarker) throw error;
  }

  console.log("Credit payment smoke test passed; branch scoping, installment ledger, and linked sale settlement were verified and rolled back.");
}

main()
  .catch((error) => {
    console.error("Credit payment smoke test failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());