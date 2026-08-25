-- CreateEnum
CREATE TYPE "OpsAliasKind" AS ENUM ('ADDRESS', 'PAYMENT', 'DELIVERY', 'WAREHOUSE');

-- CreateTable
CREATE TABLE "TenantOpsAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "OpsAliasKind" NOT NULL,
    "rawKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantOpsAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantOpsAlias_tenantId_kind_rawKey_key" ON "TenantOpsAlias"("tenantId", "kind", "rawKey");

-- CreateIndex
CREATE INDEX "TenantOpsAlias_tenantId_kind_groupId_idx" ON "TenantOpsAlias"("tenantId", "kind", "groupId");

-- AddForeignKey
ALTER TABLE "TenantOpsAlias" ADD CONSTRAINT "TenantOpsAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
