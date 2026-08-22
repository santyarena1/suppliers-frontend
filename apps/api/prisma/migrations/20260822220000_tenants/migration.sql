-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('RETAILER', 'DISTRIBUTOR', 'BRAND');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'BUYER', 'SELLER', 'PRODUCT_MANAGER', 'MARKETING', 'COMMERCIAL', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrderApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ProviderOrder" ADD COLUMN     "approvalStatus" "OrderApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "approvalDecidedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "createdByUserId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TenantType" NOT NULL,
    "providerKey" TEXT,
    "brandId" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "advertisingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLink" (
    "id" TEXT NOT NULL,
    "clientTenantId" TEXT NOT NULL,
    "supplierTenantId" TEXT NOT NULL,
    "accountManagerId" TEXT,
    "status" "TenantLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountPercent" DECIMAL(6,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAccessCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAccessCodeRedemption" (
    "id" TEXT NOT NULL,
    "accessCodeId" TEXT NOT NULL,
    "redeemedByUserId" TEXT NOT NULL,
    "redeemedByTenantId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAccessCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductManagerScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductManagerScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_name_key" ON "Tenant"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_providerKey_key" ON "Tenant"("providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_brandId_key" ON "Tenant"("brandId");

-- CreateIndex
CREATE INDEX "Tenant_type_active_idx" ON "Tenant"("type", "active");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "TenantLink_supplierTenantId_status_idx" ON "TenantLink"("supplierTenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantLink_clientTenantId_supplierTenantId_key" ON "TenantLink"("clientTenantId", "supplierTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAccessCode_code_key" ON "TenantAccessCode"("code");

-- CreateIndex
CREATE INDEX "TenantAccessCodeRedemption_redeemedByTenantId_idx" ON "TenantAccessCodeRedemption"("redeemedByTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductManagerScope_tenantId_userId_brandName_key" ON "ProductManagerScope"("tenantId", "userId", "brandName");

-- CreateIndex
CREATE INDEX "ProviderOrder_approvalStatus_idx" ON "ProviderOrder"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLink" ADD CONSTRAINT "TenantLink_clientTenantId_fkey" FOREIGN KEY ("clientTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLink" ADD CONSTRAINT "TenantLink_supplierTenantId_fkey" FOREIGN KEY ("supplierTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLink" ADD CONSTRAINT "TenantLink_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAccessCode" ADD CONSTRAINT "TenantAccessCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantAccessCodeRedemption" ADD CONSTRAINT "TenantAccessCodeRedemption_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "TenantAccessCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductManagerScope" ADD CONSTRAINT "ProductManagerScope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductManagerScope" ADD CONSTRAINT "ProductManagerScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
