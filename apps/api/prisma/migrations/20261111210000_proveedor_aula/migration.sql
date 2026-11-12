-- Aula entra como distribuidor por lista disponible para todos los comercios:
-- cada uno se conecta por lista desde «Agregar proveedor» y sube su «Lista
-- Gremio» (formato conocido, ver list-import/known-formats.ts).
--
-- Si ya existía una organización llamada Aula (alta manual), no se duplica:
-- se le asigna la clave solo si no tenía.

INSERT INTO "Tenant" ("id", "name", "type", "providerKey", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'Aula', 'DISTRIBUTOR', 'LIST_AULA', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."providerKey" = 'LIST_AULA')
  AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE lower(trim(t."name")) = 'aula');

UPDATE "Tenant" t
SET "providerKey" = 'LIST_AULA', "updatedAt" = now()
WHERE lower(trim(t."name")) = 'aula'
  AND t."providerKey" IS NULL
  AND t."type" = 'DISTRIBUTOR'
  AND NOT EXISTS (SELECT 1 FROM "Tenant" o WHERE o."providerKey" = 'LIST_AULA');
