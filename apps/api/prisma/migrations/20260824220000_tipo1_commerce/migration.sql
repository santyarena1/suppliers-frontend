-- Cerrar el Tipo 1: administrador (no dueño) en comercios, tilde del comprador,
-- un carrito por local, y sync automática si hay cuenta.

-- ---------- Comercio: tilde del comprador ----------

ALTER TABLE "Tenant" ADD COLUMN "buyerCanConfirm" BOOLEAN NOT NULL DEFAULT false;

-- Los que mandaban el local pasan a Administrador. OWNER queda para gerentes
-- de distribuidor y de marca.
UPDATE "TenantMembership" AS m
SET role = 'ADMIN'
FROM "Tenant" AS t
WHERE m."tenantId" = t.id
  AND t.type = 'RETAILER'
  AND m.role = 'OWNER';

-- ---------- Carrito compartido por comercio ----------

ALTER TABLE "CartItem" ADD COLUMN "snapshot" JSONB;

-- Si dos personas del mismo local tenían el mismo producto, se suma la cantidad
-- y queda una sola fila (la más reciente).
CREATE TEMP TABLE cart_keep AS
SELECT DISTINCT ON ("tenantId", provider, "externalId")
  id
FROM "CartItem"
ORDER BY "tenantId", provider, "externalId", "updatedAt" DESC, id DESC;

UPDATE "CartItem" AS c
SET quantity = s.qty
FROM (
  SELECT "tenantId", provider, "externalId", SUM(quantity)::int AS qty
  FROM "CartItem"
  GROUP BY 1, 2, 3
) AS s
WHERE c."tenantId" = s."tenantId"
  AND c.provider = s.provider
  AND c."externalId" = s."externalId"
  AND c.id IN (SELECT id FROM cart_keep);

DELETE FROM "CartItem"
WHERE id NOT IN (SELECT id FROM cart_keep);

DROP TABLE cart_keep;

DROP INDEX IF EXISTS "CartItem_userId_tenantId_provider_externalId_key";
CREATE UNIQUE INDEX "CartItem_tenantId_provider_externalId_key"
  ON "CartItem"("tenantId", "provider", "externalId");

-- ---------- Sync prendida si hay cuenta ----------

UPDATE "ProviderSyncConfig" AS c
SET enabled = true
FROM "Credential" AS cred
WHERE cred."tenantId" = c."tenantId"
  AND cred."providerName" = c.provider;

INSERT INTO "ProviderSyncConfig" (
  id, "tenantId", provider, enabled, "syncIntervalMinutes",
  "missingProductAction", "zeroStockAction", "priceMarkupPercent",
  "minStockThreshold", "lastSyncCreated", "lastSyncUpdated",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  cred."tenantId",
  cred."providerName",
  true,
  60,
  'KEEP',
  'KEEP',
  0,
  0,
  0,
  0,
  NOW(),
  NOW()
FROM "Credential" AS cred
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProviderSyncConfig" AS c
  WHERE c."tenantId" = cred."tenantId"
    AND c.provider = cred."providerName"
);
