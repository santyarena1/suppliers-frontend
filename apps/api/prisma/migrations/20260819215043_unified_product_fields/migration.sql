-- AlterTable
ALTER TABLE "ProviderSyncCache" ADD COLUMN     "dimensionsUnit" TEXT,
ADD COLUMN     "finalPrice" DECIMAL(14,4),
ADD COLUMN     "height" DECIMAL(10,3),
ADD COLUMN     "ivaPercent" DECIMAL(6,2),
ADD COLUMN     "length" DECIMAL(10,3),
ADD COLUMN     "longDescription" TEXT,
ADD COLUMN     "productUrl" TEXT,
ADD COLUMN     "stockStatus" TEXT,
ADD COLUMN     "tags" TEXT,
ADD COLUMN     "volume" DECIMAL(12,3),
ADD COLUMN     "warranty" TEXT,
ADD COLUMN     "weight" DECIMAL(10,3),
ADD COLUMN     "weightUnit" TEXT,
ADD COLUMN     "width" DECIMAL(10,3);

