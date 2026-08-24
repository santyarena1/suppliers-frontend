-- Referencias de precio de venta (locales retail)

CREATE TABLE "RetailStore" (
    "id" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailStore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetailProduct" (
    "id" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "productUrl" TEXT,
    "imageUrl" TEXT,
    "categoryName" TEXT,
    "searchText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetailPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" INTEGER,
    "previousPrice" DECIMAL(14,4),
    "price" DECIMAL(14,4) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailPriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetailIngestRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "storesTotal" INTEGER NOT NULL DEFAULT 0,
    "storesDone" INTEGER NOT NULL DEFAULT 0,
    "productsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "RetailIngestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetailStore_externalId_key" ON "RetailStore"("externalId");
CREATE INDEX "RetailStore_active_name_idx" ON "RetailStore"("active", "name");

CREATE UNIQUE INDEX "RetailProduct_externalId_key" ON "RetailProduct"("externalId");
CREATE INDEX "RetailProduct_storeId_idx" ON "RetailProduct"("storeId");
CREATE INDEX "RetailProduct_active_price_idx" ON "RetailProduct"("active", "price");
CREATE INDEX "RetailProduct_categoryName_idx" ON "RetailProduct"("categoryName");
CREATE INDEX "RetailProduct_searchText_idx" ON "RetailProduct"("searchText");
CREATE INDEX "RetailProduct_name_idx" ON "RetailProduct"("name");

CREATE UNIQUE INDEX "RetailPriceHistory_productId_externalId_key" ON "RetailPriceHistory"("productId", "externalId");
CREATE INDEX "RetailPriceHistory_productId_changedAt_idx" ON "RetailPriceHistory"("productId", "changedAt");

ALTER TABLE "RetailProduct" ADD CONSTRAINT "RetailProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "RetailStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailPriceHistory" ADD CONSTRAINT "RetailPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "RetailProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
