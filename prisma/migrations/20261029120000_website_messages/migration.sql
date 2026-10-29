-- CreateTable
CREATE TABLE "WebsiteMessage" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "topic" TEXT,
    "body" TEXT,
    "orderRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteMessage_externalId_key" ON "WebsiteMessage"("externalId");

-- CreateIndex
CREATE INDEX "WebsiteMessage_createdAt_idx" ON "WebsiteMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WebsiteMessage_kind_createdAt_idx" ON "WebsiteMessage"("kind", "createdAt");
