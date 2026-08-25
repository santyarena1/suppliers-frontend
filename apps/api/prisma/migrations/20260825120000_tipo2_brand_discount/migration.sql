-- Descuento por marca del mayorista (Product Manager / gerente).

CREATE TABLE "TenantBrandDiscount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "discountPercent" DECIMAL(6,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBrandDiscount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantBrandDiscount_tenantId_brandName_key" ON "TenantBrandDiscount"("tenantId", "brandName");
CREATE INDEX "TenantBrandDiscount_tenantId_idx" ON "TenantBrandDiscount"("tenantId");

ALTER TABLE "TenantBrandDiscount" ADD CONSTRAINT "TenantBrandDiscount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
