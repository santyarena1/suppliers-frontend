import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AssetsService } from "../assets/assets.service";
import { CatalogAiService } from "../catalog/catalog-ai.service";
import { BulkDecideDto, ListMastersQueryDto, MasterFilterDto, MemberRefDto } from "./dto/enrichment.dto";
import { imageSize } from "./image-verify";
import { brandKeyOf } from "./keys";
import { EnrichmentPipelineService } from "./pipeline.service";
import { ProposalField } from "./proposal-builder";
import { schemaFor } from "./schemas";
import { MANUFACTURER_CONNECTORS } from "./sources/manufacturers";
import { httpGet } from "./sources/http";
import { TAXONOMY, TAXONOMY_BY_KEY } from "./taxonomy";

/** Tope de AssetsService.saveImage. */
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

interface GalleryImage {
  url: string;
  source: string;
  origin?: string;
  width?: number;
  height?: number;
  assetUrl?: string;
  persistError?: string;
}

/** Qué columna de la ficha tocaría cada campo al aplicar. */
const APPLY_COLUMNS: Record<ProposalField, string | null> = {
  images: "imageUrl",
  description: "description",
  longDescription: "longDescription",
  category: null,
  attributes: null,
};

export function masterWhere(f: MasterFilterDto = {}): Prisma.CatalogMasterWhereInput {
  const and: Prisma.CatalogMasterWhereInput[] = [];
  if (f.q?.trim()) {
    const q = f.q.trim();
    const compact = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        ...(compact.length >= 3 ? [{ partNumber: { contains: compact } }, { ean: { contains: compact } }] : []),
      ],
    });
  }
  if (f.category) and.push(f.category === "none" ? { categoryKey: null } : { categoryKey: f.category });
  if (f.brand) and.push({ brandKey: brandKeyOf(f.brand) ?? f.brand });
  if (f.provider) and.push({ members: { some: { provider: f.provider } } });
  if (f.status) and.push({ status: f.status });
  if (f.hasAiImage !== undefined) and.push({ hasAiImage: f.hasAiImage });
  if (f.missingDescription !== undefined) and.push({ missingDescription: f.missingDescription });
  if (f.doubtful !== undefined) and.push({ doubtful: f.doubtful });
  if (f.multiProvider) and.push({ memberCount: { gte: 2 } });
  if (f.minConfidence !== undefined) and.push({ bestConfidence: { gte: f.minConfidence } });
  if (f.maxConfidence !== undefined) and.push({ bestConfidence: { lte: f.maxConfidence } });
  return and.length ? { AND: and } : {};
}

/**
 * Consultas y decisiones del módulo "Productos enriquecidos". Lee las fichas
 * para mostrarlas; nunca las modifica ("Aplicar" está deshabilitado en esta
 * entrega: solo hay vista previa).
 */
