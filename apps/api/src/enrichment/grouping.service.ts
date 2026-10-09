import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { resolveCatalogDisplay } from "../catalog/catalog-enrichment";
import { groupRows, GroupingRow, MasterGroup } from "./grouping";
import { detectCategory } from "./taxonomy";

const PAGE = 5000;
const WRITE_CHUNK = 500;

export interface RegroupResult {
  fichas: number;
  masters: number;
  created: number;
  updated: number;
  deleted: number;
  membersMoved: number;
  doubtful: number;
  ms: number;
}

type MasterData = {
  key: string;
  matchKind: string;
  brand: string | null;
  brandKey: string | null;
  partNumber: string | null;
  ean: string | null;
  name: string;
  categoryRaw: string | null;
  categoryKey: string | null;
  doubtful: boolean;
  doubtReason: string | null;
  memberCount: number;
  hasAiImage: boolean;
  missingDescription: boolean;
};

const memberKey = (provider: string, externalId: string) => `${provider}\u0000${externalId}`;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Recalcula los productos maestros a partir de todas las fichas. Idempotente:
 * con las mismas fichas no cambia nada. Respeta lo que el superadmin separó o
 * unió a mano. Solo lee `ProviderSyncCache`; escribe únicamente en las tablas
 * del módulo.
 */
@Injectable()
export class GroupingService {
  private readonly logger = new Logger(GroupingService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogEnrichmentService
  ) {}

  async regroup(): Promise<RegroupResult> {
    if (this.running) throw new ConflictException("Ya se está reagrupando");
    this.running = true;
    const started = Date.now();
    try {
      const { rows, aiImageIds, withDescription } = await this.loadRows();
      const manual = await this.prisma.catalogMasterMember.findMany({ where: { manual: true }, select: { provider: true, externalId: true } });
      const manualKeys = new Set(manual.map((m) => memberKey(m.provider, m.externalId)));
      const autoRows = rows.filter((r) => !manualKeys.has(memberKey(r.provider, r.externalId)));
      const groups = groupRows(autoRows);
      const result = await this.persist(groups, aiImageIds, withDescription, new Set(rows.map((r) => memberKey(r.provider, r.externalId))));
      await this.refreshCounts();
      const out = { ...result, fichas: rows.length, masters: groups.length, doubtful: groups.filter((g) => g.doubtful).length, ms: Date.now() - started };
      this.logger.log(`regroup: ${JSON.stringify(out)}`);
      return out;
    } finally {
      this.running = false;
    }
  }

