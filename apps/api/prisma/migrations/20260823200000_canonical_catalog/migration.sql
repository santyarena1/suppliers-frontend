-- Canonical brands/categories for unified catalog filtering

CREATE TABLE "CanonicalBrand" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrandAlias" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rawBrand" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "canonicalBrandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CanonicalCategory" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CategoryAlias" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rawCategory" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "canonicalCategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CanonicalBrand_slug_key" ON "CanonicalBrand"("slug");
CREATE UNIQUE INDEX "BrandAlias_provider_rawBrand_key" ON "BrandAlias"("provider", "rawBrand");
CREATE INDEX "BrandAlias_normalizedKey_idx" ON "BrandAlias"("normalizedKey");
CREATE INDEX "BrandAlias_canonicalBrandId_idx" ON "BrandAlias"("canonicalBrandId");

CREATE UNIQUE INDEX "CanonicalCategory_slug_key" ON "CanonicalCategory"("slug");
CREATE UNIQUE INDEX "CategoryAlias_provider_rawCategory_key" ON "CategoryAlias"("provider", "rawCategory");
CREATE INDEX "CategoryAlias_normalizedKey_idx" ON "CategoryAlias"("normalizedKey");
CREATE INDEX "CategoryAlias_canonicalCategoryId_idx" ON "CategoryAlias"("canonicalCategoryId");

ALTER TABLE "ProviderSyncCache" ADD COLUMN "canonicalBrandId" TEXT;
ALTER TABLE "ProviderSyncCache" ADD COLUMN "canonicalCategoryId" TEXT;

CREATE INDEX "ProviderSyncCache_canonicalBrandId_idx" ON "ProviderSyncCache"("canonicalBrandId");
CREATE INDEX "ProviderSyncCache_canonicalCategoryId_idx" ON "ProviderSyncCache"("canonicalCategoryId");

ALTER TABLE "BrandAlias" ADD CONSTRAINT "BrandAlias_canonicalBrandId_fkey" FOREIGN KEY ("canonicalBrandId") REFERENCES "CanonicalBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryAlias" ADD CONSTRAINT "CategoryAlias_canonicalCategoryId_fkey" FOREIGN KEY ("canonicalCategoryId") REFERENCES "CanonicalCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderSyncCache" ADD CONSTRAINT "ProviderSyncCache_canonicalBrandId_fkey" FOREIGN KEY ("canonicalBrandId") REFERENCES "CanonicalBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderSyncCache" ADD CONSTRAINT "ProviderSyncCache_canonicalCategoryId_fkey" FOREIGN KEY ("canonicalCategoryId") REFERENCES "CanonicalCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
