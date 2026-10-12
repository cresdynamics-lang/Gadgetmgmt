CREATE TYPE "TenderMethod" AS ENUM ('CASH', 'MPESA', 'CARD');

CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "TenderMethod" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement"
ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "SalePayment_saleId_createdAt_idx"
ON "SalePayment"("saleId", "createdAt");

CREATE UNIQUE INDEX "InventoryMovement_idempotencyKey_key"
ON "InventoryMovement"("idempotencyKey");

ALTER TABLE "SalePayment"
ADD CONSTRAINT "SalePayment_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
