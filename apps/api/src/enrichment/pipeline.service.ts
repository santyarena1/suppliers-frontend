import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CatalogAiService } from "../catalog/catalog-ai.service";
import { AttributeValue, mergeAttributes, mapSpecsToSchema } from "./attributes";
import {
  buildDescriptionPrompt,
  buildExtractionPrompt,
  descriptionIsGrounded,
  DESCRIPTION_SYSTEM,
  estimateCostUsd,
  EXTRACT_SYSTEM,
  formatAttributeForPrompt,
  JsonAi,
  validateExtraction,
  VERIFIED_ATTRIBUTE_CONFIDENCE,
} from "./ai-extract";
import { ImageCandidate, MIN_IMAGE_SIDE, PrefixFetcher, verifyImages, VerifiedImage } from "./image-verify";
import { httpGetPrefix } from "./sources/http";
import { modelTokens, pnKey } from "./keys";
import { buildProposals, ProposalDraft } from "./proposal-builder";
import { CategorySchema, schemaFor } from "./schemas";
import { SourceCacheService } from "./source-cache.service";
import { distributorAttributes, distributorImages, distributorTexts, DistributorFicha } from "./sources/distributor";
import { lookupIcecat } from "./sources/icecat";
import { connectorFor } from "./sources/manufacturers";
import { LookupQuery, SourceResult } from "./sources/types";
import { detectCategory } from "./taxonomy";

/** Si Icecat ya cubre esta parte de los atributos de la categoría, no se gasta IA en extraer. */
const AI_EXTRACT_COVERAGE_THRESHOLD = 0.6;
/** Mínimo de atributos verificados para pedirle a la IA que redacte. */
const MIN_ATTRS_FOR_AI_TEXT = 3;
/** Confianza debajo de la cual un maestro queda "para revisar". */
export const REVIEW_CONFIDENCE = 0.6;

export type SourceStatus = "found" | "unverified" | "not_found" | "error" | "disabled" | "no_connector";

export interface PipelineBudget {
  /** Si devuelve false, no se hacen más llamadas a la IA (tope de costo de la corrida). */
  canSpend(): boolean;
  onAiCall(costUsd: number): void;
}

export interface PipelineOutcome {
  masterId: string;
  proposals: number;
  aiCalls: number;
  costUsd: number;
  sources: Record<string, SourceStatus>;
  notes: string[];
}

const UNLIMITED: PipelineBudget = { canSpend: () => true, onAiCall: () => undefined };

/**
 * Enriquecimiento de un producto maestro: junta Icecat, la web del fabricante,
 * las fichas de los distribuidores y la IA, y deja propuestas. No escribe en
 * ninguna ficha (`ProviderSyncCache` solo se lee).
 */
