CREATE TYPE "CreditPlanKind" AS ENUM ('INSTALLMENT', 'LAYAWAY');
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TYPE "CreditStatus" ADD VALUE 'DUE';
ALTER TYPE "CreditStatus" ADD VALUE 'GRACE';
ALTER TYPE "CreditStatus" ADD VALUE 'LATE_1';
ALTER TYPE "CreditStatus" ADD VALUE 'LATE_2';
ALTER TYPE "CreditStatus" ADD VALUE 'LATE_3';
ALTER TYPE "CreditStatus" ADD VALUE 'RECOVERY';
ALTER TYPE "NotificationChannel" ADD VALUE 'WHATSAPP';

ALTER TABLE "Customer" ADD COLUMN "whatsappRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN "reliabilityScore" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "CreditPlan" ADD COLUMN "planReference" TEXT NOT NULL DEFAULT '',
ADD COLUMN "kind" "CreditPlanKind" NOT NULL DEFAULT 'INSTALLMENT',
ADD COLUMN "lateFeeAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lateFeeAppliedAt" TIMESTAMP(3),
ADD COLUMN "earlySettlementDiscountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imei" TEXT;
UPDATE "CreditPlan" SET "planReference" = 'GH' || upper(substr(md5("id"), 1, 10));
ALTER TABLE "CreditPlan" ALTER COLUMN "planReference" DROP DEFAULT;
CREATE UNIQUE INDEX "CreditPlan_planReference_key" ON "CreditPlan"("planReference");
CREATE UNIQUE INDEX "CreditPlan_imei_key" ON "CreditPlan"("imei");
CREATE TABLE "CreditPolicy" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "graceDays" INTEGER NOT NULL DEFAULT 3,
  "lateFeeAmount" INTEGER NOT NULL DEFAULT 0,
  "minimumDepositPercent" INTEGER NOT NULL DEFAULT 20,
  "defaultCreditLimit" INTEGER NOT NULL DEFAULT 0,
  "earlySettlementDiscountPercent" INTEGER NOT NULL DEFAULT 0,
  "managerEscalationDays" INTEGER NOT NULL DEFAULT 3,
  "ownerEscalationDays" INTEGER NOT NULL DEFAULT 7,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditPolicy_branchId_key" ON "CreditPolicy"("branchId");
ALTER TABLE "CreditPolicy" ADD CONSTRAINT "CreditPolicy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditRescheduleRequest" (
  "id" TEXT NOT NULL,
  "creditPlanId" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "requestedDueDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditRescheduleRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CreditRescheduleRequest_status_createdAt_idx" ON "CreditRescheduleRequest"("status", "createdAt");
CREATE UNIQUE INDEX "CreditRescheduleRequest_one_pending_per_plan_key" ON "CreditRescheduleRequest"("creditPlanId") WHERE "status" = 'PENDING';
ALTER TABLE "CreditRescheduleRequest" ADD CONSTRAINT "CreditRescheduleRequest_creditPlanId_fkey" FOREIGN KEY ("creditPlanId") REFERENCES "CreditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerReliabilityEvent" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "scoreDelta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerReliabilityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerReliabilityEvent_customerId_createdAt_idx" ON "CustomerReliabilityEvent"("customerId", "createdAt");
ALTER TABLE "CustomerReliabilityEvent" ADD CONSTRAINT "CustomerReliabilityEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MpesaC2BTransaction" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "billReference" TEXT NOT NULL,
  "phone" TEXT,
  "amount" INTEGER NOT NULL,
  "creditPlanId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MpesaC2BTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MpesaC2BTransaction_transactionId_key" ON "MpesaC2BTransaction"("transactionId");
CREATE INDEX "MpesaC2BTransaction_billReference_createdAt_idx" ON "MpesaC2BTransaction"("billReference", "createdAt");
ALTER TABLE "MpesaC2BTransaction" ADD CONSTRAINT "MpesaC2BTransaction_creditPlanId_fkey" FOREIGN KEY ("creditPlanId") REFERENCES "CreditPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
