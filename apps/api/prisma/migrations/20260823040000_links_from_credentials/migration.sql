-- Fase 4 del plan de aislamiento: el descubrimiento se cierra.
--
-- A partir de acá un comercio solo conoce los distribuidores con los que tiene un
-- vínculo. Para no dejar a nadie sin catálogo de un día para el otro, esta migración
-- da por vinculado a todo el que ya venía usando un proveedor: si tenés la cuenta
-- cargada, si configuraste la sincronización o si ya tenés productos suyos, el
-- vínculo existía en los hechos y solo faltaba escribirlo.
--
-- Cada proveedor pasa a ser también una organización de tipo distribuidor, con su
-- nombre normalizado. Es lo que permite vincular, asignar un vendedor de contacto y
-- pactar un descuento sin inventar una segunda forma de nombrar lo mismo.

INSERT INTO "Tenant" ("id", "name", "type", "providerKey", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, nombre, 'DISTRIBUTOR', clave, true, now(), now()
FROM (VALUES
  ('NEW_BYTES',    'New Bytes'),
  ('ELIT',         'Elit'),
  ('GRUPO_NUCLEO', 'Grupo Núcleo'),
  ('AIR',          'Air'),
  ('NEW_TREE',     'New Tree'),
  ('INVID',        'Invid'),
  ('GC',           'GC'),
  ('POLYTECH',     'Polytech'),
  ('ASHIR',        'Ashir'),
  ('HDC',          'HDC'),
  ('SOLUTION_BOX', 'Solution Box'),
  ('DISTECNA',     'Distecna'),
  ('CEVEN',        'Ceven'),
  ('DIAPSTORE',    'Diapstore')
) AS proveedores(clave, nombre)
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."providerKey" = clave)
  AND NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t."name" = nombre);

-- Las organizaciones que ya existían con ese nombre (las de la carga de ejemplo)
-- quedan asociadas a su clave de proveedor en vez de duplicarse.
UPDATE "Tenant" t
SET "providerKey" = proveedores.clave
FROM (VALUES
  ('NEW_BYTES',    'New Bytes'),
  ('ELIT',         'Elit'),
  ('GRUPO_NUCLEO', 'Grupo Núcleo'),
  ('AIR',          'Air'),
  ('NEW_TREE',     'New Tree'),
  ('INVID',        'Invid'),
  ('GC',           'GC'),
  ('POLYTECH',     'Polytech'),
  ('ASHIR',        'Ashir'),
  ('HDC',          'HDC'),
  ('SOLUTION_BOX', 'Solution Box'),
  ('DISTECNA',     'Distecna'),
  ('CEVEN',        'Ceven'),
  ('DIAPSTORE',    'Diapstore')
) AS proveedores(clave, nombre)
WHERE t."name" = proveedores.nombre
  AND t."providerKey" IS NULL
  AND t."type" = 'DISTRIBUTOR';

-- Todo uso previo de un proveedor cuenta como vínculo: la cuenta cargada, la
-- configuración de sincronización o los productos ya sincronizados.
INSERT INTO "TenantLink" ("id", "clientTenantId", "supplierTenantId", "status", "createdAt", "updatedAt")
SELECT DISTINCT ON (uso."tenantId", proveedor."id")
  gen_random_uuid()::TEXT, uso."tenantId", proveedor."id", 'ACTIVE', now(), now()
FROM (
  SELECT "tenantId", "providerName" AS provider FROM "Credential"
  UNION
  SELECT "tenantId", "provider" FROM "ProviderSyncConfig"
  UNION
  SELECT DISTINCT "tenantId", "provider" FROM "TenantProductOffer"
) uso
JOIN "Tenant" proveedor ON proveedor."providerKey" = uso.provider
JOIN "Tenant" cliente ON cliente."id" = uso."tenantId"
-- Un distribuidor no se vincula consigo mismo.
WHERE cliente."id" <> proveedor."id"
  AND NOT EXISTS (
    SELECT 1 FROM "TenantLink" l
    WHERE l."clientTenantId" = uso."tenantId" AND l."supplierTenantId" = proveedor."id"
  );
