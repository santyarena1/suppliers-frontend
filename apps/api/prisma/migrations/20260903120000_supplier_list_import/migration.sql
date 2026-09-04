-- CreateEnum
CREATE TYPE "OfferSource" AS ENUM ('SYNC', 'OWN_LIST', 'BASE_LIST');

-- CreateEnum
CREATE TYPE "ImportProfileStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImportNumberFormat" AS ENUM ('DOT', 'COMMA');

-- CreateEnum
CREATE TYPE "ImportDividerMeaning" AS ENUM ('BRAND', 'CATEGORY', 'IGNORE');

-- CreateEnum
CREATE TYPE "ListImportLevel" AS ENUM ('BASE', 'TENANT');

-- CreateEnum
CREATE TYPE "ListImportStatus" AS ENUM ('PROCESSING', 'NEEDS_REVIEW', 'APPLIED', 'DISCARDED', 'REVERTED', 'FAILED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "listUpdateDays" INTEGER;

-- AlterTable
ALTER TABLE "TenantProductOffer" ADD COLUMN     "source" "OfferSource" NOT NULL DEFAULT 'SYNC';

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "importSanity" JSONB;

-- CreateTable
CREATE TABLE "SupplierBaseOffer" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "price" DECIMAL(14,4),
    "finalPrice" DECIMAL(14,4),
    "currency" TEXT,
    "ivaPercent" DECIMAL(6,2),
    "stock" INTEGER,
    "stockStatus" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierBaseOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportProfile" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ImportProfileStatus" NOT NULL DEFAULT 'PROPOSED',
    "fingerprint" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "sheetIndex" INTEGER NOT NULL DEFAULT 0,
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 0,
    "columnMap" JSONB NOT NULL,
    "currency" TEXT,
    "priceIncludesIva" BOOLEAN NOT NULL DEFAULT false,
    "ivaPercent" DECIMAL(6,2),
    "numberFormat" "ImportNumberFormat" NOT NULL DEFAULT 'COMMA',
    "dividerMeaning" "ImportDividerMeaning" NOT NULL DEFAULT 'IGNORE',
    "sampleRows" JSONB,
    "proposedByAi" BOOLEAN NOT NULL DEFAULT false,
    "aiReasoning" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierListImport" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "level" "ListImportLevel" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedAssetId" TEXT,
    "profileId" TEXT,
    "status" "ListImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsData" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "reviewReasons" JSONB,
    "diff" JSONB,
    "preview" JSONB,
    "normalizedRows" JSONB,
    "snapshot" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierListImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowIssue" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "ImportRowIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierBaseOffer_provider_syncedAt_idx" ON "SupplierBaseOffer"("provider", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBaseOffer_provider_externalId_key" ON "SupplierBaseOffer"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ImportProfile_provider_status_idx" ON "ImportProfile"("provider", "status");

-- CreateIndex
CREATE INDEX "ImportProfile_provider_fingerprint_idx" ON "ImportProfile"("provider", "fingerprint");

-- CreateIndex
CREATE INDEX "SupplierListImport_provider_level_status_createdAt_idx" ON "SupplierListImport"("provider", "level", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierListImport_tenantId_createdAt_idx" ON "SupplierListImport"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRowIssue_importId_idx" ON "ImportRowIssue"("importId");

-- AddForeignKey
ALTER TABLE "SupplierListImport" ADD CONSTRAINT "SupplierListImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierListImport" ADD CONSTRAINT "SupplierListImport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ImportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowIssue" ADD CONSTRAINT "ImportRowIssue_importId_fkey" FOREIGN KEY ("importId") REFERENCES "SupplierListImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

