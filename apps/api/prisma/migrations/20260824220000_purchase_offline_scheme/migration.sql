-- CreateEnum
CREATE TYPE "IvaAdjustment" AS ENUM ('REMOVE', 'HALF', 'FLAT_10_5');

-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN "acceptsOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptsScheme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ivaAdjustment" "IvaAdjustment",
ADD COLUMN "schemeDiscountPercent" DECIMAL(6,2);
