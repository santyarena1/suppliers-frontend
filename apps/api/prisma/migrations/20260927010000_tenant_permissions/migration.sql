-- Permisos configurables por organización: el dueño ajusta por rol y por persona.
-- Solo se guardan las diferencias con los valores por defecto del rol.
CREATE TABLE "TenantRolePermission" (
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRolePermission_pkey" PRIMARY KEY ("tenantId","role","permission")
);

CREATE TABLE "TenantMemberPermission" (
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMemberPermission_pkey" PRIMARY KEY ("membershipId","permission")
);

ALTER TABLE "TenantRolePermission" ADD CONSTRAINT "TenantRolePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantMemberPermission" ADD CONSTRAINT "TenantMemberPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
