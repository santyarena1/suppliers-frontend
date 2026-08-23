-- Fase 2 del plan de aislamiento: la cuenta en el distribuidor es del comercio.
--
-- `Credential` y `ProviderSyncConfig` pasan de estar indexadas por persona a estarlo
-- por organización. La cuenta en New Bytes la abrió el comercio, no el encargado de
-- compras que la cargó: si esa persona se va, la organización tiene que seguir
-- comprando. Lo mismo vale para el markup y el umbral de stock, que son decisiones
-- comerciales del comercio.
--
-- Cada fila se lleva a la organización de su dueño. Si dos personas de la misma
-- organización habían cargado el mismo proveedor queda la más reciente, y la
-- descartada se anota en la auditoría con su contenido cifrado, para poder
-- recuperarla a mano si alguien reclama. Lo mismo con las filas de quien no
-- pertenece a ninguna organización: en el modelo nuevo no tienen dueño posible.

-- ---------- Credential ----------

ALTER TABLE "Credential" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Credential" ADD COLUMN "savedById" TEXT;

UPDATE "Credential" SET "savedById" = "userId";

-- La organización se resuelve igual que en la sesión: la membresía activa más
-- antigua de la persona.
UPDATE "Credential" c
SET "tenantId" = (
  SELECT m."tenantId"
  FROM "TenantMembership" m
  JOIN "Tenant" t ON t.id = m."tenantId"
  WHERE m."userId" = c."userId" AND m.active AND t.active
  ORDER BY m."createdAt" ASC
  LIMIT 1
);

-- Duplicados dentro de una misma organización: sobrevive la más reciente.
WITH descartadas AS (
  SELECT id, "userId", "providerName", "credentialsEncrypted", "tenantId"
  FROM (
    SELECT *, ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "providerName" ORDER BY "updatedAt" DESC, id DESC
    ) AS posicion
    FROM "Credential"
    WHERE "tenantId" IS NOT NULL
  ) ordenadas
  WHERE posicion > 1
)
INSERT INTO "AuditLogEntry" (id, "entityType", "entityId", action, "performedById", changes, "createdAt")
SELECT gen_random_uuid()::TEXT, 'Credential', d.id, 'DISCARDED_ON_TENANT_MIGRATION', d."userId",
       jsonb_build_object(
         'motivo', 'La organización ya tenía una credencial más reciente para este proveedor',
         'providerName', d."providerName",
         'tenantId', d."tenantId",
         'credentialsEncrypted', d."credentialsEncrypted"
       ),
       now()
FROM descartadas d;

DELETE FROM "Credential" c
WHERE c."tenantId" IS NOT NULL
  AND c.id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "tenantId", "providerName" ORDER BY "updatedAt" DESC, id DESC
      ) AS posicion
      FROM "Credential"
      WHERE "tenantId" IS NOT NULL
    ) ordenadas
    WHERE posicion > 1
  );

-- Sin organización no hay dueño posible en el modelo nuevo.
INSERT INTO "AuditLogEntry" (id, "entityType", "entityId", action, "performedById", changes, "createdAt")
SELECT gen_random_uuid()::TEXT, 'Credential', c.id, 'DISCARDED_ON_TENANT_MIGRATION', c."userId",
       jsonb_build_object(
         'motivo', 'Su dueño no pertenece a ninguna organización',
         'providerName', c."providerName",
         'credentialsEncrypted', c."credentialsEncrypted"
       ),
       now()
FROM "Credential" c
WHERE c."tenantId" IS NULL;

DELETE FROM "Credential" WHERE "tenantId" IS NULL;

ALTER TABLE "Credential" DROP CONSTRAINT "Credential_userId_fkey";
DROP INDEX "Credential_userId_providerName_key";
ALTER TABLE "Credential" DROP COLUMN "userId";
ALTER TABLE "Credential" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE UNIQUE INDEX "Credential_tenantId_providerName_key" ON "Credential"("tenantId", "providerName");
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_savedById_fkey"
  FOREIGN KEY ("savedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- ProviderSyncConfig ----------

ALTER TABLE "ProviderSyncConfig" ADD COLUMN "tenantId" TEXT;

UPDATE "ProviderSyncConfig" c
SET "tenantId" = (
  SELECT m."tenantId"
  FROM "TenantMembership" m
  JOIN "Tenant" t ON t.id = m."tenantId"
  WHERE m."userId" = c."userId" AND m.active AND t.active
  ORDER BY m."createdAt" ASC
  LIMIT 1
);

-- Acá el criterio es distinto: gana la que sincronizó más recientemente, que es la
-- que de verdad estuvo trayendo el catálogo de esa organización.
DELETE FROM "ProviderSyncConfig"
WHERE "tenantId" IS NULL
   OR id IN (
     SELECT id FROM (
       SELECT id, ROW_NUMBER() OVER (
         PARTITION BY "tenantId", provider
         ORDER BY "lastSyncedAt" DESC NULLS LAST, "updatedAt" DESC, id DESC
       ) AS posicion
       FROM "ProviderSyncConfig"
       WHERE "tenantId" IS NOT NULL
     ) ordenadas
     WHERE posicion > 1
   );

DROP INDEX "ProviderSyncConfig_userId_provider_key";
ALTER TABLE "ProviderSyncConfig" DROP COLUMN "userId";
ALTER TABLE "ProviderSyncConfig" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE UNIQUE INDEX "ProviderSyncConfig_tenantId_provider_key" ON "ProviderSyncConfig"("tenantId", "provider");
ALTER TABLE "ProviderSyncConfig" ADD CONSTRAINT "ProviderSyncConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE ON UPDATE CASCADE;
