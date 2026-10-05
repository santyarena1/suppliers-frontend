-- Modo vendedor: márgenes de venta, base por distribuidor y avisos vistos (docs/PLAN_MODO_VENDEDOR.md).
-- CreateEnum
CREATE TYPE "SaleMarginScope" AS ENUM ('STORE', 'PROVIDER', 'CATEGORY', 'PRODUCT');

-- CreateEnum
CREATE TYPE "SaleMarginBase" AS ENUM ('FINAL', 'NET');

-- AlterTable
ALTER TABLE "ProviderSyncConfig" ADD COLUMN     "saleMarginBase" "SaleMarginBase" NOT NULL DEFAULT 'FINAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "seenAnnouncements" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SaleMarginRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "SaleMarginScope" NOT NULL,
    "provider" TEXT,
    "categoryKey" TEXT,
    "categoryLabel" TEXT,
    "externalId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "percent" DECIMAL(7,3) NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleMarginRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleMarginChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "before" DECIMAL(7,3),
    "after" DECIMAL(7,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleMarginChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleMarginRule_tenantId_provider_idx" ON "SaleMarginRule"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SaleMarginRule_tenantId_ruleKey_key" ON "SaleMarginRule"("tenantId", "ruleKey");

-- CreateIndex
CREATE INDEX "SaleMarginChange_tenantId_createdAt_idx" ON "SaleMarginChange"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "SaleMarginRule" ADD CONSTRAINT "SaleMarginRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleMarginChange" ADD CONSTRAINT "SaleMarginChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