  private async loadRows(): Promise<{ rows: GroupingRow[]; aiImageIds: Set<string>; withDescription: Set<string> }> {
    const ctx = await this.catalog.getContext();
    const rows: GroupingRow[] = [];
    const withDescription = new Set<string>();
    const idByKey = new Map<string, string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.providerSyncCache.findMany({
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, provider: true, externalId: true, name: true, brand: true, category: true, subcategory: true, partNumber: true, ean: true, description: true, longDescription: true },
      });
      if (page.length === 0) break;
      for (const p of page) {
        const display = resolveCatalogDisplay(p, ctx);
        rows.push({ provider: p.provider, externalId: p.externalId, name: p.name, brand: display.displayBrand, partNumber: p.partNumber, ean: p.ean, category: display.displayCategory });
        idByKey.set(memberKey(p.provider, p.externalId), p.id);
        if ((p.description && p.description.trim().length > 20) || (p.longDescription && p.longDescription.trim().length > 20)) {
          withDescription.add(memberKey(p.provider, p.externalId));
        }
      }
      cursor = page[page.length - 1].id;
      if (page.length < PAGE) break;
    }
    const fills = await this.prisma.imageSyncFill.findMany({ where: { status: "filled", source: { startsWith: "serper" } }, select: { productId: true } });
    const filledIds = new Set(fills.map((f) => f.productId));
    const aiImageIds = new Set([...idByKey.entries()].filter(([, id]) => filledIds.has(id)).map(([k]) => k));
    return { rows, aiImageIds, withDescription };
  }

  private masterData(g: MasterGroup, aiImageIds: Set<string>, withDescription: Set<string>): MasterData {
    const keys = g.members.map((m) => memberKey(m.provider, m.externalId));
    return {
      key: g.key,
      matchKind: g.matchKind,
      brand: g.brand,
      brandKey: g.brandKey,
      partNumber: g.partNumber,
      ean: g.ean,
      name: g.name,
      categoryRaw: g.categoryRaw,
      categoryKey: detectCategory(g.categoryRaw, g.name)?.key ?? null,
      doubtful: g.doubtful,
      doubtReason: g.doubtReason,
      memberCount: g.members.length,
      hasAiImage: keys.some((k) => aiImageIds.has(k)),
      missingDescription: !keys.some((k) => withDescription.has(k)),
    };
  }

  private async persist(groups: MasterGroup[], aiImageIds: Set<string>, withDescription: Set<string>, liveFichas: Set<string>) {
    const existingMasters = await this.prisma.catalogMaster.findMany({
      select: { id: true, key: true, lockedManual: true, matchKind: true, brand: true, brandKey: true, partNumber: true, ean: true, name: true, categoryRaw: true, categoryKey: true, doubtful: true, doubtReason: true, memberCount: true, hasAiImage: true, missingDescription: true },
    });
    const byKey = new Map(existingMasters.map((m) => [m.key, m]));
    const byId = new Map(existingMasters.map((m) => [m.id, m]));
    const existingMembers = await this.prisma.catalogMasterMember.findMany({ where: { manual: false }, select: { provider: true, externalId: true, masterId: true } });
    const currentMaster = new Map(existingMembers.map((m) => [memberKey(m.provider, m.externalId), m.masterId]));

    // 1) Misma clave: mismo maestro. 2) Si la clave cambió (p. ej. llegó otro
    //    distribuidor con EAN), se conserva el maestro donde estaba la mayoría
    //    de sus fichas, para no perder sus propuestas. 3) Si no, uno nuevo.
    const claimed = new Set<string>();
    const target = new Map<MasterGroup, string>();
    for (const g of groups) {
      const m = byKey.get(g.key);
      if (m && !m.lockedManual) {
        target.set(g, m.id);
        claimed.add(m.id);
      }
    }
    for (const g of groups) {
      if (target.has(g)) continue;
      const votes = new Map<string, number>();
      for (const mem of g.members) {
        const id = currentMaster.get(memberKey(mem.provider, mem.externalId));
        if (id && !claimed.has(id) && !byId.get(id)?.lockedManual) votes.set(id, (votes.get(id) ?? 0) + 1);
      }
      const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      if (best) {
        target.set(g, best[0]);
        claimed.add(best[0]);
      }
    }

    const creates: (MasterData & { id: string })[] = [];
    const updates: { id: string; data: MasterData }[] = [];
    for (const g of groups) {
      const data = this.masterData(g, aiImageIds, withDescription);
      const id = target.get(g);
      if (!id) {
        const newId = randomUUID();
        target.set(g, newId);
        creates.push({ id: newId, ...data });
        continue;
      }
      const cur = byId.get(id)!;
      const changed = (Object.keys(data) as (keyof MasterData)[]).some((k) => k !== "categoryKey" && cur[k] !== data[k]);
      // La categoría unificada puede haberla corregido el pipeline: solo se completa si faltaba.
      if (changed || (!cur.categoryKey && data.categoryKey)) updates.push({ id, data: { ...data, categoryKey: cur.categoryKey ?? data.categoryKey } });
    }

    for (const batch of chunks(creates, WRITE_CHUNK)) await this.prisma.catalogMaster.createMany({ data: batch });
    for (const u of updates) await this.prisma.catalogMaster.update({ where: { id: u.id }, data: u.data });

    const newMembers: { masterId: string; provider: string; externalId: string }[] = [];
    const moves = new Map<string, { provider: string; externalId: string }[]>();
    for (const g of groups) {
      const masterId = target.get(g)!;
      for (const mem of g.members) {
        const cur = currentMaster.get(memberKey(mem.provider, mem.externalId));
        if (!cur) newMembers.push({ masterId, provider: mem.provider, externalId: mem.externalId });
        else if (cur !== masterId) moves.set(masterId, [...(moves.get(masterId) ?? []), { provider: mem.provider, externalId: mem.externalId }]);
      }
    }
    for (const batch of chunks(newMembers, WRITE_CHUNK)) await this.prisma.catalogMasterMember.createMany({ data: batch, skipDuplicates: true });
    let membersMoved = 0;
    for (const [masterId, list] of moves) {
      for (const batch of chunks(list, WRITE_CHUNK)) {
        const r = await this.prisma.catalogMasterMember.updateMany({ where: { manual: false, OR: batch }, data: { masterId } });
        membersMoved += r.count;
      }
    }

    // Fichas que ya no existen (el distribuidor las dio de baja).
    const gone = [...currentMaster.keys()].filter((k) => !liveFichas.has(k)).map((k) => {
      const [provider, externalId] = k.split("\u0000");
      return { provider, externalId };
    });
    for (const batch of chunks(gone, WRITE_CHUNK)) await this.prisma.catalogMasterMember.deleteMany({ where: { OR: batch } });
    const manualGone = await this.prisma.catalogMasterMember.findMany({ where: { manual: true }, select: { id: true, provider: true, externalId: true } });
    const manualGoneIds = manualGone.filter((m) => !liveFichas.has(memberKey(m.provider, m.externalId))).map((m) => m.id);
    if (manualGoneIds.length) await this.prisma.catalogMasterMember.deleteMany({ where: { id: { in: manualGoneIds } } });

    const deleted = await this.prisma.catalogMaster.deleteMany({ where: { members: { none: {} } } });
    return { created: creates.length, updated: updates.length, deleted: deleted.count, membersMoved };
  }

  /** Cantidad de fichas por maestro (incluye los armados a mano). */
  async refreshCounts(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "CatalogMaster" m SET "memberCount" = c.n
      FROM (SELECT "masterId", COUNT(*)::int AS n FROM "CatalogMasterMember" GROUP BY "masterId") c
      WHERE c."masterId" = m.id AND m."memberCount" <> c.n`;
  }
}