@Injectable()
export class EnrichmentPipelineService {
  private readonly logger = new Logger(EnrichmentPipelineService.name);
  /** Reemplazable en verificaciones locales sin key (IA simulada). */
  aiOverride: JsonAi | null = null;
  /** Descarga parcial de fotos (reemplazable en tests). */
  imagePrefixFetcher: PrefixFetcher = httpGetPrefix;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SourceCacheService,
    private readonly catalogAi: CatalogAiService,
    private readonly config: ConfigService
  ) {}

  private async aiClient(): Promise<JsonAi | null> {
    if (this.aiOverride) return this.aiOverride;
    return (await this.catalogAi.isConfigured()) ? this.catalogAi : null;
  }

  async loadFichas(members: { provider: string; externalId: string }[]): Promise<DistributorFicha[]> {
    if (members.length === 0) return [];
    const rows = await this.prisma.providerSyncCache.findMany({
      where: { OR: members.map((m) => ({ provider: m.provider, externalId: m.externalId })) },
      select: {
        id: true, provider: true, externalId: true, name: true, brand: true, category: true, subcategory: true,
        partNumber: true, ean: true, description: true, longDescription: true, imageUrl: true, productUrl: true,
        warranty: true, weight: true, weightUnit: true, raw: true,
      },
    });
    const aiFills = await this.prisma.imageSyncFill.findMany({
      where: { productId: { in: rows.map((r) => r.id) }, status: "filled", source: { startsWith: "serper" } },
      select: { productId: true, imageUrl: true },
    });
    const aiImages = new Map(aiFills.map((f) => [f.productId, f.imageUrl]));
    return rows.map((r) => ({
      ...r,
      weight: r.weight === null ? null : Number(r.weight),
      aiImage: aiImages.has(r.id) && (aiImages.get(r.id) === null || aiImages.get(r.id) === r.imageUrl),
    }));
  }

  async enrichMaster(masterId: string, opts: { runId?: string; budget?: PipelineBudget } = {}): Promise<PipelineOutcome> {
    const budget = opts.budget ?? UNLIMITED;
    const master = await this.prisma.catalogMaster.findUniqueOrThrow({ where: { id: masterId }, include: { members: true } });
    await this.prisma.catalogMaster.update({ where: { id: masterId }, data: { status: "ENRICHING" } });
    const outcome: PipelineOutcome = { masterId, proposals: 0, aiCalls: 0, costUsd: 0, sources: {}, notes: [] };
    try {
      const fichas = await this.loadFichas(master.members);
      const query = this.buildQuery(master, fichas);

      const icecat = await this.fetchIcecat(query, outcome);
      // El título de Icecat suele traer el código de modelo exacto ("Dual -RTX5060TI-O8G").
      const withIcecatHints = icecat?.verified ? { ...query, hints: uniq([...(icecat.modelCode ? [icecat.modelCode] : []), ...query.hints, ...modelTokens(icecat.title)]) } : query;
      const manufacturer = await this.fetchManufacturer(withIcecatHints, outcome);

      const detected = this.resolveCategory(master.categoryKey, master.categoryRaw, master.name, icecat);
      const schema = schemaFor(detected.key);
      const images = await this.collectImages(icecat, manufacturer, fichas);
      const ai = await this.aiClient();
      if (!ai) outcome.sources.ai = "disabled";

      const attributes = await this.collectAttributes({ schema, master, icecat, manufacturer, fichas, ai, budget, outcome });
      const aiText = await this.writeDescriptions({ master, icecat, manufacturer, schema, attributes, ai, budget, outcome });

      const drafts = buildProposals({
        categoryKey: detected.key,
        categoryVia: detected.via,
        schema,
        icecat,
        manufacturer,
        images,
        attributes,
        aiText,
      });
      outcome.proposals = await this.saveProposals(masterId, drafts, opts.runId);
      const best = drafts.reduce((m, d) => Math.max(m, d.confidence), 0);
      const minCore = drafts.filter((d) => d.field !== "category").reduce((m, d) => Math.min(m, d.confidence), 1);
      await this.prisma.catalogMaster.update({
        where: { id: masterId },
        data: {
          status: drafts.length === 0 ? "FAILED" : master.doubtful || minCore < REVIEW_CONFIDENCE ? "REVIEW" : "ENRICHED",
          bestConfidence: drafts.length ? best : null,
          enrichedAt: new Date(),
          ...(master.categoryKey ? {} : { categoryKey: detected.key }),
        },
      });
      if (drafts.length === 0) outcome.notes.push("ninguna fuente aportó datos");
      return outcome;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`enrich ${masterId}: ${message}`);
      await this.prisma.catalogMaster.update({ where: { id: masterId }, data: { status: "FAILED" } });
      throw err;
    }
  }

  buildQuery(
    master: { brand: string | null; brandKey: string | null; partNumber: string | null; ean: string | null; name: string },
    fichas: DistributorFicha[]
  ): LookupQuery {
    const rawPn = fichas.map((f) => f.partNumber).find((p) => p && master.partNumber && pnKey(p) === master.partNumber) ?? master.partNumber;
    return {
      brand: master.brand,
      brandKey: master.brandKey,
      partNumber: rawPn ?? null,
      pnKey: master.partNumber,
      gtin: master.ean,
      name: master.name,
      hints: uniq(fichas.flatMap((f) => modelTokens(f.name))).slice(0, 6),
    };
  }

  private async fetchIcecat(q: LookupQuery, outcome: PipelineOutcome): Promise<SourceResult | null> {
    const username = this.config.get<string>("ICECAT_USERNAME");
    if (!username) {
      outcome.sources.icecat = "disabled";
      return null;
    }
    if (!q.gtin && !(q.brand && q.partNumber)) {
      outcome.sources.icecat = "not_found";
      return null;
    }
    try {
      const res = await lookupIcecat(q, username, this.cache.fetcher);
      outcome.sources.icecat = !res ? "not_found" : res.verified ? "found" : "unverified";
      if (res && !res.verified) outcome.notes.push(`Icecat descartado: ${res.matchNote}`);
      return res;
    } catch (err) {
      outcome.sources.icecat = "error";
      outcome.notes.push(`Icecat: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async fetchManufacturer(q: LookupQuery, outcome: PipelineOutcome): Promise<SourceResult | null> {
    const connector = connectorFor(q.brandKey);
    if (!connector) {
      outcome.sources.manufacturer = "no_connector";
      return null;
    }
    try {
      const res = await connector.lookup(q, this.cache.fetcher);
      outcome.sources[`manufacturer:${connector.source}`] = res ? (res.verified ? "found" : "unverified") : "not_found";
      return res;
    } catch (err) {
      outcome.sources[`manufacturer:${connector.source}`] = "error";
      outcome.notes.push(`${connector.source}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  resolveCategory(
    current: string | null,
    raw: string | null,
    name: string,
    icecat: SourceResult | null
  ): { key: string | null; via: "category" | "name" | "icecat" | null } {
    const fromIcecat = icecat?.verified && icecat.category ? detectCategory(icecat.category, null) : null;
    if (current) return { key: current, via: fromIcecat?.key === current ? "icecat" : "category" };
    const local = detectCategory(raw, name);
    if (fromIcecat && (!local || local.key === fromIcecat.key)) return { key: fromIcecat.key, via: "icecat" };
    return local ? { key: local.key, via: local.via } : { key: fromIcecat?.key ?? null, via: fromIcecat ? "icecat" : null };
  }

  private async collectImages(icecat: SourceResult | null, manufacturer: SourceResult | null, fichas: DistributorFicha[]): Promise<VerifiedImage[]> {
    const toVerify: ImageCandidate[] = [];
    if (manufacturer?.verified) {
      toVerify.push(...manufacturer.images.map((i) => ({ url: i.url, source: "manufacturer", origin: manufacturer.source })));
    }
    // Icecat informa las medidas de cada foto: no hace falta bajarlas.
    const icecatImages: VerifiedImage[] = icecat?.verified
      ? icecat.images.map((i) => {
          const big = (i.width ?? 0) >= MIN_IMAGE_SIDE && (i.height ?? 0) >= MIN_IMAGE_SIDE;
          return { url: i.url, source: "icecat", origin: "icecat", width: i.width, height: i.height, ok: big, reason: big ? undefined : "chica según Icecat" };
        })
      : [];
    toVerify.push(...distributorImages(fichas).map((i) => ({ url: i.url, source: "distributor", origin: i.provider })));
    const verified = await verifyImages(toVerify, this.imagePrefixFetcher);
    return [...verified.filter((v) => v.source === "manufacturer"), ...icecatImages, ...verified.filter((v) => v.source !== "manufacturer")];
  }

  private async collectAttributes(ctx: {
    schema: CategorySchema;
    master: { name: string; brand: string | null };
    icecat: SourceResult | null;
    manufacturer: SourceResult | null;
    fichas: DistributorFicha[];
    ai: JsonAi | null;
    budget: PipelineBudget;
    outcome: PipelineOutcome;
  }): Promise<Record<string, AttributeValue>> {
    const { schema, master, icecat, manufacturer, fichas } = ctx;
    const icecatAttrs = icecat?.verified ? mapSpecsToSchema(schema, icecat.specs, "icecat", 0.9, "Open Icecat") : {};
    const brandAttr: Record<string, AttributeValue> = master.brand
      ? { brand: { value: master.brand, source: "distributor", confidence: 0.8, evidence: "marca canónica del catálogo" } }
      : {};
    const distAttrs = distributorAttributes(schema, fichas);

    let aiAttrs: Record<string, AttributeValue> = {};
    const coverage = Object.keys(icecatAttrs).length / Math.max(1, schema.attributes.length);
    if (ctx.ai && coverage < AI_EXTRACT_COVERAGE_THRESHOLD && ctx.budget.canSpend()) {
      const texts = [
        ...distributorTexts(fichas).map((t) => ({ origin: t.provider, text: t.text })),
        ...(manufacturer?.verified && manufacturer.description ? [{ origin: manufacturer.source, text: manufacturer.description }] : []),
      ];
      const prompt = buildExtractionPrompt(schema, master.name, texts);
      try {
        const response = await ctx.ai.chatJson<unknown>(prompt, EXTRACT_SYSTEM);
        this.chargeAi(ctx, prompt, response);
        aiAttrs = validateExtraction(schema, response, texts.map((t) => t.text).join("\n"));
      } catch (err) {
        ctx.outcome.notes.push(`IA (atributos): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return mergeAttributes(icecatAttrs, brandAttr, distAttrs, aiAttrs);
  }

  private async writeDescriptions(ctx: {
    master: { name: string; brand: string | null };
    icecat: SourceResult | null;
    manufacturer: SourceResult | null;
    schema: CategorySchema;
    attributes: Record<string, AttributeValue>;
    ai: JsonAi | null;
    budget: PipelineBudget;
    outcome: PipelineOutcome;
  }): Promise<{ description: string | null; longDescription: string | null; note?: string } | null> {
    const hasOfficialText = !!(ctx.icecat?.verified && ctx.icecat.description) || !!(ctx.manufacturer?.verified && ctx.manufacturer.description);
    if (hasOfficialText || !ctx.ai || !ctx.budget.canSpend()) return null;
    const verified = ctx.schema.attributes
      .map((def) => ({ def, v: ctx.attributes[def.key] }))
      .filter(({ v }) => v && v.confidence >= VERIFIED_ATTRIBUTE_CONFIDENCE)
      .map(({ def, v }) => formatAttributeForPrompt(def.label, v));
    if (verified.length < MIN_ATTRS_FOR_AI_TEXT) {
      ctx.outcome.notes.push(`sin descripción IA: solo ${verified.length} atributos verificados`);
      return null;
    }
    const prompt = buildDescriptionPrompt(ctx.master.name, ctx.master.brand, verified);
    try {
      const res = await ctx.ai.chatJson<{ description?: string; longDescription?: string }>(prompt, DESCRIPTION_SYSTEM);
      this.chargeAi(ctx, prompt, res);
      const values = verified.map((a) => a.value);
      const out = { description: null as string | null, longDescription: null as string | null, note: `redactada con ${verified.length} atributos verificados` };
      for (const field of ["description", "longDescription"] as const) {
        const text = typeof res?.[field] === "string" ? res[field]!.trim() : "";
        const check = descriptionIsGrounded(text, ctx.master.name, values);
        if (check.ok) out[field] = text;
        else ctx.outcome.notes.push(`IA (${field}) descartada: ${check.reason}`);
      }
      return out;
    } catch (err) {
      ctx.outcome.notes.push(`IA (descripción): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private chargeAi(ctx: { budget: PipelineBudget; outcome: PipelineOutcome }, prompt: string, response: unknown): void {
    const cost = estimateCostUsd(prompt.length + 300, JSON.stringify(response ?? "").length);
    ctx.outcome.aiCalls++;
    ctx.outcome.costUsd += cost;
    ctx.budget.onAiCall(cost);
  }

  /**
   * Guarda o reemplaza la propuesta de cada campo. Una propuesta ya aprobada,
   * rechazada o aplicada no se pisa: la decisión del superadmin manda.
   */
  private async saveProposals(masterId: string, drafts: ProposalDraft[], runId?: string): Promise<number> {
    const existing = await this.prisma.enrichmentProposal.findMany({ where: { masterId }, select: { field: true, status: true } });
    const decided = new Set(existing.filter((e) => e.status !== "PENDING").map((e) => e.field));
    let saved = 0;
    for (const d of drafts) {
      if (decided.has(d.field)) continue;
      const data = {
        value: d.value as Prisma.InputJsonValue,
        source: d.source,
        confidence: d.confidence,
        evidence: d.evidence as Prisma.InputJsonValue,
        runId: runId ?? null,
        status: "PENDING" as const,
      };
      await this.prisma.enrichmentProposal.upsert({
        where: { masterId_field: { masterId, field: d.field } },
        create: { masterId, field: d.field, ...data },
        update: data,
      });
      saved++;
    }
    return saved;
  }
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = s.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
