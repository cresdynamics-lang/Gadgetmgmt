-- CreateEnum
CREATE TYPE "OperationKind" AS ENUM ('REPAIR', 'DELIVERY', 'PARTNER', 'TRADE_IN', 'RETURN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UnitStatus" ADD VALUE 'WITH_PARTNER';
ALTER TYPE "UnitStatus" ADD VALUE 'QUARANTINED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingSource" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "totalCost" INTEGER;

-- AlterTable
ALTER TABLE "StockUnit" ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownership" TEXT NOT NULL DEFAULT 'SHOP';

-- AlterTable
ALTER TABLE "AuthDevice" ADD COLUMN     "activeUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Operation" (
    "partnerDirection" TEXT NOT NULL DEFAULT 'OUT',
    "requestHash" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "kind" "OperationKind" NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "saleId" TEXT,
    "party" TEXT NOT NULL,
    "contact" TEXT,
    "destination" TEXT,
    "reference" TEXT,
    "details" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "codAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "costAmount" INTEGER,
    "proof" TEXT,
    "inspection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceEvent" (
    "requestKey" TEXT,
    "requestHash" TEXT,
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "saleId" TEXT,
    "operationId" TEXT,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "requestHash" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "unitId" TEXT,
    "operationId" TEXT,
    "reversesId" TEXT,
    "billId" TEXT,
    "period" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringBill" (
    "requestHash" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantTarget" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "targetAvailable" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operation_requestKey_key" ON "Operation"("requestKey");

-- CreateIndex
CREATE INDEX "Operation_branchId_kind_status_dueAt_idx" ON "Operation"("branchId", "kind", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Operation_unitId_closedAt_idx" ON "Operation"("unitId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceEvent_requestKey_key" ON "DeviceEvent"("requestKey");

-- CreateIndex
CREATE INDEX "DeviceEvent_unitId_createdAt_idx" ON "DeviceEvent"("unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseEntry_requestKey_key" ON "ExpenseEntry"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseEntry_reversesId_key" ON "ExpenseEntry"("reversesId");

-- CreateIndex
CREATE INDEX "ExpenseEntry_branchId_occurredAt_idx" ON "ExpenseEntry"("branchId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseEntry_billId_period_key" ON "ExpenseEntry"("billId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringBill_requestKey_key" ON "RecurringBill"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "VariantTarget_productId_color_storage_key" ON "VariantTarget"("productId", "color", "storage");

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StockUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceEvent" ADD CONSTRAINT "DeviceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringBill" ADD CONSTRAINT "RecurringBill_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantTarget" ADD CONSTRAINT "VariantTarget_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
