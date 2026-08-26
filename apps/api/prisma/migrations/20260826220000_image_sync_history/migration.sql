-- AlterTable
ALTER TABLE "ImageSyncSettings" ADD COLUMN IF NOT EXISTS "cronEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ImageSyncRun" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "ImageSyncRun" ADD COLUMN IF NOT EXISTS "maxItems" INTEGER;

-- CreateTable
CREATE TABLE "ImageSyncFill" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "productId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "query" TEXT NOT NULL,
    "imageUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'serper',
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageSyncFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageSyncFill_productId_key" ON "ImageSyncFill"("productId");

-- CreateIndex
CREATE INDEX "ImageSyncFill_createdAt_idx" ON "ImageSyncFill"("createdAt");

-- CreateIndex
CREATE INDEX "ImageSyncFill_status_idx" ON "ImageSyncFill"("status");

-- CreateIndex
CREATE INDEX "ImageSyncFill_provider_idx" ON "ImageSyncFill"("provider");

-- AddForeignKey
ALTER TABLE "ImageSyncFill" ADD CONSTRAINT "ImageSyncFill_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImageSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageSyncFill" ADD CONSTRAINT "ImageSyncFill_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProviderSyncCache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
