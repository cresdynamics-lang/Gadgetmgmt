CREATE TYPE "PaymentRequestStatus" AS ENUM ('CREATED', 'PROCESSING', 'PAID', 'REVIEW', 'FAILED', 'EXPIRED');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

ALTER TABLE "Customer"
ADD COLUMN "smsRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "remindersConsentAt" TIMESTAMP(3);

CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "creditPlanId" TEXT,
    "saleId" TEXT,
    "amount" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'Credit account payment',
    "tokenHash" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "payerPhone" TEXT,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'CREATED',
    "checkoutRequestId" TEXT,
    "merchantRequestId" TEXT,
    "mpesaReceipt" TEXT,
    "stkAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentRequest_tokenHash_key" ON "PaymentRequest"("tokenHash");
CREATE UNIQUE INDEX "PaymentRequest_dedupeKey_key" ON "PaymentRequest"("dedupeKey");
CREATE UNIQUE INDEX "PaymentRequest_checkoutRequestId_key" ON "PaymentRequest"("checkoutRequestId");
CREATE UNIQUE INDEX "PaymentRequest_mpesaReceipt_key" ON "PaymentRequest"("mpesaReceipt");
CREATE INDEX "PaymentRequest_status_expiresAt_idx" ON "PaymentRequest"("status", "expiresAt");
CREATE INDEX "PaymentRequest_creditPlanId_createdAt_idx" ON "PaymentRequest"("creditPlanId", "createdAt");
CREATE UNIQUE INDEX "CustomerNotification_dedupeKey_key" ON "CustomerNotification"("dedupeKey");
CREATE INDEX "CustomerNotification_status_createdAt_idx" ON "CustomerNotification"("status", "createdAt");
CREATE INDEX "CustomerNotification_branchId_createdAt_idx" ON "CustomerNotification"("branchId", "createdAt");

ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_creditPlanId_fkey"
FOREIGN KEY ("creditPlanId") REFERENCES "CreditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_exactlyOneOwner_check"
CHECK (("creditPlanId" IS NOT NULL) <> ("saleId" IS NOT NULL));
CREATE INDEX "PaymentRequest_saleId_createdAt_idx" ON "PaymentRequest"("saleId", "createdAt");
ALTER TABLE "CustomerNotification" ADD CONSTRAINT "CustomerNotification_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNotification" ADD CONSTRAINT "CustomerNotification_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
