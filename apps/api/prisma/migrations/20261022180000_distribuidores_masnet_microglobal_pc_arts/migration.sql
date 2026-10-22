-- Masnet, Microglobal y PC Arts entran como distribuidores con integración de
-- catálogo. Igual que el resto de los conocidos, cada uno es una organización de
-- tipo distribuidor con su clave: sin ella no hay vínculo posible, y sin vínculo
-- el comercio no puede cargar la cuenta ni sincronizar.
--
-- Si ya existía una organización con ese nombre (alta manual como distribuidor
-- por lista, por ejemplo), no se duplica: se le asigna la clave solo si no tenía.

INSERT INTO "Tenant" ("id", "name", "type", "providerKey", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, nombre, 'DISTRIBUTOR', clave, true, now(), now()
FROM (VALUES
  ('MASNET',      'Masnet'),
  ('MICROGLOBAL', 'Microglobal'),
  ('PC_ARTS',     'PC Arts')
) AS proveedores(clave, nombre)
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."providerKey" = clave)
  AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."name" = nombre);

UPDATE "Tenant" t
SET "providerKey" = proveedores.clave
FROM (VALUES
  ('MASNET',      'Masnet'),
  ('MICROGLOBAL', 'Microglobal'),
  ('PC_ARTS',     'PC Arts')
) AS proveedores(clave, nombre)
WHERE t."name" = proveedores.nombre
  AND t."providerKey" IS NULL
  AND t."type" = 'DISTRIBUTOR'
  AND NOT EXISTS (SELECT 1 FROM "Tenant" o WHERE o."providerKey" = proveedores.clave);
