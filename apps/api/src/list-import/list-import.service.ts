import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { isListProviderKey, type Provider } from "@nodo/shared";
import { Prisma, type ImportProfile, type ListImportLevel, type SupplierListImport } from "@prisma/client";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { ProviderRegistry } from "../providers/provider-registry";
import type { NormalizedProduct } from "../providers/types";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { matchAgainstCatalog } from "./catalog-matcher";
import { computeDiff } from "./diff";
import { readGrid } from "./grid-reader";
import { normalizeRows } from "./row-normalizer";
import { ProfileLearner } from "./profile-learner";
import { evaluateSanity, type SanityInput } from "./sanity-checks";
import { analyzeStructure, fingerprintOf } from "./structure-analyzer";
import {
  NORMALIZED_FIELDS,
  type ImportDiff,
  type ImportProfileSpec,
  type NormalizedField,
  type PreviousOffer,
  type RowIssue,
  type SanityThresholds,
  type SheetAnalysis,
  type StructureAnalysis,
} from "./types";
import type { SaveImportProfileDto } from "./dto/list-import.dto";

/** Quién sube: rol de plataforma + organización de la sesión (si tiene). */
export interface ImportActor {
  userId: string;
  isSuperadmin: boolean;
  tenant: TenantContext | null;
}

export interface ImportAccess {
  level: ListImportLevel;
  /** Organización a la que se le escriben ofertas (TENANT) o desde la que se sube (BASE). */
  tenantId: string;
  supplierTenantId: string;
  supplierName: string;
}

const PREVIEW_ROWS = 30;
const MAX_ISSUES_STORED = 2000;
const ROLES_CAN_UPLOAD = new Set(["OWNER", "ADMIN", "PRODUCT_MANAGER"]);
const STUCK_AFTER_MS = 30 * 60 * 1000;
const FRESHNESS_WARNING_DAYS = 2;
const MIME_BY_EXT: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

type ImportPreview = {
  sheetCount: number;
  sheets: { index: number; name: string; dataRows: number; headerRow: number | null }[];
  sheetIndex: number;
  headerRow: number | null;
  headers: string[];
  rows: unknown[][];
  dividers: string[];
};

/**
 * Orquesta la vida de una planilla subida: guardar, analizar, resolver el
 * perfil, normalizar, comparar, decidir si se aplica sola, aplicar, revertir.
 * Todo termina en un estado visible en `SupplierListImport`.
 */
