ALTER TABLE "DeviceUnit" ADD COLUMN "supplierCode" TEXT;
CREATE INDEX "DeviceUnit_supplierCode_idx" ON "DeviceUnit"("supplierCode");
