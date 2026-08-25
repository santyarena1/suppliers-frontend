-- Alcance del descuento de marca: lista general o locales concretos.

ALTER TABLE "TenantBrandDiscount" ADD COLUMN "appliesToAll" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "TenantBrandDiscountClient" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "clientTenantId" TEXT NOT NULL,

    CONSTRAINT "TenantBrandDiscountClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantBrandDiscountClient_discountId_clientTenantId_key" ON "TenantBrandDiscountClient"("discountId", "clientTenantId");
CREATE INDEX "TenantBrandDiscountClient_clientTenantId_idx" ON "TenantBrandDiscountClient"("clientTenantId");

ALTER TABLE "TenantBrandDiscountClient" ADD CONSTRAINT "TenantBrandDiscountClient_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "TenantBrandDiscount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantBrandDiscountClient" ADD CONSTRAINT "TenantBrandDiscountClient_clientTenantId_fkey" FOREIGN KEY ("clientTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
