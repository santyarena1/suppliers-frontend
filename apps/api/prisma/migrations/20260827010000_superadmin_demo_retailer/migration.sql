-- El superadmin de prueba opera el mismo comercio que testuser1: mismas
-- credenciales de proveedor, mismo catálogo y mismo carrito. Sigue siendo
-- ROLE_ADMIN, así que no pierde el árbol ni hace falta "entrar como".
--
-- Si el comercio de pruebas todavía no existe, no hace nada: el seed lo crea
-- y lo suma después. Si el superadmin ya tiene membresía, no se lo mueve.

DO $$
DECLARE
  admin_id  TEXT;
  tenant_id TEXT;
BEGIN
  SELECT id INTO admin_id
  FROM "User"
  WHERE username = 'superadmin' AND role = 'ROLE_ADMIN'
  LIMIT 1;

  IF admin_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM "TenantMembership" WHERE "userId" = admin_id) THEN
    RETURN;
  END IF;

  SELECT m."tenantId" INTO tenant_id
  FROM "User" u
  JOIN "TenantMembership" m ON m."userId" = u.id AND m.active = true
  JOIN "Tenant" t ON t.id = m."tenantId" AND t.active = true AND t.type = 'RETAILER'
  WHERE u.username IN ('testuser1', 'testuser')
  ORDER BY CASE u.username WHEN 'testuser1' THEN 0 ELSE 1 END, m."createdAt"
  LIMIT 1;

  IF tenant_id IS NULL THEN
    SELECT id INTO tenant_id
    FROM "Tenant"
    WHERE name = 'Comercio de Pruebas' AND type = 'RETAILER' AND active = true
    LIMIT 1;
  END IF;

  IF tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "TenantMembership" (id, "tenantId", "userId", role, title, active, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::TEXT,
    tenant_id,
    admin_id,
    'ADMIN',
    'Superadmin de prueba',
    true,
    now(),
    now()
  )
  ON CONFLICT ("tenantId", "userId") DO NOTHING;
END $$;
