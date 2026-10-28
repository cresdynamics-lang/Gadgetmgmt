-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "showOnWebsite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "websiteProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "websiteVariantKey" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_showOnWebsite_idx" ON "Product"("showOnWebsite");
CREATE INDEX IF NOT EXISTS "Product_websiteProductId_websiteVariantKey_idx" ON "Product"("websiteProductId", "websiteVariantKey");

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebsiteOrder" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'purchase',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "fulfillment" TEXT NOT NULL DEFAULT 'pickup',
    "deliveryAddress" TEXT,
    "notes" TEXT,
    "subtotalKes" INTEGER NOT NULL,
    "catalogKes" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "items" JSONB NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WebsiteOrder_externalId_key" ON "WebsiteOrder"("externalId");
CREATE INDEX IF NOT EXISTS "WebsiteOrder_status_createdAt_idx" ON "WebsiteOrder"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WebsiteOrder_customerPhone_idx" ON "WebsiteOrder"("customerPhone");
