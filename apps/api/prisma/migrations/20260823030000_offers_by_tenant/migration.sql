-- Fase 3 del plan de aislamiento: el precio es por comercio.
--
-- Hasta hoy había una sola fila por producto para toda la plataforma, con el precio
-- adentro. Como el markup se aplicaba al escribir, el comercio que sincronizaba
-- último dejaba su precio inflado para todos los demás, y las acciones sobre
-- faltantes o stock cero de uno borraban u ocultaban productos del resto.
--
-- A partir de acá `ProviderSyncCache` es solo la ficha (qué es el producto) y
-- `TenantProductOffer` guarda qué cuesta y cuánto hay para cada organización, con el
-- valor crudo del proveedor. El markup y el umbral de stock se aplican al leer.
--
-- Los precios que ya existen traen el markup adentro y no hay forma de saber cuál
-- era el crudo. Se le atribuyen a la organización que sincronizó ese proveedor por
-- última vez, que es la que de verdad los trajo, y quedan marcados con
-- `needsResync` hasta la próxima sincronización real.

CREATE TABLE "TenantProductOffer" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "externalId"  TEXT NOT NULL,
  "price"       DECIMAL(14,4),
  "finalPrice"  DECIMAL(14,4),
  "currency"    TEXT,
  "ivaPercent"  DECIMAL(6,2),
  "stock"       INTEGER,
  "stockStatus" TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "needsResync" BOOLEAN NOT NULL DEFAULT false,
  "syncedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantProductOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantProductOffer_tenantId_provider_externalId_key"
  ON "TenantProductOffer"("tenantId", "provider", "externalId");
CREATE INDEX "TenantProductOffer_tenantId_provider_active_idx"
  ON "TenantProductOffer"("tenantId", "provider", "active");
CREATE INDEX "TenantProductOffer_provider_externalId_idx"
  ON "TenantProductOffer"("provider", "externalId");

ALTER TABLE "TenantProductOffer" ADD CONSTRAINT "TenantProductOffer_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantProductOffer" ADD CONSTRAINT "TenantProductOffer_provider_externalId_fkey"
  FOREIGN KEY ("provider", "externalId") REFERENCES "ProviderSyncCache"("provider", "externalId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Dueño de lo que ya está cargado: por proveedor, la organización que sincronizó
-- más recientemente. Un proveedor que nadie sincronizó nunca (catálogo cargado a
-- mano por Excel antes de que existieran las organizaciones) no tiene a quién
-- atribuirse: la ficha queda y la oferta la va a crear la primera sincronización.
INSERT INTO "TenantProductOffer" (
  "id", "tenantId", "provider", "externalId",
  "price", "finalPrice", "currency", "ivaPercent", "stock", "stockStatus",
  "active", "needsResync", "syncedAt", "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  dueño."tenantId",
  c."provider",
  c."externalId",
  c."price",
  c."finalPrice",
  c."currency",
  c."ivaPercent",
  c."stock",
  c."stockStatus",
  c."active",
  true,
  c."syncedAt",
  now()
FROM "ProviderSyncCache" c
JOIN LATERAL (
  SELECT s."tenantId"
  FROM "ProviderSyncConfig" s
  WHERE s.provider = c.provider
  ORDER BY s."lastSyncedAt" DESC NULLS LAST, s."updatedAt" DESC
  LIMIT 1
) dueño ON true;

ALTER TABLE "ProviderSyncCache" DROP COLUMN "price";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "finalPrice";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "currency";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "ivaPercent";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "stock";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "stockStatus";
ALTER TABLE "ProviderSyncCache" DROP COLUMN "active";

-- El historial de precio también es por organización: la serie de un comercio no
-- dice nada sobre la de otro, porque compran con cuentas distintas.
ALTER TABLE "ProductPriceHistory" ADD COLUMN "tenantId" TEXT;

UPDATE "ProductPriceHistory" h
SET "tenantId" = (
  SELECT s."tenantId"
  FROM "ProviderSyncConfig" s
  WHERE s.provider = h.provider
  ORDER BY s."lastSyncedAt" DESC NULLS LAST, s."updatedAt" DESC
  LIMIT 1
);

DELETE FROM "ProductPriceHistory" WHERE "tenantId" IS NULL;

ALTER TABLE "ProductPriceHistory" ALTER COLUMN "tenantId" SET NOT NULL;
DROP INDEX "ProductPriceHistory_provider_externalId_capturedAt_idx";
CREATE INDEX "ProductPriceHistory_tenantId_provider_externalId_capturedAt_idx"
  ON "ProductPriceHistory"("tenantId", "provider", "externalId", "capturedAt");
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;
