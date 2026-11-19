import type { PrismaService } from "../prisma/prisma.service";

/**
 * Número de parte y EAN de cada renglón de una factura, del catálogo del
 * distribuidor que tiene NODO (`ProviderSyncCache`, por proveedor + código). La
 * factura solo trae el código interno del distribuidor; con esto el sistema del
 * comercio reconoce el producto igual que en los pedidos.
 *
 * Completa `lines` en el lugar. Lo que NODO no conoce queda en null.
 */
export async function withLineFacts(prisma: Pick<PrismaService, "providerSyncCache">, docs: { provider: string; lines: unknown }[]): Promise<void> {
  const wanted = new Map<string, { provider: string; externalId: string }>();
  for (const d of docs) {
    for (const l of Array.isArray(d.lines) ? (d.lines as Record<string, unknown>[]) : []) {
      const code = typeof l?.codigo === "string" ? l.codigo.trim() : "";
      if (code) wanted.set(`${d.provider}|${code}`, { provider: d.provider, externalId: code });
    }
  }
  if (wanted.size === 0) return;
  const facts = new Map<string, { partNumber: string | null; ean: string | null }>();
  const all = [...wanted.values()];
  for (let i = 0; i < all.length; i += 500) {
    const rows = await prisma.providerSyncCache.findMany({
      where: { OR: all.slice(i, i + 500) },
      select: { provider: true, externalId: true, partNumber: true, ean: true },
    });
    for (const r of rows) facts.set(`${r.provider}|${r.externalId}`, { partNumber: r.partNumber?.trim() || null, ean: r.ean?.trim() || null });
  }
  for (const d of docs) {
    if (!Array.isArray(d.lines)) continue;
    d.lines = (d.lines as Record<string, unknown>[]).map((l) => {
      const f = facts.get(`${d.provider}|${typeof l?.codigo === "string" ? l.codigo.trim() : ""}`);
      return { ...l, part_number: f?.partNumber ?? null, ean: f?.ean ?? null };
    });
  }
}
