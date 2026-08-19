-- AlterTable
ALTER TABLE "ProviderSyncCache" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "ean" TEXT,
ADD COLUMN     "partNumber" TEXT,
ADD COLUMN     "raw" JSONB NOT NULL,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stock" INTEGER,
ADD COLUMN     "subcategory" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "price",
ADD COLUMN     "price" DECIMAL(14,4),
ALTER COLUMN "imageUrl" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ProviderSyncCache_provider_sku_idx" ON "ProviderSyncCache"("provider", "sku");

