-- El JSON crudo de la ficha trae precios de la cuenta que sincronizó.
-- Este sello dice de qué organización es, para no mostrárselo a otro local.

ALTER TABLE "ProviderSyncCache" ADD COLUMN "rawOwnerTenantId" TEXT;
