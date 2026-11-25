-- Locales de venta (HardGamers, Compra Gamer...) que un comercio elige como proveedor.
CREATE TABLE "RetailSupplier" (
    "id" TEXT NOT NULL,
    "retailStoreId" TEXT NOT NULL,
    "supplierTenantId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetailSupplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RetailSupplier_retailStoreId_key" ON "RetailSupplier"("retailStoreId");
CREATE UNIQUE INDEX "RetailSupplier_supplierTenantId_key" ON "RetailSupplier"("supplierTenantId");
ALTER TABLE "RetailSupplier" ADD CONSTRAINT "RetailSupplier_retailStoreId_fkey" FOREIGN KEY ("retailStoreId") REFERENCES "RetailStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailSupplier" ADD CONSTRAINT "RetailSupplier_supplierTenantId_fkey" FOREIGN KEY ("supplierTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Descuentos por categoría o marca sobre proveedores por lista.
CREATE TYPE "ListDiscountKind" AS ENUM ('CATEGORY', 'BRAND');
CREATE TABLE "ListDiscountRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" "ListDiscountKind" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ListDiscountRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ListDiscountRule_tenantId_provider_kind_key_key" ON "ListDiscountRule"("tenantId", "provider", "kind", "key");
CREATE INDEX "ListDiscountRule_tenantId_provider_idx" ON "ListDiscountRule"("tenantId", "provider");
ALTER TABLE "ListDiscountRule" ADD CONSTRAINT "ListDiscountRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
