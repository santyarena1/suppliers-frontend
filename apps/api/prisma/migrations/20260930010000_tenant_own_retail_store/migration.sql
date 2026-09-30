-- El comercio (tipo 1) elige cuál de los locales ya sincronizados es el suyo,
-- para comparar el costo final con el precio de venta de esa web.

ALTER TABLE "Tenant" ADD COLUMN "ownRetailStoreId" TEXT;

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownRetailStoreId_fkey"
  FOREIGN KEY ("ownRetailStoreId") REFERENCES "RetailStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Tenant_ownRetailStoreId_idx" ON "Tenant"("ownRetailStoreId");
