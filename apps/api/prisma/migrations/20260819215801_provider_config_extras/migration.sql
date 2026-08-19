-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "lastSyncCreated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSyncUpdated" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minStockThreshold" INTEGER NOT NULL DEFAULT 0;
