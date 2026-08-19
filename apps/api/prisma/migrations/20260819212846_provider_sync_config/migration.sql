-- CreateEnum
CREATE TYPE "MissingProductAction" AS ENUM ('KEEP', 'OUT_OF_STOCK', 'HIDE', 'DELETE');

-- CreateEnum
CREATE TYPE "ZeroStockAction" AS ENUM ('KEEP', 'HIDE', 'DELETE');

-- AlterTable
ALTER TABLE "ProviderSyncCache" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProviderSyncConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "missingProductAction" "MissingProductAction" NOT NULL DEFAULT 'KEEP',
    "zeroStockAction" "ZeroStockAction" NOT NULL DEFAULT 'KEEP',
    "priceMarkupPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderSyncConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSyncConfig_userId_provider_key" ON "ProviderSyncConfig"("userId", "provider");

