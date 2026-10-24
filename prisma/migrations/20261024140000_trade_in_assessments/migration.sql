-- CreateEnum
CREATE TYPE "TradeInGrade" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'FAULTY');

-- CreateTable
CREATE TABLE "TradeIn" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "brand" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "storage" TEXT,
    "color" TEXT,
    "serial" TEXT NOT NULL,
    "grade" "TradeInGrade" NOT NULL,
    "batteryHealth" INTEGER,
    "ownershipProof" TEXT NOT NULL,
    "receiptReference" TEXT,
    "hasBox" BOOLEAN NOT NULL DEFAULT false,
    "hasCharger" BOOLEAN NOT NULL DEFAULT false,
    "checks" JSONB NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "resalePrice" INTEGER NOT NULL,
    "notes" TEXT,
    "assessedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeIn_saleId_key" ON "TradeIn"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeIn_productId_key" ON "TradeIn"("productId");

-- CreateIndex
CREATE INDEX "TradeIn_serial_idx" ON "TradeIn"("serial");

-- CreateIndex
CREATE INDEX "TradeIn_createdAt_idx" ON "TradeIn"("createdAt");

-- AddForeignKey
ALTER TABLE "TradeIn" ADD CONSTRAINT "TradeIn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeIn" ADD CONSTRAINT "TradeIn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeIn" ADD CONSTRAINT "TradeIn_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

