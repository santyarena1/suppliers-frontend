import type { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";

/** Quién pide algo desde "Plan y facturación", para la bandeja de Solicitudes. */
export async function inboxRequester(prisma: PrismaService, tenant: TenantContext) {
  const [org, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenant.tenantId }, select: { name: true, contactEmail: true, contactPhone: true } }),
    prisma.user.findUnique({ where: { id: tenant.userId }, select: { username: true, email: true } }),
  ]);
  return {
    company: org?.name ?? "Un comercio",
    contactName: user?.username ?? null,
    contactEmail: user?.email ?? org?.contactEmail ?? null,
    contactPhone: org?.contactPhone ?? null,
    tenantId: tenant.tenantId,
    userId: tenant.userId,
  };
}
