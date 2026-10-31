-- CreateEnum
CREATE TYPE "DeviceUnitStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD');

-- CreateTable
CREATE TABLE "DeviceUnit" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "imei" TEXT,
    "serial" TEXT,
    "condition" "ProductCondition" NOT NULL,
    "colour" TEXT,
    "storage" TEXT,
    "mpn" TEXT,
    "modelNumber" TEXT,
    "batteryHealth" INTEGER,
    "fmi" TEXT,
    "sim" TEXT,
    "osVersion" TEXT,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "status" "DeviceUnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "sourceKind" "InventorySourceKind",
    "vendorName" TEXT,
    "sourceName" TEXT,
    "sourcePhone" TEXT,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT NOT NULL,
    "tradeInId" TEXT,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "soldAt" TIMESTAMP(3),
    "soldById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceUnit_tradeInId_key" ON "DeviceUnit"("tradeInId");

-- CreateIndex
CREATE INDEX "DeviceUnit_imei_idx" ON "DeviceUnit"("imei");

-- CreateIndex
CREATE INDEX "DeviceUnit_serial_idx" ON "DeviceUnit"("serial");

-- CreateIndex
CREATE INDEX "DeviceUnit_productId_status_idx" ON "DeviceUnit"("productId", "status");

-- CreateIndex
CREATE INDEX "DeviceUnit_saleId_idx" ON "DeviceUnit"("saleId");

-- CreateIndex
CREATE INDEX "DeviceUnit_receivedAt_idx" ON "DeviceUnit"("receivedAt");

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_tradeInId_fkey" FOREIGN KEY ("tradeInId") REFERENCES "TradeIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

