-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "referenceDeviceId" TEXT;

-- CreateTable
CREATE TABLE "DeviceCatalogSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "licenseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "refreshSeconds" INTEGER NOT NULL DEFAULT 86400,
    "cursor" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "etag" TEXT,
    "lastModified" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastHttpStatus" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "lastError" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCatalogSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCatalogHost" (
    "origin" TEXT NOT NULL,
    "nextAllowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeviceCatalogHost_pkey" PRIMARY KEY ("origin")
);

-- CreateTable
CREATE TABLE "DeviceCatalogEntry" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "manufacturer" TEXT,
    "category" TEXT NOT NULL,
    "family" TEXT,
    "granularity" TEXT NOT NULL DEFAULT 'MODEL',
    "description" TEXT,
    "modelNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gtins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storage" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memory" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "compatibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "released" TEXT,
    "discontinued" TEXT,
    "specifications" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCatalogIdentifier" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DeviceCatalogIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCatalogObservation" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCatalogObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCatalogSource_enabled_nextRunAt_idx" ON "DeviceCatalogSource"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "DeviceCatalogEntry_brand_name_idx" ON "DeviceCatalogEntry"("brand", "name");

-- CreateIndex
CREATE INDEX "DeviceCatalogEntry_changedAt_idx" ON "DeviceCatalogEntry"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCatalogEntry_sourceId_externalId_key" ON "DeviceCatalogEntry"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "DeviceCatalogIdentifier_normalizedValue_idx" ON "DeviceCatalogIdentifier"("normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCatalogIdentifier_entryId_kind_normalizedValue_key" ON "DeviceCatalogIdentifier"("entryId", "kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "DeviceCatalogObservation_entryId_contentHash_idx" ON "DeviceCatalogObservation"("entryId", "contentHash");

-- CreateIndex
CREATE INDEX "DeviceCatalogObservation_entryId_observedAt_idx" ON "DeviceCatalogObservation"("entryId", "observedAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_referenceDeviceId_fkey" FOREIGN KEY ("referenceDeviceId") REFERENCES "DeviceCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCatalogEntry" ADD CONSTRAINT "DeviceCatalogEntry_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DeviceCatalogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCatalogIdentifier" ADD CONSTRAINT "DeviceCatalogIdentifier_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DeviceCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCatalogObservation" ADD CONSTRAINT "DeviceCatalogObservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DeviceCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
