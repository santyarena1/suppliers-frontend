-- El superadmin tiene organización propia (carrito y pedidos aparte) y mira
-- credenciales, distribuidores y marcas del Comercio de Pruebas.

ALTER TABLE "Tenant" ADD COLUMN "mirrorsCommercialFromId" TEXT;

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_mirrorsCommercialFromId_fkey"
  FOREIGN KEY ("mirrorsCommercialFromId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Tenant_mirrorsCommercialFromId_idx" ON "Tenant"("mirrorsCommercialFromId");

DO $$
DECLARE
  admin_id     TEXT;
  source_id    TEXT;
  own_id       TEXT;
  own_name     TEXT := 'Administración';
BEGIN
  SELECT id INTO admin_id
  FROM "User"
  WHERE username = 'superadmin' AND role = 'ROLE_ADMIN'
  LIMIT 1;

  IF admin_id IS NULL THEN
    RETURN;
  END IF;

  SELECT m."tenantId" INTO source_id
  FROM "User" u
  JOIN "TenantMembership" m ON m."userId" = u.id AND m.active = true
  JOIN "Tenant" t ON t.id = m."tenantId" AND t.active = true AND t.type = 'RETAILER'
  WHERE u.username IN ('testuser1', 'testuser')
  ORDER BY CASE u.username WHEN 'testuser1' THEN 0 ELSE 1 END, m."createdAt"
  LIMIT 1;

  IF source_id IS NULL THEN
    SELECT id INTO source_id
    FROM "Tenant"
    WHERE name = 'Comercio de Pruebas' AND type = 'RETAILER' AND active = true
    LIMIT 1;
  END IF;

  SELECT id INTO own_id FROM "Tenant" WHERE name = own_name LIMIT 1;
  IF own_id IS NULL THEN
    own_id := gen_random_uuid()::TEXT;
    INSERT INTO "Tenant" (id, name, type, notes, "advertisingEnabled", "buyerCanConfirm", active, "createdAt", "updatedAt", "mirrorsCommercialFromId")
    VALUES (
      own_id,
      own_name,
      'RETAILER',
      'Organización del superadmin: carrito y pedidos propios. Credenciales y vínculos se leen del comercio de pruebas.',
      false,
      false,
      true,
      now(),
      now(),
      source_id
    );
  ELSE
    UPDATE "Tenant"
    SET "mirrorsCommercialFromId" = source_id, "updatedAt" = now()
    WHERE id = own_id;
  END IF;

  -- Una persona, una organización: sale del comercio de pruebas si estaba ahí.
  DELETE FROM "TenantMembership"
  WHERE "userId" = admin_id AND "tenantId" <> own_id;

  INSERT INTO "TenantMembership" (id, "tenantId", "userId", role, title, active, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::TEXT,
    own_id,
    admin_id,
    'ADMIN',
    'Superadmin de prueba',
    true,
    now(),
    now()
  )
  ON CONFLICT ("tenantId", "userId") DO UPDATE
    SET role = 'ADMIN', title = 'Superadmin de prueba', active = true, "updatedAt" = now();
END $$;
