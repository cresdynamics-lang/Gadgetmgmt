-- Each physical phone gets its own barcode, trade-ins keep the owner's ID and email,
-- arrival photos stay on the unit, and a sales goal can belong to one person.

ALTER TABLE "SalesTarget" ADD COLUMN "assigneeId" TEXT;

ALTER TABLE "TradeIn" ADD COLUMN "sellerIdNumber" TEXT;
ALTER TABLE "TradeIn" ADD COLUMN "sellerEmail" TEXT;

ALTER TABLE "DeviceUnit" ADD COLUMN "unitCode" TEXT;

CREATE UNIQUE INDEX "DeviceUnit_unitCode_key" ON "DeviceUnit"("unitCode");

ALTER TABLE "SalesTarget" ADD CONSTRAINT "SalesTarget_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DevicePhoto" (
    "id" TEXT NOT NULL,
    "deviceUnitId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevicePhoto_deviceUnitId_idx" ON "DevicePhoto"("deviceUnitId");

ALTER TABLE "DevicePhoto" ADD CONSTRAINT "DevicePhoto_deviceUnitId_fkey" FOREIGN KEY ("deviceUnitId") REFERENCES "DeviceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
