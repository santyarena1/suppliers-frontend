import type { PrismaService } from "../prisma/prisma.service";

export function normalizeBrandLabel(name: string) {
  return name.trim().toLowerCase();
}

export async function brandMatchNames(prisma: PrismaService, tenantId: string): Promise<string[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      catalogTerm: { select: { label: true, aliases: { select: { label: true, rawKey: true } } } },
    },
  });
  const names = [tenant?.name, tenant?.catalogTerm?.label];
  for (const alias of tenant?.catalogTerm?.aliases ?? []) {
    names.push(alias.label, alias.rawKey);
  }
  return [...new Set(names.filter((n): n is string => Boolean(n?.trim())))];
}

export function brandFieldMatches(value: string | null | undefined, names: string[]) {
  if (!value?.trim() || names.length === 0) return false;
  const got = normalizeBrandLabel(value);
  return names.some((name) => normalizeBrandLabel(name) === got);
}