@Injectable()
export class MastersService {
  private readonly logger = new Logger(MastersService.name);
  private persisting = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly pipeline: EnrichmentPipelineService,
    private readonly catalogAi: CatalogAiService,
    private readonly config: ConfigService
  ) {}

  async overview() {
    const [byStatus, total, doubtful, multi, aiImage, noDesc, pending, approved, categories] = await Promise.all([
      this.prisma.catalogMaster.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.catalogMaster.count(),
      this.prisma.catalogMaster.count({ where: { doubtful: true } }),
      this.prisma.catalogMaster.count({ where: { memberCount: { gte: 2 } } }),
      this.prisma.catalogMaster.count({ where: { hasAiImage: true } }),
      this.prisma.catalogMaster.count({ where: { missingDescription: true } }),
      this.prisma.enrichmentProposal.count({ where: { status: "PENDING" } }),
      this.prisma.enrichmentProposal.count({ where: { status: "APPROVED" } }),
      this.prisma.catalogMaster.groupBy({ by: ["categoryKey"], _count: { _all: true } }),
    ]);
    return {
      masters: total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      doubtful,
      multiProvider: multi,
      hasAiImage: aiImage,
      missingDescription: noDesc,
      proposals: { pending, approved },
      categories: TAXONOMY.map((c) => ({ key: c.key, label: c.label, count: categories.find((x) => x.categoryKey === c.key)?._count._all ?? 0 })).concat([
        { key: "none", label: "Sin categoría", count: categories.find((x) => x.categoryKey === null)?._count._all ?? 0 },
      ]),
      sources: {
        icecat: !!this.config.get<string>("ICECAT_USERNAME"),
        ai: await this.catalogAi.isConfigured(),
        manufacturers: MANUFACTURER_CONNECTORS.map((c) => ({ source: c.source, brands: c.brandKeys })),
      },
      applyEnabled: false,
    };
  }

  async list(query: ListMastersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = masterWhere(query);
    const orderBy: Prisma.CatalogMasterOrderByWithRelationInput[] =
      query.sort === "members"
        ? [{ memberCount: "desc" }, { name: "asc" }]
        : query.sort === "confidence"
          ? [{ bestConfidence: { sort: "desc", nulls: "last" } }, { name: "asc" }]
          : query.sort === "updated"
            ? [{ updatedAt: "desc" }]
            : [{ name: "asc" }];
    const [total, rows] = await Promise.all([
      this.prisma.catalogMaster.count({ where }),
      this.prisma.catalogMaster.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          members: { select: { provider: true, externalId: true } },
          proposals: { select: { field: true, status: true, confidence: true, source: true, value: true } },
        },
      }),
    ]);
    const thumbs = await this.thumbnails(rows.flatMap((r) => r.members));
    return {
      items: rows.map((r) => {
        const gallery = r.proposals.find((p) => p.field === "images")?.value as { images?: GalleryImage[] } | undefined;
        return {
          id: r.id,
          name: r.name,
          brand: r.brand,
          partNumber: r.partNumber,
          ean: r.ean,
          matchKind: r.matchKind,
          categoryKey: r.categoryKey,
          categoryLabel: r.categoryKey ? TAXONOMY_BY_KEY[r.categoryKey]?.label ?? r.categoryKey : null,
          status: r.status,
          doubtful: r.doubtful,
          doubtReason: r.doubtReason,
          memberCount: r.memberCount,
          providers: [...new Set(r.members.map((m) => m.provider))],
          hasAiImage: r.hasAiImage,
          missingDescription: r.missingDescription,
          bestConfidence: r.bestConfidence,
          enrichedAt: r.enrichedAt,
          currentImage: r.members.map((m) => thumbs.get(`${m.provider}:${m.externalId}`)).find(Boolean) ?? null,
          proposedImage: gallery?.images?.[0]?.url ?? null,
          proposals: r.proposals.map(({ field, status, confidence, source }) => ({ field, status, confidence, source })),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  private async thumbnails(members: { provider: string; externalId: string }[]): Promise<Map<string, string>> {
    if (members.length === 0) return new Map();
    const rows = await this.prisma.providerSyncCache.findMany({
      where: { OR: members.map((m) => ({ provider: m.provider, externalId: m.externalId })), imageUrl: { not: null } },
      select: { provider: true, externalId: true, imageUrl: true },
    });
    return new Map(rows.map((r) => [`${r.provider}:${r.externalId}`, r.imageUrl!]));
  }

  async detail(id: string) {
    const master = await this.prisma.catalogMaster.findUnique({ where: { id }, include: { members: true, proposals: { orderBy: { field: "asc" } } } });
    if (!master) throw new NotFoundException("Producto maestro no encontrado");
    const fichas = await this.pipeline.loadFichas(master.members);
    const manual = new Set(master.members.filter((m) => m.manual).map((m) => `${m.provider}:${m.externalId}`));
    const schema = schemaFor(master.categoryKey);
    return {
      master: {
        ...master,
        members: undefined,
        proposals: undefined,
        categoryLabel: master.categoryKey ? TAXONOMY_BY_KEY[master.categoryKey]?.label ?? master.categoryKey : null,
      },
      fichas: fichas.map(({ raw: _raw, ...f }) => ({ ...f, manual: manual.has(`${f.provider}:${f.externalId}`) })),
      proposals: master.proposals,
      schema: { categoryKey: schema.categoryKey, version: schema.version, attributes: schema.attributes.map(({ aliases: _a, ...a }) => a) },
      applyEnabled: false,
      applyNote: "La regla de aplicación se elige después de ver ejemplos",
    };
  }

  async decide(masterId: string, field: string, decision: "APPROVED" | "REJECTED" | "PENDING", userId: string) {
    const proposal = await this.prisma.enrichmentProposal.findUnique({ where: { masterId_field: { masterId, field } } });
    if (!proposal) throw new NotFoundException("No hay propuesta para ese campo");
    if (proposal.status === "APPLIED") throw new BadRequestException("La propuesta ya se aplicó");
    const updated = await this.prisma.enrichmentProposal.update({
      where: { id: proposal.id },
      data: { status: decision, decidedById: decision === "PENDING" ? null : userId, decidedAt: decision === "PENDING" ? null : new Date() },
    });
    if (decision === "APPROVED" && field === "images") await this.persistGallery(updated.id);
    return updated;
  }

  async bulkDecide(dto: BulkDecideDto, userId: string) {
    const where: Prisma.EnrichmentProposalWhereInput = {
      status: "PENDING",
      confidence: { gte: dto.minConfidence },
      ...(dto.field ? { field: dto.field } : {}),
      master: masterWhere(dto.filter),
    };
    const count = await this.prisma.enrichmentProposal.count({ where });
    if (!dto.confirm) return { matched: count, updated: 0 };
    const res = await this.prisma.enrichmentProposal.updateMany({ where, data: { status: dto.decision, decidedById: userId, decidedAt: new Date() } });
    if (dto.decision === "APPROVED" && (!dto.field || dto.field === "images")) void this.persistApprovedGalleries();
    return { matched: count, updated: res.count };
  }

  /**
   * Copia a nuestro almacenamiento las fotos de una galería aprobada. Recién
   * acá se bajan enteras (antes solo se verificaron), para no llenar la base
   * con fotos de propuestas que nadie aprobó.
   */
  async persistGallery(proposalId: string): Promise<void> {
    const proposal = await this.prisma.enrichmentProposal.findUnique({ where: { id: proposalId } });
    const value = proposal?.value as { images?: GalleryImage[] } | null;
    if (!proposal || !value?.images?.length) return;
    const images: GalleryImage[] = [];
    for (const img of value.images) {
      if (img.assetUrl) {
        images.push(img);
        continue;
      }
      try {
        const res = await httpGet(img.url, { maxBytes: MAX_ASSET_BYTES });
        const dims = res.status === 200 ? imageSize(res.buffer) : null;
        if (!dims) {
          images.push({ ...img, persistError: res.status === 200 ? "no es una imagen" : `HTTP ${res.status}` });
          continue;
        }
        const ext = dims.mime.split("/")[1];
        const saved = await this.assets.saveImage({ filename: `enrichment-${proposal.masterId}.${ext}`, mimetype: dims.mime, buffer: res.buffer });
        images.push({ ...img, assetUrl: saved.url, persistError: undefined });
      } catch (err) {
        images.push({ ...img, persistError: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.prisma.enrichmentProposal.update({ where: { id: proposalId }, data: { value: { ...value, images } as unknown as Prisma.InputJsonValue } });
  }

  /** Galerías aprobadas en bloque: se copian de a una, en segundo plano. */
  async persistApprovedGalleries(): Promise<void> {
    if (this.persisting) return;
    this.persisting = true;
    try {
      const approved = await this.prisma.enrichmentProposal.findMany({ where: { field: "images", status: "APPROVED" }, select: { id: true, value: true } });
      for (const p of approved) {
        const images = (p.value as { images?: GalleryImage[] } | null)?.images ?? [];
        if (images.some((i) => !i.assetUrl && !i.persistError)) await this.persistGallery(p.id);
      }
    } catch (err) {
      this.logger.warn(`persistApprovedGalleries: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.persisting = false;
    }
  }

  /** Separa fichas a un maestro nuevo armado a mano. Reagrupar lo respeta. */
  async split(masterId: string, refs: MemberRefDto[]) {
    const master = await this.prisma.catalogMaster.findUnique({ where: { id: masterId }, include: { members: true } });
    if (!master) throw new NotFoundException("Producto maestro no encontrado");
    const wanted = new Set(refs.map((r) => `${r.provider}:${r.externalId}`));
    const moving = master.members.filter((m) => wanted.has(`${m.provider}:${m.externalId}`));
    if (moving.length !== refs.length) throw new BadRequestException("Alguna ficha no pertenece a este maestro");
    if (moving.length === master.members.length) throw new BadRequestException("Tiene que quedar al menos una ficha en el maestro original");
    const [first] = await this.pipeline.loadFichas(moving);
    const created = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.catalogMaster.create({
        data: {
          key: `manual:${randomUUID()}`,
          matchKind: "MANUAL",
          brand: first?.brand ?? master.brand,
          brandKey: brandKeyOf(first?.brand ?? master.brand),
          partNumber: master.partNumber,
          ean: null,
          name: first?.name ?? master.name,
          categoryRaw: first?.category ?? master.categoryRaw,
          categoryKey: master.categoryKey,
          lockedManual: true,
          memberCount: moving.length,
        },
      });
      await tx.catalogMasterMember.updateMany({ where: { id: { in: moving.map((m) => m.id) } }, data: { masterId: fresh.id, manual: true } });
      // Lo que queda también se fija: si no, reagrupar volvería a unir todo.
      await tx.catalogMasterMember.updateMany({ where: { masterId }, data: { manual: true } });
      await tx.catalogMaster.update({
        where: { id: masterId },
        data: { lockedManual: true, memberCount: master.members.length - moving.length, doubtful: false, doubtReason: null, status: "NEW" },
      });
      return fresh;
    });
    return { originalId: masterId, newId: created.id };
  }

  /** Une maestros en uno (el destino conserva sus propuestas; las de los otros se descartan). */
  async merge(targetId: string, sourceIds: string[]) {
    const ids = sourceIds.filter((id) => id !== targetId);
    if (ids.length === 0) throw new BadRequestException("Elegí al menos otro maestro para unir");
    const found = await this.prisma.catalogMaster.count({ where: { id: { in: [targetId, ...ids] } } });
    if (found !== ids.length + 1) throw new NotFoundException("Algún maestro no existe");
    await this.prisma.$transaction(async (tx) => {
      await tx.catalogMasterMember.updateMany({ where: { masterId: { in: [targetId, ...ids] } }, data: { masterId: targetId, manual: true } });
      await tx.catalogMaster.deleteMany({ where: { id: { in: ids } } });
      const count = await tx.catalogMasterMember.count({ where: { masterId: targetId } });
      await tx.catalogMaster.update({ where: { id: targetId }, data: { lockedManual: true, memberCount: count, doubtful: false, doubtReason: null, status: "NEW" } });
    });
    return { targetId, merged: ids.length };
  }

  /**
   * Vista previa de "Aplicar": qué cambiaría en cada ficha con las dos reglas
   * posibles (solo completar vacíos / reemplazar). No escribe nada.
   */
  async applyPreview(masterId: string) {
    const master = await this.prisma.catalogMaster.findUnique({ where: { id: masterId }, include: { members: true, proposals: true } });
    if (!master) throw new NotFoundException("Producto maestro no encontrado");
    const fichas = await this.pipeline.loadFichas(master.members);
    const usable = master.proposals.filter((p) => p.status === "APPROVED" || p.status === "PENDING");
    return {
      applyEnabled: false,
      note: "La regla de aplicación se elige después de ver ejemplos",
      fichas: fichas.map((f) => ({
        provider: f.provider,
        externalId: f.externalId,
        name: f.name,
        changes: usable.map((p) => {
          const column = APPLY_COLUMNS[p.field as ProposalField] ?? null;
          const proposed = proposedScalar(p.field, p.value);
          const current = column === "imageUrl" ? f.imageUrl : column === "description" ? f.description : column === "longDescription" ? f.longDescription : null;
          const isEmpty = !current || !String(current).trim() || (column === "imageUrl" && f.aiImage);
          return {
            field: p.field,
            status: p.status,
            column,
            current,
            proposed,
            currentIsAiImage: column === "imageUrl" ? f.aiImage : undefined,
            fillEmpty: column !== null && isEmpty && proposed !== null,
            overwrite: column !== null && proposed !== null && current !== proposed,
          };
        }),
      })),
    };
  }
}

function proposedScalar(field: string, value: Prisma.JsonValue): string | null {
  const v = value as Record<string, unknown> | null;
  if (!v) return null;
  if (field === "images") {
    const first = (v.images as GalleryImage[] | undefined)?.[0];
    return first?.assetUrl ?? first?.url ?? null;
  }
  if (field === "description" || field === "longDescription") return typeof v.text === "string" ? v.text : null;
  return null;
}
