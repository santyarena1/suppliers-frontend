-- Vender en NODO (docs/PLAN_VENDER_EN_NODO.md): solo tablas y columnas nuevas.
-- CreateEnum
CREATE TYPE "StorefrontStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StorefrontOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ProviderOrder" ADD COLUMN     "storefrontNote" TEXT,
ADD COLUMN     "storefrontRespondedAt" TIMESTAMP(3),
ADD COLUMN     "storefrontStatus" "StorefrontOrderStatus";

-- CreateTable
CREATE TABLE "Storefront" (
    "id" TEXT NOT NULL,
    "retailerTenantId" TEXT NOT NULL,
    "supplierTenantId" TEXT NOT NULL,
    "status" "StorefrontStatus" NOT NULL DEFAULT 'ACTIVE',
    "stockConfirmedAt" TIMESTAMP(3),
    "stockValidDays" INTEGER NOT NULL DEFAULT 3,
    "staleWarnedAt" TIMESTAMP(3),
    "contactPhone" TEXT,
    "contactNote" TEXT,
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Storefront_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Storefront_retailerTenantId_key" ON "Storefront"("retailerTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Storefront_supplierTenantId_key" ON "Storefront"("supplierTenantId");

-- CreateIndex
CREATE INDEX "Storefront_status_idx" ON "Storefront"("status");

-- CreateIndex
CREATE INDEX "ProviderOrder_provider_storefrontStatus_idx" ON "ProviderOrder"("provider", "storefrontStatus");

-- AddForeignKey
ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_retailerTenantId_fkey" FOREIGN KEY ("retailerTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_supplierTenantId_fkey" FOREIGN KEY ("supplierTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
