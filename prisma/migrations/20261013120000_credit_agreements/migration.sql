CREATE TYPE "CreditSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "CreditPlan"
  ADD COLUMN "termMonths" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "portalTokenHash" TEXT;

CREATE UNIQUE INDEX "CreditPlan_portalTokenHash_key" ON "CreditPlan"("portalTokenHash");

CREATE TABLE "CreditInstallment" (
  "id" TEXT NOT NULL,
  "creditPlanId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" INTEGER NOT NULL,
  "paidAmount" INTEGER NOT NULL DEFAULT 0,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditInstallment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditInstallment_creditPlanId_sequence_key" ON "CreditInstallment"("creditPlanId", "sequence");
CREATE INDEX "CreditInstallment_dueDate_paidAt_idx" ON "CreditInstallment"("dueDate", "paidAt");
ALTER TABLE "CreditInstallment" ADD CONSTRAINT "CreditInstallment_creditPlanId_fkey"
  FOREIGN KEY ("creditPlanId") REFERENCES "CreditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditPaymentSubmission" (
  "id" TEXT NOT NULL,
  "creditPlanId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "status" "CreditSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditPaymentSubmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditPaymentSubmission_reference_key" ON "CreditPaymentSubmission"("reference");
CREATE INDEX "CreditPaymentSubmission_status_createdAt_idx" ON "CreditPaymentSubmission"("status", "createdAt");
CREATE INDEX "CreditPaymentSubmission_creditPlanId_createdAt_idx" ON "CreditPaymentSubmission"("creditPlanId", "createdAt");
ALTER TABLE "CreditPaymentSubmission" ADD CONSTRAINT "CreditPaymentSubmission_creditPlanId_fkey"
  FOREIGN KEY ("creditPlanId") REFERENCES "CreditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditPaymentSubmission" ADD CONSTRAINT "CreditPaymentSubmission_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
