-- Money In: bank transfer tender, owner verification of M-Pesa/bank entries, sale activity trail, 40% Lipa deposit.
ALTER TYPE "TenderMethod" ADD VALUE IF NOT EXISTS 'BANK';
ALTER TYPE "TenderMethod" ADD VALUE IF NOT EXISTS 'TRADE_IN';

ALTER TABLE "SalePayment"
  ADD COLUMN "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SalePayment_requiresVerification_verifiedAt_idx" ON "SalePayment"("requiresVerification", "verifiedAt");

CREATE TABLE "SaleEvent" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT,
  "kind" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "amount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleEvent_saleId_createdAt_idx" ON "SaleEvent"("saleId", "createdAt");
CREATE INDEX "SaleEvent_createdAt_idx" ON "SaleEvent"("createdAt");
ALTER TABLE "SaleEvent" ADD CONSTRAINT "SaleEvent_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleEvent" ADD CONSTRAINT "SaleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lipa Mdogo Mdogo now needs a 40% deposit. Only branches still on the old 20% default are moved.
ALTER TABLE "CreditPolicy" ALTER COLUMN "minimumDepositPercent" SET DEFAULT 40;
UPDATE "CreditPolicy" SET "minimumDepositPercent" = 40 WHERE "minimumDepositPercent" = 20;
