-- Fase 1 del plan de aislamiento: nadie opera sin organización.
--
-- A partir de acá el alcance de negocio lo da la membresía, no el rol de
-- plataforma, así que todo usuario que todavía no pertenezca a ninguna
-- organización necesita una. El superadmin queda deliberadamente afuera: es
-- transversal y no debe pertenecer a ninguna.
--
-- Las organizaciones creadas acá llevan el nombre de usuario como nombre
-- provisional y una nota que lo aclara; se renombran desde el panel con el nombre
-- real del comercio. No se toca ningún usuario que ya tenga membresía.

DO $$
DECLARE
  usuario        RECORD;
  nombre_tenant  TEXT;
  id_tenant      TEXT;
  tipo_tenant    "TenantType";
BEGIN
  FOR usuario IN
    SELECT u.id, u.username, u.role, u."brandId", b.name AS brand_name
    FROM "User" u
    LEFT JOIN "BrandAccount" b ON b.id = u."brandId"
    WHERE u.role <> 'ROLE_ADMIN'
      AND NOT EXISTS (SELECT 1 FROM "TenantMembership" m WHERE m."userId" = u.id)
    ORDER BY u."createdAt"
  LOOP
    id_tenant := NULL;

    -- Una cuenta de marca que ya tiene organización se suma a ella en vez de
    -- duplicarla: `Tenant.brandId` es único y dos organizaciones para la misma
    -- marca dejarían los datos partidos al medio.
    IF usuario."brandId" IS NOT NULL THEN
      SELECT id INTO id_tenant FROM "Tenant" WHERE "brandId" = usuario."brandId";
    END IF;

    IF id_tenant IS NULL THEN
      IF usuario."brandId" IS NOT NULL THEN
        tipo_tenant := 'BRAND';
        nombre_tenant := COALESCE(usuario.brand_name, usuario.username);
      ELSE
        tipo_tenant := 'RETAILER';
        nombre_tenant := usuario.username;
      END IF;

      -- `Tenant.name` es único. Un choque acá es improbable pero cortaría la
      -- migración entera, así que se desempata con un sufijo.
      IF EXISTS (SELECT 1 FROM "Tenant" WHERE name = nombre_tenant) THEN
        nombre_tenant := nombre_tenant || ' (' || LEFT(usuario.id, 8) || ')';
      END IF;

      id_tenant := gen_random_uuid()::TEXT;
      INSERT INTO "Tenant" (id, name, type, "brandId", notes, "advertisingEnabled", active, "createdAt", "updatedAt")
      VALUES (
        id_tenant,
        nombre_tenant,
        tipo_tenant,
        usuario."brandId",
        'Creada automáticamente al migrar a organizaciones. Renombrala con el nombre real.',
        false,
        true,
        now(),
        now()
      );
    END IF;

    INSERT INTO "TenantMembership" (id, "tenantId", "userId", role, active, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::TEXT, id_tenant, usuario.id, 'OWNER', true, now(), now())
    ON CONFLICT ("tenantId", "userId") DO NOTHING;
  END LOOP;
END $$;
