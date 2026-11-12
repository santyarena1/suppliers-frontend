-- Si «Aula» ya era el nombre de otra organización (la marca, por ejemplo), la
-- migración anterior no creó al distribuidor. Lo crea como «Aula Gaming»
-- (aulagaming.com.ar) solo si todavía no existe LIST_AULA.

INSERT INTO "Tenant" ("id", "name", "type", "providerKey", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, 'Aula Gaming', 'DISTRIBUTOR', 'LIST_AULA', true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."providerKey" = 'LIST_AULA')
  AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE lower(trim(t."name")) = 'aula gaming');

UPDATE "Tenant" t
SET "providerKey" = 'LIST_AULA', "updatedAt" = now()
WHERE lower(trim(t."name")) = 'aula gaming'
  AND t."providerKey" IS NULL
  AND t."type" = 'DISTRIBUTOR'
  AND NOT EXISTS (SELECT 1 FROM "Tenant" o WHERE o."providerKey" = 'LIST_AULA');
