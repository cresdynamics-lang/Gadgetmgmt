CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD', 'IN_REPAIR', 'RETURNED');
CREATE TYPE "DeviceCondition" AS ENUM ('NEW', 'OPEN_BOX', 'REFURBISHED', 'USED');
CREATE TYPE "NetworkLock" AS ENUM ('UNKNOWN', 'LOCKED', 'UNLOCKED');
CREATE TYPE "ActivationLock" AS ENUM ('UNKNOWN', 'ON', 'OFF');
CREATE TYPE "CosmeticGrade" AS ENUM ('A', 'B', 'C');

ALTER TABLE "Product" ADD COLUMN "unitTracking" BOOLEAN;

CREATE TABLE "StockUnit" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "imei" TEXT,
  "imei2" TEXT,
  "serialNumber" TEXT,
  "barcode" TEXT,
  "status" "UnitStatus" NOT NULL DEFAULT 'IN_STOCK',
  "condition" "DeviceCondition" NOT NULL DEFAULT 'NEW',
  "cosmeticGrade" "CosmeticGrade",
  "color" TEXT,
  "storage" TEXT,
  "ram" TEXT,
  "screenSize" TEXT,
  "processor" TEXT,
  "region" TEXT,
  "camera" TEXT,
  "networkLock" "NetworkLock" NOT NULL DEFAULT 'UNKNOWN',
  "osVersion" TEXT,
  "activationLock" "ActivationLock" NOT NULL DEFAULT 'UNKNOWN',
  "batteryHealth" INTEGER,
  "location" TEXT,
  "supplierName" TEXT,
  "purchaseReference" TEXT,
  "notes" TEXT,
  "saleItemId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockUnit_imei_key" ON "StockUnit"("imei");
CREATE UNIQUE INDEX "StockUnit_imei2_key" ON "StockUnit"("imei2");
CREATE UNIQUE INDEX "StockUnit_serialNumber_key" ON "StockUnit"("serialNumber");
CREATE INDEX "StockUnit_branchId_status_idx" ON "StockUnit"("branchId", "status");
CREATE INDEX "StockUnit_productId_status_idx" ON "StockUnit"("productId", "status");
CREATE INDEX "StockUnit_saleItemId_idx" ON "StockUnit"("saleItemId");

ALTER TABLE "StockUnit" ADD CONSTRAINT "StockUnit_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockUnit" ADD CONSTRAINT "StockUnit_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockUnit" ADD CONSTRAINT "StockUnit_recordedById_fkey"
FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockUnit" ADD CONSTRAINT "StockUnit_saleItemId_fkey"
FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
