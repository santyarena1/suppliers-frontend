import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { isListProviderKey } from "@nodo/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface ProviderMergeResult {
  from: string;
  into: string;
  moved: Record<string, number>;
  /** Filas del origen que ya existían en el destino y se descartaron. */
  dropped: Record<string, number>;
  deletedTenantId: string | null;
}

/**
 * Tablas con columna `provider` y su clave única, para mover filas de una clave a
 * otra sin chocar. Cuando la fila ya existe en el destino, la del origen se borra:
 * el destino es la fuente de verdad.
 */
const TABLES: { table: string; uniqueCols: string[] }[] = [
  { table: "ProviderSyncCache", uniqueCols: ["externalId"] },
  { table: "TenantProductOffer", uniqueCols: ["tenantId", "externalId"] },
  { table: "SupplierBaseOffer", uniqueCols: ["externalId"] },
  { table: "ProductPriceHistory", uniqueCols: [] },
  { table: "ImportProfile", uniqueCols: [] },
  { table: "SupplierListImport", uniqueCols: [] },
  { table: "ProviderSyncConfig", uniqueCols: ["tenantId"] },
  { table: "CatalogSyncRun", uniqueCols: [] },
  { table: "CartItem", uniqueCols: ["userId", "tenantId", "externalId"] },
  { table: "ProviderOrder", uniqueCols: [] },
  { table: "BrandSkuSignal", uniqueCols: ["tenantId", "externalId"] },
  { table: "ImageSyncRun", uniqueCols: [] },
  { table: "ImageSyncFill", uniqueCols: [] },
  { table: "PlatformProductCatalogOverride", uniqueCols: ["externalId"] },
  { table: "PlatformCatalogAlias", uniqueCols: ["kind", "rawKey"] },
  { table: "ProviderDisplayConfig", uniqueCols: [] },
];

/**
 * Fusiona un proveedor por lista duplicado (`LIST_ACME`) dentro del proveedor
 * real (`ELIT` o `LIST_ACME_2`): mueve fichas, ofertas, cargas, perfiles,
 * historial, pedidos y vínculos; después borra la organización duplicada si
 * quedó vacía. Red de seguridad para cuando un comercio creó por lista algo
 * que ya existía.
 */
@Injectable()
export class ProviderMergeService {
  private readonly logger = new Logger(ProviderMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async merge(from: string, into: string): Promise<ProviderMergeResult> {
    if (from === into) throw new BadRequestException("Origen y destino son el mismo proveedor");
    if (!isListProviderKey(from)) {
      throw new BadRequestException("Solo se puede unificar un proveedor por lista (LIST_*) dentro de otro");
    }
    const [source, target] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { providerKey: from }, select: { id: true, name: true } }),
      this.prisma.tenant.findUnique({ where: { providerKey: into }, select: { id: true, name: true, type: true } }),
    ]);
    if (!source) throw new NotFoundException(`No existe ninguna organización con clave ${from}`);
    if (!target) throw new NotFoundException(`No existe ninguna organización con clave ${into}`);

    const moved: Record<string, number> = {};
    const dropped: Record<string, number> = {};

    await this.prisma.$transaction(
      async (tx) => {
        for (const { table, uniqueCols } of TABLES) {
          const t = Prisma.raw(`"${table}"`);
          if (uniqueCols.length === 0 && table !== "ProviderDisplayConfig") {
            const res = await tx.$executeRaw`UPDATE ${t} SET "provider" = ${into} WHERE "provider" = ${from}`;
            moved[table] = res;
            continue;
          }
          if (table === "ProviderDisplayConfig") {
            // Es clave primaria: si el destino ya tiene config, la del origen sobra.
            const del = await tx.$executeRaw`DELETE FROM ${t} WHERE "provider" = ${from} AND EXISTS (SELECT 1 FROM ${t} d WHERE d."provider" = ${into})`;
            const upd = await tx.$executeRaw`UPDATE ${t} SET "provider" = ${into} WHERE "provider" = ${from}`;
            dropped[table] = del;
            moved[table] = upd;
            continue;
          }
          const cond = Prisma.raw(uniqueCols.map((c) => `d."${c}" = s."${c}"`).join(" AND "));
          const del = await tx.$executeRaw`DELETE FROM ${t} s WHERE s."provider" = ${from} AND EXISTS (SELECT 1 FROM ${t} d WHERE d."provider" = ${into} AND ${cond})`;
          const upd = await tx.$executeRaw`UPDATE ${t} SET "provider" = ${into} WHERE "provider" = ${from}`;
          dropped[table] = del;
          moved[table] = upd;
        }

        // Vínculos: los clientes del duplicado pasan al real (si ya estaban, se descarta el duplicado).
        const links = await tx.tenantLink.findMany({ where: { supplierTenantId: source.id } });
        let movedLinks = 0;
        let droppedLinks = 0;
        for (const link of links) {
          const exists = await tx.tenantLink.findUnique({
            where: { clientTenantId_supplierTenantId: { clientTenantId: link.clientTenantId, supplierTenantId: target.id } },
          });
          if (exists) {
            await tx.tenantLink.delete({ where: { id: link.id } });
            droppedLinks++;
          } else {
            await tx.tenantLink.update({ where: { id: link.id }, data: { supplierTenantId: target.id, accountManagerId: null } });
            movedLinks++;
          }
        }
        moved.TenantLink = movedLinks;
        dropped.TenantLink = droppedLinks;
      },
      { timeout: 120_000 }
    );

    // La organización duplicada se borra solo si no tiene gente adentro.
    let deletedTenantId: string | null = null;
    const members = await this.prisma.tenantMembership.count({ where: { tenantId: source.id } });
    if (members === 0) {
      await this.prisma.tenant.delete({ where: { id: source.id } });
      deletedTenantId = source.id;
    } else {
      await this.prisma.tenant.update({ where: { id: source.id }, data: { providerKey: null, active: false } });
    }

    this.logger.log(`Proveedor ${from} unificado en ${into} (${JSON.stringify(moved)})`);
    return { from, into, moved, dropped, deletedTenantId };
  }

  /** Candidatos a unificar: proveedores por lista y a qué se parecen por nombre. */
  async candidates() {
    const tenants = await this.prisma.tenant.findMany({
      where: { providerKey: { not: null }, active: true },
      select: { id: true, name: true, type: true, providerKey: true, managedByPlatform: true, _count: { select: { clientLinks: true } } },
      orderBy: { name: "asc" },
    });
    const listOnes = tenants.filter((t) => isListProviderKey(t.providerKey));
    return listOnes.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      providerKey: t.providerKey as string,
      managedByPlatform: t.managedByPlatform,
      clients: t._count.clientLinks,
      similar: tenants
        .filter((o) => o.id !== t.id && similarity(o.name, t.name) >= 0.6)
        .map((o) => ({ id: o.id, name: o.name, providerKey: o.providerKey as string, type: o.type })),
    }));
  }
}

/** Parecido entre nombres (0..1) por bigramas, ignorando acentos, puntuación y sufijos societarios. */
export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|srl|sa|sas|s\.?a\.?s\.?|distribuidora|distribuidor|mayorista|group|grupo)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigrams(s: string): Set<string> {
  const compact = s.replace(/\s+/g, " ");
  const out = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) out.add(compact.slice(i, i + 2));
  return out;
}
