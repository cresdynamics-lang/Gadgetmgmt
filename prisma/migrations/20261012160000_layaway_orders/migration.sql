CREATE TYPE "LayawayStatus" AS ENUM ('ACTIVE', 'READY_FOR_PICKUP', 'FULFILLED');

ALTER TYPE "InventoryMovementType" ADD VALUE 'RESERVATION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'RESERVATION_RELEASE';

CREATE TABLE "LayawayOrder" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL,
    "status" "LayawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    CONSTRAINT "LayawayOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayawayPayment" (
    "id" TEXT NOT NULL,
    "layawayOrderId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "TenderMethod" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LayawayPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Sale" ADD COLUMN "layawayOrderId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "layawayOrderId" TEXT;

CREATE UNIQUE INDEX "Sale_layawayOrderId_key" ON "Sale"("layawayOrderId");
CREATE INDEX "LayawayOrder_branchId_status_createdAt_idx" ON "LayawayOrder"("branchId", "status", "createdAt");
CREATE INDEX "LayawayOrder_customerId_createdAt_idx" ON "LayawayOrder"("customerId", "createdAt");
CREATE INDEX "LayawayPayment_layawayOrderId_createdAt_idx" ON "LayawayPayment"("layawayOrderId", "createdAt");
CREATE INDEX "InventoryMovement_layawayOrderId_idx" ON "InventoryMovement"("layawayOrderId");

ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayOrder" ADD CONSTRAINT "LayawayOrder_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayPayment" ADD CONSTRAINT "LayawayPayment_layawayOrderId_fkey"
FOREIGN KEY ("layawayOrderId") REFERENCES "LayawayOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayawayPayment" ADD CONSTRAINT "LayawayPayment_receivedById_fkey"
FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_layawayOrderId_fkey"
FOREIGN KEY ("layawayOrderId") REFERENCES "LayawayOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_layawayOrderId_fkey"
FOREIGN KEY ("layawayOrderId") REFERENCES "LayawayOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;