@Injectable()
export class ListImportService {
  private readonly logger = new Logger(ListImportService.name);
  private readonly processing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly registry: ProviderRegistry,
    private readonly visibility: TenantVisibilityService,
    private readonly learner: ProfileLearner,
    private readonly catalog: CatalogEnrichmentService
  ) {}

  // ---------- Permisos ----------

  /** A qué nivel escribe este actor sobre este proveedor, o corta si no puede. */
  async resolveAccess(actor: ImportActor, provider: Provider): Promise<ImportAccess> {
    const supplier = await this.prisma.tenant.findUnique({
      where: { providerKey: provider },
      select: { id: true, name: true, active: true },
    });
    if (!supplier || !supplier.active) throw new NotFoundException("Proveedor no encontrado");
    // Un proveedor con API tiene su base en la API: la lista solo vale como precios
    // propios de un comercio (canal LIST). Uno por lista admite base y propios.
    const acceptsBase = isListProviderKey(provider) && !this.registry.get(provider);

    if (actor.isSuperadmin) {
      if (acceptsBase) {
        return { level: "BASE", tenantId: actor.tenant?.tenantId ?? supplier.id, supplierTenantId: supplier.id, supplierName: supplier.name };
      }
      if (actor.tenant && actor.tenant.tenantType === "RETAILER") {
        return { level: "TENANT", tenantId: commercialId(actor.tenant), supplierTenantId: supplier.id, supplierName: supplier.name };
      }
      throw new BadRequestException(`${supplier.name} se sincroniza por API: solo un comercio puede cargar su propia lista`);
    }
    const tenant = actor.tenant;
    if (!tenant) throw new ForbiddenException("Tu usuario no pertenece a ninguna organización");
    if (!ROLES_CAN_UPLOAD.has(tenant.tenantRole)) {
      throw new ForbiddenException("Solo dueños, administradores o product managers pueden cargar listas");
    }
    if (tenant.tenantId === supplier.id || tenant.commercialTenantId === supplier.id) {
      if (!acceptsBase) throw new BadRequestException("Tu catálogo se sincroniza por API: no admite lista base");
      return { level: "BASE", tenantId: supplier.id, supplierTenantId: supplier.id, supplierName: supplier.name };
    }
    if (tenant.tenantType === "RETAILER") {
      const linked = await this.visibility.isLinked(commercialId(tenant), provider);
      if (!linked) throw new ForbiddenException(`Todavía no estás vinculado con ${supplier.name}`);
      return { level: "TENANT", tenantId: commercialId(tenant), supplierTenantId: supplier.id, supplierName: supplier.name };
    }
    throw new ForbiddenException("Tu organización no puede cargar listas de este proveedor");
  }

  // ---------- Subida ----------

  async upload(actor: ImportActor, provider: Provider, file: { buffer: Buffer; filename: string }) {
    const access = await this.resolveAccess(actor, provider);
    const ext = (file.filename.split(".").pop() ?? "").toLowerCase();
    if (!MIME_BY_EXT[ext]) throw new BadRequestException("Se aceptan archivos .xlsx, .xls o .csv");
    if (file.buffer.length === 0) throw new BadRequestException("El archivo está vacío");

    const asset = await this.prisma.storedAsset.create({
      data: { mimeType: MIME_BY_EXT[ext], filename: file.filename, byteSize: file.buffer.length, data: file.buffer },
      select: { id: true },
    });
    const record = await this.prisma.supplierListImport.create({
      data: {
        provider,
        tenantId: access.tenantId,
        uploadedByUserId: actor.userId,
        level: access.level,
        originalFileName: file.filename,
        storedAssetId: asset.id,
        status: "PROCESSING",
      },
    });
    this.kick(record.id);
    return this.serialize(record);
  }

  /** Procesa en background, sin duplicar si ya está corriendo. */
  private kick(importId: string) {
    if (this.processing.has(importId)) return;
    this.processing.add(importId);
    this.process(importId)
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Carga ${importId} falló: ${message}`);
        await this.prisma.supplierListImport
          .update({ where: { id: importId }, data: { status: "FAILED", error: message.slice(0, 1000) } })
          .catch(() => undefined);
      })
      .finally(() => this.processing.delete(importId));
  }

  // ---------- Pipeline ----------

  async process(importId: string): Promise<void> {
    const record = await this.prisma.supplierListImport.findUniqueOrThrow({ where: { id: importId } });
    const { analysis, sheetCount } = await this.analyzeStoredFile(record);
    if (!analysis.chosen) {
      await this.prisma.supplierListImport.update({
        where: { id: importId },
        data: { status: "FAILED", error: "No se encontró una tabla de productos en el archivo", preview: this.previewOf(analysis, sheetCount, null) },
      });
      return;
    }

    const resolved = await this.resolveProfile(record.provider, analysis);
    const sheet = resolved.sheet;
    const normalized = normalizeRows(sheet, resolved.spec);
    const matched = await matchAgainstCatalog(this.prisma, record.provider, normalized.items);
    normalized.items = matched.items;
    normalized.issues.push(...matched.issues);
    const previous = await this.previousOffers(record.provider, record.level, record.tenantId);
    const diff = computeDiff(previous, normalized.items);
    const thresholds = await this.sanityThresholds();
    const sanity: SanityInput = {
      diff,
      rowsNow: normalized.items.length,
      rowsBefore: previous.length,
      profileMatch: resolved.match,
    };
    const reasons = evaluateSanity(sanity, thresholds);
    if (matched.knownCatalogSize > 0 && matched.unmatched > 0 && matched.unmatched > matched.matched) {
      reasons.push(
        `${matched.unmatched} de ${normalized.items.length} productos no coinciden con el catálogo conocido de este proveedor: puede estar mal mapeada la columna de código.`
      );
    }

    await this.prisma.$transaction([
      this.prisma.importRowIssue.deleteMany({ where: { importId } }),
      this.prisma.importRowIssue.createMany({
        data: normalized.issues.slice(0, MAX_ISSUES_STORED).map((i) => ({ importId, row: i.row, column: i.column ?? null, message: i.message })),
      }),
      this.prisma.supplierListImport.update({
        where: { id: importId },
        data: {
          profileId: resolved.profile.id,
          rowsTotal: sheet.rowsTotal,
          rowsData: sheet.dataRows.length,
          summary: {
            created: diff.counts.created,
            priceChanged: diff.counts.priceChanged,
            unchanged: diff.counts.unchanged,
            missing: diff.counts.missing,
            withoutPrice: diff.counts.withoutPrice,
            issues: normalized.issues.length,
            normalized: normalized.items.length,
            profileMatch: resolved.match,
            matchedToCatalog: matched.matched,
            unmatchedToCatalog: matched.unmatched,
            knownCatalogSize: matched.knownCatalogSize,
          },
          diff: { counts: diff.counts, samples: diff.samples, missingIds: diff.missingIds } as unknown as Prisma.InputJsonValue,
          reviewReasons: reasons,
          preview: this.previewOf(analysis, sheetCount, sheet),
          normalizedRows: normalized.items as unknown as Prisma.InputJsonValue,
          status: reasons.length ? "NEEDS_REVIEW" : "PROCESSING",
          error: null,
        },
      }),
    ]);

    if (reasons.length) {
      await this.notifyReview(record, reasons);
      return;
    }
    await this.applyImport(importId, null);
  }

  private async analyzeStoredFile(record: SupplierListImport): Promise<{ analysis: StructureAnalysis; sheetCount: number }> {
    if (!record.storedAssetId) throw new Error("La carga no tiene archivo guardado");
    const asset = await this.prisma.storedAsset.findUnique({ where: { id: record.storedAssetId } });
    if (!asset) throw new Error("El archivo de la carga ya no existe");
    const sheets = readGrid(Buffer.from(asset.data), record.originalFileName);
    return { analysis: analyzeStructure(sheets), sheetCount: sheets.length };
  }

  private previewOf(analysis: StructureAnalysis, sheetCount: number, sheet: SheetAnalysis | null): Prisma.InputJsonValue {
    const preview: ImportPreview = {
      sheetCount,
      sheets: analysis.sheets.map((s) => ({ index: s.sheetIndex, name: s.sheetName, dataRows: s.dataRows.length, headerRow: s.headerRow })),
      sheetIndex: sheet?.sheetIndex ?? 0,
      headerRow: sheet?.headerRow ?? null,
      headers: sheet?.headers ?? [],
      rows: sheet ? sheet.dataRows.slice(0, PREVIEW_ROWS).map((r) => r.cells) : [],
      dividers: sheet?.dividers.slice(0, 20) ?? [],
    };
    return preview as unknown as Prisma.InputJsonValue;
  }

  /**
   * Perfil a usar: el activo si la huella coincide; el activo con revisión si
   * solo coinciden las columnas clave; si no, uno propuesto (reutilizando una
   * propuesta pendiente con la misma huella antes de volver a preguntarle a la IA).
   */
  private async resolveProfile(provider: string, analysis: StructureAnalysis) {
    const chosen = analysis.chosen!;
    const active = await this.prisma.importProfile.findFirst({
      where: { provider, status: "ACTIVE" },
      orderBy: { version: "desc" },
    });
    if (active) {
      const sheet = this.sheetForProfile(analysis, active.sheetIndex) ?? chosen;
      const fingerprint = fingerprintOf(analysis.sheets.length, sheet);
      if (active.fingerprint === fingerprint) {
        return { profile: active, spec: specOf(active), sheet, match: "EXACT" as const };
      }
      if (keyColumnsPresent(specOf(active), sheet.headers)) {
        return { profile: active, spec: specOf(active), sheet, match: "PARTIAL" as const };
      }
    }
    const pending = await this.prisma.importProfile.findFirst({
      where: { provider, status: "PROPOSED", fingerprint: analysis.fingerprint },
      orderBy: { version: "desc" },
    });
    if (pending) {
      return { profile: pending, spec: specOf(pending), sheet: chosen, match: "PROPOSED" as const };
    }
    const learned = await this.learner.learn(chosen);
    const created = await this.createProfileVersion(provider, learned.spec, chosen, analysis.sheets.length, {
      status: "PROPOSED",
      proposedByAi: learned.fromAi,
      aiReasoning: learned.reasoning,
      approvedByUserId: null,
    });
    return { profile: created, spec: learned.spec, sheet: chosen, match: "PROPOSED" as const };
  }

  private sheetForProfile(analysis: StructureAnalysis, sheetIndex: number): SheetAnalysis | null {
    const sheet = analysis.sheets.find((s) => s.sheetIndex === sheetIndex);
    return sheet && sheet.dataRows.length > 0 ? sheet : null;
  }

  private async createProfileVersion(
    provider: string,
    spec: ImportProfileSpec,
    sheet: SheetAnalysis,
    sheetCount: number,
    meta: { status: "PROPOSED" | "ACTIVE"; proposedByAi: boolean; aiReasoning: string | null; approvedByUserId: string | null }
  ): Promise<ImportProfile> {
    const last = await this.prisma.importProfile.findFirst({ where: { provider }, orderBy: { version: "desc" }, select: { version: true } });
    return this.prisma.importProfile.create({
      data: {
        provider,
        version: (last?.version ?? 0) + 1,
        status: meta.status,
        fingerprint: fingerprintOf(sheetCount, sheet),
        headers: sheet.normalizedHeaders,
        sheetIndex: spec.sheetIndex,
        sheetName: sheet.sheetName,
        headerRow: spec.headerRow,
        columnMap: spec.columnMap,
        currency: spec.currency,
        priceIncludesIva: spec.priceIncludesIva,
        ivaPercent: spec.ivaPercent,
        numberFormat: spec.numberFormat,
        dividerMeaning: spec.dividerMeaning,
        sampleRows: { headers: sheet.headers, rows: sheet.dataRows.slice(0, PREVIEW_ROWS).map((r) => r.cells) } as Prisma.InputJsonValue,
        proposedByAi: meta.proposedByAi,
        aiReasoning: meta.aiReasoning,
        approvedByUserId: meta.approvedByUserId,
      },
    });
  }

  private async previousOffers(provider: string, level: ListImportLevel, tenantId: string): Promise<PreviousOffer[]> {
    if (level === "BASE") {
      const rows = await this.prisma.supplierBaseOffer.findMany({
        where: { provider },
        select: { externalId: true, price: true, finalPrice: true },
      });
      const names = await this.namesFor(provider, rows.map((r) => r.externalId));
      return rows.map((r) => ({ externalId: r.externalId, name: names.get(r.externalId) ?? r.externalId, price: num(r.price), finalPrice: num(r.finalPrice) }));
    }
    const rows = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider, source: "OWN_LIST" },
      select: { externalId: true, price: true, finalPrice: true, product: { select: { name: true } } },
    });
    return rows.map((r) => ({ externalId: r.externalId, name: r.product.name, price: num(r.price), finalPrice: num(r.finalPrice) }));
  }

  private async namesFor(provider: string, externalIds: string[]): Promise<Map<string, string>> {
    if (externalIds.length === 0) return new Map();
    const fichas = await this.prisma.providerSyncCache.findMany({
      where: { provider, externalId: { in: externalIds } },
      select: { externalId: true, name: true },
    });
    return new Map(fichas.map((f) => [f.externalId, f.name]));
  }

  private async sanityThresholds(): Promise<Partial<SanityThresholds>> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: "platform" }, select: { importSanity: true } });
    const raw = settings?.importSanity;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Partial<SanityThresholds> = {};
    for (const key of ["maxMissingPercent", "maxPriceChangedPercent", "maxInvalidPricePercent", "minRowsRatio", "uniformChangeMinCount"] as const) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
  }

  // ---------- Aplicar / descartar / revertir ----------

  async applyImport(importId: string, actor: ImportActor | null) {
    const record = await this.prisma.supplierListImport.findUnique({ where: { id: importId } });
    if (!record) throw new NotFoundException("Carga no encontrada");
    if (actor) await this.assertSameAccess(actor, record);
    if (record.status !== "NEEDS_REVIEW" && record.status !== "PROCESSING") {
      throw new ConflictException(`La carga está en estado ${record.status} y no se puede aplicar`);
    }
    const items = (record.normalizedRows ?? []) as unknown as NormalizedProduct[];
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("La carga no tiene filas para aplicar");
    }
    const diff = record.diff as unknown as Pick<ImportDiff, "missingIds"> | null;
    const missingIds = diff?.missingIds ?? [];

    const snapshot = await this.snapshotFor(record);
    await this.prisma.supplierListImport.update({ where: { id: importId }, data: { snapshot, status: "PROCESSING" } });

    if (record.level === "BASE") {
      await this.applyBase(record, items, missingIds);
    } else {
      await this.applyTenant(record, items);
    }
    // Los productos nuevos heredan las marcas ya aprobadas (Sentey, LNZ…) sin pasar por revisión.
    const brands = await this.catalog
      .autoAssignKnownBrands(record.provider, items.map((i) => i.externalId))
      .catch((err) => {
        this.logger.warn(`Autoasignación de marcas en ${record.provider} falló: ${err instanceof Error ? err.message : String(err)}`);
        return { assigned: 0, byBrand: {} };
      });

    await this.prisma.$transaction([
      this.prisma.supplierListImport.update({
        where: { id: importId },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
          normalizedRows: Prisma.DbNull,
          error: null,
          summary: { ...((record.summary as Record<string, unknown> | null) ?? {}), brandsAutoAssigned: brands.assigned },
        },
      }),
      ...(record.profileId
        ? [
            this.prisma.importProfile.updateMany({
              where: { id: record.profileId, status: "PROPOSED" },
              data: { status: "ACTIVE", approvedByUserId: actor?.userId ?? null },
            }),
            this.prisma.importProfile.updateMany({
              where: { provider: record.provider, status: "ACTIVE", id: { not: record.profileId } },
              data: { status: "ARCHIVED" },
            }),
          ]
        : []),
    ]);
    this.logger.log(`Carga ${importId} aplicada (${record.level}, ${items.length} filas)`);
    return this.get(importId, actor);
  }

  /** Lista base: escribe fichas + ofertas del proveedor, la base, y la materializa en cada vinculado. */
  private async applyBase(record: SupplierListImport, items: NormalizedProduct[], missingIds: string[]) {
    const supplier = await this.prisma.tenant.findUniqueOrThrow({ where: { providerKey: record.provider }, select: { id: true } });
    await this.providers.applyListOffers({ tenantId: supplier.id, provider: record.provider, items, source: "BASE_LIST" });

    const CHUNK = 50;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((item) =>
          this.prisma.supplierBaseOffer.upsert({
            where: { provider_externalId: { provider: record.provider, externalId: item.externalId } },
            create: { provider: record.provider, externalId: item.externalId, ...offerOf(item) },
            update: { ...offerOf(item), syncedAt: new Date() },
          })
        )
      );
    }
    if (missingIds.length) {
      await this.prisma.supplierBaseOffer.deleteMany({ where: { provider: record.provider, externalId: { in: missingIds } } });
    }
    await this.materializeForLinked(record.provider, supplier.id);
  }

  /** Lista propia: ofertas OWN_LIST del comercio, y ficha visible (sin precio) para el resto. */
  private async applyTenant(record: SupplierListImport, items: NormalizedProduct[]) {
    await this.providers.applyListOffers({ tenantId: record.tenantId, provider: record.provider, items, source: "OWN_LIST" });
    const others = await this.linkedTenantIds(record.provider);
    for (const tenantId of others) {
      if (tenantId === record.tenantId) continue;
      await this.prisma.tenantProductOffer.createMany({
        data: items.map((item) => ({ tenantId, provider: record.provider, externalId: item.externalId, source: "BASE_LIST" as const, active: true })),
        skipDuplicates: true,
      });
    }
  }

  private async linkedTenantIds(provider: string): Promise<string[]> {
    const supplier = await this.prisma.tenant.findUnique({ where: { providerKey: provider }, select: { id: true } });
    if (!supplier) return [];
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: supplier.id, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, clientTenant: { active: true } },
      select: { clientTenantId: true },
    });
    return [supplier.id, ...links.map((l) => l.clientTenantId)];
  }

  async materializeForLinked(provider: string, supplierTenantId?: string) {
    const tenantIds = await this.linkedTenantIds(provider);
    for (const tenantId of tenantIds) {
      if (tenantId === supplierTenantId) continue;
      try {
        await this.providers.materializeBaseOffers(tenantId, provider);
      } catch (err) {
        this.logger.warn(`No se pudo materializar ${provider} en ${tenantId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async snapshotFor(record: SupplierListImport): Promise<Prisma.InputJsonValue> {
    if (record.level === "BASE") {
      const rows = await this.prisma.supplierBaseOffer.findMany({ where: { provider: record.provider } });
      return { level: "BASE", rows: rows.map(serializeOffer) } as Prisma.InputJsonValue;
    }
    const rows = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId: record.tenantId, provider: record.provider, source: "OWN_LIST" },
    });
    return { level: "TENANT", rows: rows.map(serializeOffer) } as Prisma.InputJsonValue;
  }

  async discard(importId: string, actor: ImportActor) {
    const record = await this.prisma.supplierListImport.findUnique({ where: { id: importId } });
    if (!record) throw new NotFoundException("Carga no encontrada");
    await this.assertSameAccess(actor, record);
    if (record.status !== "NEEDS_REVIEW" && record.status !== "FAILED") {
      throw new ConflictException(`La carga está en estado ${record.status} y no se puede descartar`);
    }
    await this.prisma.supplierListImport.update({
      where: { id: importId },
      data: { status: "DISCARDED", normalizedRows: Prisma.DbNull },
    });
    return this.get(importId, actor);
  }

  /** Deshace la última carga aplicada del nivel: restaura las ofertas del snapshot. */
  async revert(importId: string, actor: ImportActor) {
    const record = await this.prisma.supplierListImport.findUnique({ where: { id: importId } });
    if (!record) throw new NotFoundException("Carga no encontrada");
    await this.assertSameAccess(actor, record);
    if (record.status !== "APPLIED") throw new ConflictException("Solo se puede revertir una carga aplicada");
    const latest = await this.prisma.supplierListImport.findFirst({
      where: { provider: record.provider, level: record.level, status: "APPLIED", ...(record.level === "TENANT" ? { tenantId: record.tenantId } : {}) },
      orderBy: { appliedAt: "desc" },
      select: { id: true },
    });
    if (latest?.id !== record.id) throw new ConflictException("Solo se puede revertir la última carga aplicada");
    const snapshot = record.snapshot as { level: string; rows: SerializedOffer[] } | null;
    if (!snapshot || !Array.isArray(snapshot.rows)) throw new ConflictException("La carga no tiene snapshot para revertir");

    if (record.level === "BASE") {
      const keep = new Set(snapshot.rows.map((r) => r.externalId));
      await this.prisma.$transaction([
        this.prisma.supplierBaseOffer.deleteMany({ where: { provider: record.provider } }),
        this.prisma.supplierBaseOffer.createMany({
          data: snapshot.rows.map((r) => ({ provider: record.provider, externalId: r.externalId, ...offerFromSerialized(r) })),
        }),
        this.prisma.tenantProductOffer.deleteMany({
          where: { provider: record.provider, source: "BASE_LIST", externalId: { notIn: [...keep] } },
        }),
      ]);
      const supplier = await this.prisma.tenant.findUnique({ where: { providerKey: record.provider }, select: { id: true } });
      if (supplier) {
        await this.providers.materializeBaseOffers(supplier.id, record.provider);
        await this.materializeForLinked(record.provider, supplier.id);
      }
    } else {
      await this.prisma.$transaction([
        this.prisma.tenantProductOffer.deleteMany({ where: { tenantId: record.tenantId, provider: record.provider, source: "OWN_LIST" } }),
        this.prisma.tenantProductOffer.createMany({
          data: snapshot.rows.map((r) => ({
            tenantId: record.tenantId,
            provider: record.provider,
            externalId: r.externalId,
            source: "OWN_LIST" as const,
            active: true,
            ...offerFromSerialized(r),
          })),
          skipDuplicates: true,
        }),
      ]);
    }
    await this.prisma.supplierListImport.update({ where: { id: importId }, data: { status: "REVERTED", revertedAt: new Date() } });
    return this.get(importId, actor);
  }

  // ---------- Lecturas ----------

  async list(actor: ImportActor, provider: Provider) {
    const access = await this.resolveAccess(actor, provider);
    const rows = await this.prisma.supplierListImport.findMany({
      where: { provider, ...(access.level === "TENANT" ? { OR: [{ level: "BASE" }, { tenantId: access.tenantId }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { tenant: { select: { name: true } } },
    });
    return rows.map((r) => this.serialize(r));
  }

  async get(importId: string, actor: ImportActor | null) {
    const record = await this.prisma.supplierListImport.findUnique({
      where: { id: importId },
      include: { tenant: { select: { name: true } }, issues: { orderBy: { row: "asc" }, take: 500 } },
    });
    if (!record) throw new NotFoundException("Carga no encontrada");
    if (actor) await this.assertSameAccess(actor, record);
    return { ...this.serialize(record), diff: record.diff, reviewReasons: record.reviewReasons, preview: record.preview, issues: record.issues };
  }

  private async assertSameAccess(actor: ImportActor, record: SupplierListImport) {
    const access = await this.resolveAccess(actor, record.provider);
    if (access.level === "BASE") return;
    if (record.level === "TENANT" && record.tenantId === access.tenantId) return;
    throw new ForbiddenException("Esta carga no es de tu organización");
  }

  private serialize(record: SupplierListImport & { tenant?: { name: string } }) {
    return {
      id: record.id,
      provider: record.provider,
      level: record.level,
      status: record.status,
      tenantId: record.tenantId,
      tenantName: record.tenant?.name ?? null,
      uploadedByUserId: record.uploadedByUserId,
      originalFileName: record.originalFileName,
      profileId: record.profileId,
      rowsTotal: record.rowsTotal,
      rowsData: record.rowsData,
      summary: record.summary,
      error: record.error,
      createdAt: record.createdAt,
      appliedAt: record.appliedAt,
      revertedAt: record.revertedAt,
    };
  }

  // ---------- Perfil ----------

  async getProfile(actor: ImportActor, provider: Provider) {
    await this.resolveAccess(actor, provider);
    const [active, proposed, latestImport] = await Promise.all([
      this.prisma.importProfile.findFirst({ where: { provider, status: "ACTIVE" }, orderBy: { version: "desc" } }),
      this.prisma.importProfile.findFirst({ where: { provider, status: "PROPOSED" }, orderBy: { version: "desc" } }),
      this.prisma.supplierListImport.findFirst({
        where: { provider, preview: { not: Prisma.DbNull } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, preview: true, originalFileName: true, createdAt: true },
      }),
    ]);
    return {
      fields: NORMALIZED_FIELDS,
      active: active ? serializeProfile(active) : null,
      proposed: proposed ? serializeProfile(proposed) : null,
      latestImport,
    };
  }

  /**
   * Vuelve a procesar la última planilla subida como una carga nueva, con el
   * perfil vigente. Sirve después de corregir el perfil sin tener que volver a
   * subir el archivo: la carga original queda como está en el historial.
   */
  async reprocessLatest(actor: ImportActor, provider: Provider) {
    const access = await this.resolveAccess(actor, provider);
    const latest = await this.prisma.supplierListImport.findFirst({
      where: {
        provider,
        storedAssetId: { not: null },
        ...(access.level === "TENANT" ? { level: "TENANT", tenantId: access.tenantId } : { level: "BASE" }),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) throw new BadRequestException("No hay ninguna planilla subida para reprocesar");
    const record = await this.prisma.supplierListImport.create({
      data: {
        provider,
        tenantId: access.tenantId,
        uploadedByUserId: actor.userId,
        level: access.level,
        originalFileName: latest.originalFileName,
        storedAssetId: latest.storedAssetId,
        status: "PROCESSING",
      },
    });
    this.kick(record.id);
    return this.serialize(record);
  }

  /** Guarda una versión nueva del perfil como activa y, si se pide, reprocesa una carga en revisión. */
  async saveProfile(actor: ImportActor, provider: Provider, dto: SaveImportProfileDto) {
    await this.resolveAccess(actor, provider);
    const latest = await this.prisma.supplierListImport.findFirst({
      where: { provider, storedAssetId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) throw new BadRequestException("Subí una planilla primero: el perfil se define sobre un archivo real");
    const { analysis, sheetCount } = await this.analyzeStoredFile(latest);
    const sheetIndex = dto.sheetIndex ?? analysis.chosen?.sheetIndex ?? 0;
    const sheet = analysis.sheets.find((s) => s.sheetIndex === sheetIndex) ?? analysis.chosen;
    if (!sheet || sheet.headerRow === null) throw new BadRequestException("No se encontró una tabla de productos en esa hoja");

    const spec = this.specFromDto(dto, sheet);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.importProfile.updateMany({ where: { provider, status: { in: ["ACTIVE", "PROPOSED"] } }, data: { status: "ARCHIVED" } });
      const last = await tx.importProfile.findFirst({ where: { provider }, orderBy: { version: "desc" }, select: { version: true } });
      return tx.importProfile.create({
        data: {
          provider,
          version: (last?.version ?? 0) + 1,
          status: "ACTIVE",
          fingerprint: fingerprintOf(sheetCount, sheet),
          headers: sheet.normalizedHeaders,
          sheetIndex: sheet.sheetIndex,
          sheetName: sheet.sheetName,
          headerRow: sheet.headerRow ?? 0,
          columnMap: spec.columnMap,
          currency: spec.currency,
          priceIncludesIva: spec.priceIncludesIva,
          ivaPercent: spec.ivaPercent,
          numberFormat: spec.numberFormat,
          dividerMeaning: spec.dividerMeaning,
          sampleRows: { headers: sheet.headers, rows: sheet.dataRows.slice(0, PREVIEW_ROWS).map((r) => r.cells) } as Prisma.InputJsonValue,
          proposedByAi: false,
          approvedByUserId: actor.userId,
        },
      });
    });

    if (dto.reprocessImportId) {
      const target = await this.prisma.supplierListImport.findUnique({ where: { id: dto.reprocessImportId } });
      if (target && target.provider === provider && (target.status === "NEEDS_REVIEW" || target.status === "FAILED")) {
        await this.prisma.supplierListImport.update({ where: { id: target.id }, data: { status: "PROCESSING", error: null } });
        this.kick(target.id);
      }
    }
    return serializeProfile(created);
  }

  private specFromDto(dto: SaveImportProfileDto, sheet: SheetAnalysis): ImportProfileSpec {
    const valid = new Set<string>(NORMALIZED_FIELDS);
    const columnMap: Record<string, NormalizedField | null> = {};
    const used = new Set<string>();
    for (const header of sheet.headers) {
      const field = dto.columnMap[header];
      if (typeof field === "string" && valid.has(field) && !used.has(field)) {
        columnMap[header] = field as NormalizedField;
        used.add(field);
      } else {
        columnMap[header] = null;
      }
    }
    if (!used.has("name")) throw new BadRequestException("Hay que indicar qué columna es el nombre del producto");
    if (!used.has("price") && !used.has("finalPrice")) throw new BadRequestException("Hay que indicar qué columna es el precio");
    return {
      sheetIndex: sheet.sheetIndex,
      headerRow: sheet.headerRow ?? 0,
      columnMap,
      currency: dto.currency ? dto.currency.toUpperCase() : null,
      priceIncludesIva: dto.priceIncludesIva ?? false,
      ivaPercent: dto.ivaPercent ?? null,
      numberFormat: dto.numberFormat ?? "COMMA",
      dividerMeaning: dto.dividerMeaning ?? "IGNORE",
    };
  }

  /** Pide a la IA (o a la heurística) una propuesta sobre la última planilla, sin guardarla. */
  async suggestProfile(actor: ImportActor, provider: Provider, sheetIndex?: number) {
    await this.resolveAccess(actor, provider);
    const latest = await this.prisma.supplierListImport.findFirst({
      where: { provider, storedAssetId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) throw new BadRequestException("Subí una planilla primero");
    const { analysis } = await this.analyzeStoredFile(latest);
    const sheet = (sheetIndex !== undefined ? analysis.sheets.find((s) => s.sheetIndex === sheetIndex) : null) ?? analysis.chosen;
    if (!sheet || sheet.headerRow === null) throw new BadRequestException("No se encontró una tabla de productos");
    const learned = await this.learner.learn(sheet);
    return { spec: learned.spec, fromAi: learned.fromAi, reasoning: learned.reasoning, headers: sheet.headers };
  }

  // ---------- Frescura ----------

  async freshness(actor: ImportActor, provider: Provider) {
    const access = await this.resolveAccess(actor, provider);
    return this.freshnessFor(provider, access.level === "TENANT" ? access.tenantId : null);
  }

  async freshnessFor(provider: string, tenantId: string | null) {
    const supplier = await this.prisma.tenant.findUnique({ where: { providerKey: provider }, select: { listUpdateDays: true } });
    const last = await this.prisma.supplierListImport.findFirst({
      where: {
        provider,
        status: "APPLIED",
        OR: [{ level: "BASE" }, ...(tenantId ? [{ level: "TENANT" as const, tenantId }] : [])],
      },
      orderBy: { appliedAt: "desc" },
      select: { appliedAt: true, level: true },
    });
    const days = supplier?.listUpdateDays ?? null;
    const lastAt = last?.appliedAt ?? null;
    const expectedAt = lastAt && days ? new Date(lastAt.getTime() + days * 86_400_000) : null;
    let status: "NONE" | "NO_CADENCE" | "OK" | "DUE_SOON" | "OVERDUE" = "OK";
    if (!lastAt) status = "NONE";
    else if (!expectedAt) status = "NO_CADENCE";
    else {
      const remainingDays = (expectedAt.getTime() - Date.now()) / 86_400_000;
      status = remainingDays < 0 ? "OVERDUE" : remainingDays <= FRESHNESS_WARNING_DAYS ? "DUE_SOON" : "OK";
    }
    return { provider, listUpdateDays: days, lastImportAt: lastAt, lastImportLevel: last?.level ?? null, expectedAt, status };
  }

  // ---------- Mantenimiento ----------

  /** Cargas que quedaron PROCESSING más de lo razonable (el proceso murió): FAILED. */
  async failStuckImports() {
    const res = await this.prisma.supplierListImport.updateMany({
      where: { status: "PROCESSING", createdAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      data: { status: "FAILED", error: "El procesamiento se interrumpió. Volvé a subir el archivo." },
    });
    return res.count;
  }

  private async notifyReview(record: SupplierListImport, reasons: string[]) {
    const supplier = await this.prisma.tenant.findUnique({ where: { providerKey: record.provider }, select: { id: true, name: true } });
    const toTenantIds = [...new Set([record.tenantId, supplier?.id].filter((x): x is string => Boolean(x)))];
    await this.prisma.orgNotification.createMany({
      data: toTenantIds.map((toTenantId) => ({
        toTenantId,
        fromTenantId: null,
        kind: "SYSTEM" as const,
        title: `Lista de ${supplier?.name ?? record.provider} en revisión`,
        body: `${record.originalFileName}: ${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1})` : ""}`,
        landingKey: `list-import:${record.id}`,
      })),
    });
  }
}

// ---------- helpers ----------

type SerializedOffer = {
  externalId: string;
  price: number | null;
  finalPrice: number | null;
  currency: string | null;
  ivaPercent: number | null;
  stock: number | null;
  stockStatus: string | null;
};

function serializeOffer(row: {
  externalId: string;
  price: Prisma.Decimal | null;
  finalPrice: Prisma.Decimal | null;
  currency: string | null;
  ivaPercent: Prisma.Decimal | null;
  stock: number | null;
  stockStatus: string | null;
}): SerializedOffer {
  return {
    externalId: row.externalId,
    price: num(row.price),
    finalPrice: num(row.finalPrice),
    currency: row.currency,
    ivaPercent: num(row.ivaPercent),
    stock: row.stock,
    stockStatus: row.stockStatus,
  };
}

function offerFromSerialized(r: SerializedOffer) {
  return { price: r.price, finalPrice: r.finalPrice, currency: r.currency, ivaPercent: r.ivaPercent, stock: r.stock, stockStatus: r.stockStatus };
}

function offerOf(item: NormalizedProduct) {
  return {
    price: item.price ?? null,
    finalPrice: item.finalPrice ?? null,
    currency: item.currency ?? null,
    ivaPercent: item.ivaPercent ?? null,
    stock: item.stock ?? null,
    stockStatus: item.stockStatus ?? null,
  };
}

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function specOf(profile: ImportProfile): ImportProfileSpec {
  return {
    sheetIndex: profile.sheetIndex,
    headerRow: profile.headerRow,
    columnMap: (profile.columnMap ?? {}) as Record<string, NormalizedField | null>,
    currency: profile.currency,
    priceIncludesIva: profile.priceIncludesIva,
    ivaPercent: num(profile.ivaPercent),
    numberFormat: profile.numberFormat,
    dividerMeaning: profile.dividerMeaning,
  };
}

/** Coincidencia parcial: las columnas mapeadas a nombre y precio siguen estando. */
export function keyColumnsPresent(spec: ImportProfileSpec, headers: string[]): boolean {
  const present = new Set(headers);
  const keyHeaders = Object.entries(spec.columnMap)
    .filter(([, field]) => field === "name" || field === "price" || field === "finalPrice" || field === "externalId")
    .map(([header]) => header);
  return keyHeaders.length > 0 && keyHeaders.every((h) => present.has(h));
}

function serializeProfile(profile: ImportProfile) {
  return {
    id: profile.id,
    provider: profile.provider,
    version: profile.version,
    status: profile.status,
    fingerprint: profile.fingerprint,
    sheetIndex: profile.sheetIndex,
    sheetName: profile.sheetName,
    headerRow: profile.headerRow,
    columnMap: profile.columnMap,
    currency: profile.currency,
    priceIncludesIva: profile.priceIncludesIva,
    ivaPercent: num(profile.ivaPercent),
    numberFormat: profile.numberFormat,
    dividerMeaning: profile.dividerMeaning,
    sampleRows: profile.sampleRows,
    proposedByAi: profile.proposedByAi,
    aiReasoning: profile.aiReasoning,
    createdAt: profile.createdAt,
  };
}

export type { RowIssue };
