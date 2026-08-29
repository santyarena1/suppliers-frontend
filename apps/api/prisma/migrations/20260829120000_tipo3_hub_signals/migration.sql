-- AlterTable
ALTER TABLE "BrandLanding" ADD COLUMN "html" TEXT;
ALTER TABLE "BrandLanding" ADD COLUMN "primaryColor" TEXT;
ALTER TABLE "BrandLanding" ADD COLUMN "backgroundColor" TEXT;
ALTER TABLE "BrandLanding" ADD COLUMN "textColor" TEXT;
ALTER TABLE "BrandLanding" ADD COLUMN "fontFamily" TEXT;

-- CreateEnum
CREATE TYPE "BrandResourceKind" AS ENUM ('MATERIAL', 'TRAINING');

-- CreateEnum
CREATE TYPE "BrandSignalLight" AS ENUM ('GREEN', 'YELLOW', 'RED', 'BLUE', 'GRAY');

-- CreateTable
CREATE TABLE "BrandResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "BrandResourceKind" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "contentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandSkuSignal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "imageUrl" TEXT,
    "light" "BrandSignalLight" NOT NULL DEFAULT 'YELLOW',
    "suggestedPrice" DECIMAL(14,4),
    "qtyEstimate" INTEGER,
    "incomingAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandSkuSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandResource_tenantId_kind_idx" ON "BrandResource"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BrandSkuSignal_tenantId_provider_externalId_key" ON "BrandSkuSignal"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "BrandSkuSignal_tenantId_light_idx" ON "BrandSkuSignal"("tenantId", "light");

-- CreateIndex
CREATE INDEX "BrandSkuSignal_provider_externalId_idx" ON "BrandSkuSignal"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "BrandResource" ADD CONSTRAINT "BrandResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandSkuSignal" ADD CONSTRAINT "BrandSkuSignal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
