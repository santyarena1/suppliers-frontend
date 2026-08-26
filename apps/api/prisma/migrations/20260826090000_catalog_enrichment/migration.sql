-- CreateEnum
CREATE TYPE "CatalogAliasKind" AS ENUM ('BRAND', 'CATEGORY', 'SUBCATEGORY');

-- CreateEnum
CREATE TYPE "CatalogMatchKind" AS ENUM ('EAN', 'PART_NUMBER');

-- CreateEnum
CREATE TYPE "CatalogEnrichmentSource" AS ENUM ('MANUAL', 'AUTO', 'AI');

-- CreateTable
CREATE TABLE "PlatformCatalogAlias" (
    "id" TEXT NOT NULL,
    "kind" "CatalogAliasKind" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "rawKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" "CatalogEnrichmentSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCatalogAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformProductIdentity" (
    "id" TEXT NOT NULL,
    "matchKind" "CatalogMatchKind" NOT NULL,
    "matchKey" TEXT NOT NULL,
    "displayBrand" TEXT,
    "displayCategory" TEXT,
    "displaySubcategory" TEXT,
    "source" "CatalogEnrichmentSource" NOT NULL DEFAULT 'MANUAL',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformProductIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCatalogAlias_kind_provider_rawKey_key" ON "PlatformCatalogAlias"("kind", "provider", "rawKey");

-- CreateIndex
CREATE INDEX "PlatformCatalogAlias_kind_groupId_idx" ON "PlatformCatalogAlias"("kind", "groupId");

-- CreateIndex
CREATE INDEX "PlatformCatalogAlias_kind_provider_idx" ON "PlatformCatalogAlias"("kind", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformProductIdentity_matchKind_matchKey_key" ON "PlatformProductIdentity"("matchKind", "matchKey");
