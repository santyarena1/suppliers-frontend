import { ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KNOWN_PROVIDERS } from "@nodo/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { type AcuStockProduct, AcuStockClient } from "./acustock.client";
import { type CatalogRow, type ContentLink, matchContent } from "./content-match";
import { contentToText } from "./content-text";
import { encryptImageUrl, imageKey } from "./image-token";
import { PC_STEPS, PC_STEP_CATEGORIES, pcCompatWithEstimates, type PcStep } from "./pc-specs";

export const ACUSTOCK_SOURCE = "ACUSTOCK";
type Mode = "PREVIEW" | "APPLY";

const CONTENT_CHUNK = 100;
const LINK_CHUNK = 1000;
const CATALOG_PAGE = 20_000;
/** Hay varias réplicas: una corrida sin latido en este tiempo se da por muerta. */
const STALE_MS = 3 * 60_000;
/**
 * Fichas completas distintas que ve un usuario por día. Un comercio que cotiza no
 * llega; un script que recorre el catálogo sí, y desde ahí ve la ficha del distribuidor.
 */
export const DAILY_VIEW_LIMIT = 300;
/** Veces por día que un usuario puede usar "Copiar ficha". */
export const DAILY_COPY_LIMIT = 100;
/** Tope de "el mismo producto en otros distribuidores" por ficha. */
const MAX_SIBLINGS = 12;
/** Las fichas de un paso del armador cambian solo con una importación: se guardan un rato en memoria. */
const PC_PARTS_TTL_MS = 10 * 60_000;

type SpecRow = { group: string | null; name: string; value: string; estimated?: boolean };
/** Lo que ve el comercio en la ficha: solo lo confirmado (lo estimado por IA queda para el armador). */
export function confirmedSpecs(specs: unknown): PlatformContentView["specs"] {
  if (!Array.isArray(specs)) return [];
  return (specs as SpecRow[]).filter((s) => !s.estimated).map(({ group, name, value }) => ({ group, name, value }));
}

/** Día en Argentina (YYYY-MM-DD): el tope se reinicia a la medianoche local. */
export function argentinaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
}

/** Una ficha de un paso del armador, con sus vínculos a distribuidores. */
export interface PcPartContent {
  contentId: string;
  name: string;
  brand: string | null;
  image: string | null;
  compat: ReturnType<typeof pcCompatWithEstimates>["compat"];
  /** Datos de `compat` que completó la IA sin revisar. */
  estimated: string[];
  links: { provider: string; externalId: string }[];
}

/** Lo que la ficha muestra del contenido de plataforma. */
export interface PlatformContentView {
  source: string;
  images: { url: string; alt: string | null }[];
  shortDescription: string | null;
  descriptionHtml: string | null;
  specs: { group: string | null; name: string; value: string }[];
  warrantyMonths: number | null;
}

@Injectable()
export class PlatformContentService implements OnModuleInit {
  private readonly logger = new Logger(PlatformContentService.name);
  private running = false;
  private readonly pcPartsCache = new Map<PcStep, { at: number; rows: Promise<PcPartContent[]> }>();

  private readonly imgKey: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly acustock: AcuStockClient,
    config: ConfigService
  ) {
    const secret = config.get<string>("CONTENT_IMAGE_KEY");
    this.imgKey = secret ? imageKey(secret) : null;
  }

  /**
   * Fotos con la dirección cifrada para el /img-proxy de la web. Sin clave configurada
   * no se mandan: antes que mostrar de dónde salen, la ficha usa la foto del distribuidor.
   */
  private protectImages(images: unknown): PlatformContentView["images"] {
    if (!this.imgKey || !Array.isArray(images)) return [];
    return (images as { url: string; alt: string | null }[]).map((i) => ({
      url: `/img-proxy?t=${encryptImageUrl(i.url, this.imgKey!)}`,
      alt: i.alt,
    }));
  }

  async onModuleInit() {
    await this.prisma.platformContentImportRun.updateMany({
      where: { status: "RUNNING", heartbeatAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: "Interrumpida por reinicio del servidor" },
    });
  }

  /**
   * Contenido de una ficha para un usuario. Nunca sale por la API de catálogo
   * (catalog-api arma sus respuestas aparte): solo la ficha dentro de la app.
   * Pasado el tope diario devuelve `limited` y la ficha se ve como la del distribuidor.
   */
  async forProduct(
    provider: string,
    externalId: string,
    userId: string | undefined
  ): Promise<{ content: PlatformContentView | null; limited: boolean }> {
    const link = await this.prisma.platformProductContentLink.findUnique({
      where: { provider_externalId: { provider, externalId } },
      include: { content: true },
    });
    if (!link || !userId) return { content: null, limited: false };
    if (!(await this.registerView(userId, provider, externalId))) return { content: null, limited: true };
    const c = link.content;
    return {
      content: {
        source: c.source,
        images: this.protectImages(c.images),
        shortDescription: c.shortDescription,
        descriptionHtml: c.descriptionHtml,
        specs: confirmedSpecs(c.specs),
        warrantyMonths: c.warrantyMonths,
      },
      limited: false,
    };
  }

  /** Las otras fichas de distribuidor vinculadas al mismo contenido (el mismo producto). */
  async siblings(provider: string, externalId: string): Promise<{ provider: string; externalId: string }[]> {
    const link = await this.prisma.platformProductContentLink.findUnique({
      where: { provider_externalId: { provider, externalId } },
      select: { contentId: true },
    });
    if (!link) return [];
    return this.prisma.platformProductContentLink.findMany({
      where: { contentId: link.contentId, NOT: { provider, externalId } },
      select: { provider: true, externalId: true },
      orderBy: { provider: "asc" },
      take: MAX_SIBLINGS,
    });
  }

  /**
   * Fichas de un paso del armador de PC con sus vínculos a distribuidores. Va solo
   * lo que hace falta para elegir y chequear compatibilidad (nombre, una foto
   * cifrada y los datos técnicos normalizados), no la ficha completa: no suma al
   * tope diario de fichas vistas.
   */
  pcParts(step: PcStep): Promise<PcPartContent[]> {
    const hit = this.pcPartsCache.get(step);
    if (hit && Date.now() - hit.at < PC_PARTS_TTL_MS) return hit.rows;
    const rows = this.loadPcParts(step);
    this.pcPartsCache.set(step, { at: Date.now(), rows });
    rows.catch(() => this.pcPartsCache.delete(step));
    return rows;
  }

  private async loadPcParts(step: PcStep): Promise<PcPartContent[]> {
    const rows = await this.prisma.platformProductContent.findMany({
      where: { category: { hasSome: PC_STEP_CATEGORIES[step] }, links: { some: {} } },
      select: {
        id: true, name: true, brand: true, category: true, specs: true, images: true,
        links: { select: { provider: true, externalId: true } },
      },
    });
    return rows.map((r) => {
      const { compat, estimated } = pcCompatWithEstimates(step, r.specs, r.category, r.name);
      return {
        contentId: r.id,
        name: r.name,
        brand: r.brand,
        image: this.protectImages(Array.isArray(r.images) ? (r.images as unknown[]).slice(0, 1) : [])[0]?.url ?? null,
        compat,
        estimated,
        links: r.links,
      };
    });
  }

  /** Texto de la ficha para "Copiar ficha", con su propio tope diario. Queda registrado. */
  async copyText(provider: string, externalId: string, userId: string): Promise<{ text: string }> {
    const link = await this.prisma.platformProductContentLink.findUnique({
      where: { provider_externalId: { provider, externalId } },
      include: { content: true },
    });
    if (!link) throw new NotFoundException("Este producto no tiene ficha completa");
    const day = argentinaDay();
    const copies = await this.prisma.platformContentAccess.count({ where: { userId, day, copied: true } });
    if (copies >= DAILY_COPY_LIMIT) {
      throw new HttpException("Llegaste al límite de fichas copiadas por hoy", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!(await this.registerView(userId, provider, externalId))) {
      throw new HttpException("Llegaste al límite de fichas completas por hoy", HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.prisma.platformContentAccess.update({
      where: { userId_day_provider_externalId: { userId, day, provider, externalId } },
      data: { copied: true },
    });
    const c = link.content;
    return {
      text: contentToText({
        name: c.name,
        shortDescription: c.shortDescription,
        descriptionHtml: c.descriptionHtml,
        specs: confirmedSpecs(c.specs),
      }),
    };
  }

  /** true si el usuario puede ver esta ficha hoy: ya la vio, o todavía no llegó al tope. */
  private async registerView(userId: string, provider: string, externalId: string): Promise<boolean> {
    const day = argentinaDay();
    const key = { userId_day_provider_externalId: { userId, day, provider, externalId } };
    if (await this.prisma.platformContentAccess.findUnique({ where: key, select: { id: true } })) return true;
    const seen = await this.prisma.platformContentAccess.count({ where: { userId, day } });
    if (seen >= DAILY_VIEW_LIMIT) {
      if (seen === DAILY_VIEW_LIMIT) this.logger.warn(`Usuario ${userId} llegó al tope diario de fichas completas`);
      return false;
    }
    await this.prisma.platformContentAccess.createMany({ data: [{ userId, day, provider, externalId }], skipDuplicates: true });
    return true;
  }

  private healthCache: { at: number; data: Promise<unknown> } | null = null;

  /**
   * Estado público de las fichas para controlarlo sin entrar al superadmin: la última
   * importación y, por paso del armador, cuántas piezas hay y qué porcentaje trae cada
   * dato. Solo cantidades y fechas (nada del catálogo ni de los comercios). 2 min en memoria.
   */
  health() {
    if (this.healthCache && Date.now() - this.healthCache.at < 2 * 60_000) return this.healthCache.data;
    const data = this.buildHealth();
    this.healthCache = { at: Date.now(), data };
    data.catch(() => { this.healthCache = null; });
    return data;
  }

  private async buildHealth() {
    const [last, lastOk, contents, links] = await Promise.all([
      this.prisma.platformContentImportRun.findFirst({ where: { source: ACUSTOCK_SOURCE, mode: "APPLY" }, orderBy: { startedAt: "desc" } }),
      this.prisma.platformContentImportRun.findFirst({ where: { source: ACUSTOCK_SOURCE, mode: "APPLY", status: "OK" }, orderBy: { finishedAt: "desc" } }),
      this.prisma.platformProductContent.count({ where: { source: ACUSTOCK_SOURCE } }),
      this.prisma.platformProductContentLink.count(),
    ]);
    const steps: Record<string, { parts: number; withEstimated: number; coverage: Record<string, number> }> = {};
    for (const step of PC_STEPS) {
      const parts = await this.pcParts(step);
      const keys = [...new Set(parts.flatMap((p) => Object.keys(p.compat)))];
      const has = (v: unknown) => v != null && !(Array.isArray(v) && v.length === 0);
      steps[step] = {
        parts: parts.length,
        withEstimated: parts.filter((p) => p.estimated.length > 0).length,
        coverage: Object.fromEntries(keys.map((k) => [k, parts.length ? Math.round((parts.filter((p) => has(p.compat[k])).length / parts.length) * 100) : 0])),
      };
    }
    // De las estadísticas, solo los números (no la muestra de nombres sin cruzar) y la fase.
    const numbers = (s: unknown) =>
      Object.fromEntries(Object.entries(s && typeof s === "object" ? (s as Record<string, unknown>) : {}).filter(([k, v]) => typeof v === "number" || k === "phase"));
    const run = (r: typeof last) =>
      r && { status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt, errorMessage: r.errorMessage, stats: numbers(r.stats) };
    return { running: this.running, lastApply: run(last), lastOk: run(lastOk), contents, links, steps };
  }

  isConfigured(): boolean {
    return this.acustock.isConfigured();
  }

  async status() {
    const [runs, contents, links] = await Promise.all([
      this.prisma.platformContentImportRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
      this.prisma.platformProductContent.count({ where: { source: ACUSTOCK_SOURCE } }),
      this.prisma.platformProductContentLink.count(),
    ]);
    return { configured: this.acustock.isConfigured(), running: this.running, contents, links, runs };
  }

  /** Arranca una corrida en segundo plano. PREVIEW no escribe contenido; APPLY carga y reemplaza los vínculos. */
  async start(mode: Mode, startedById?: string) {
    if (this.running) throw new ConflictException("Ya hay una importación en curso");
    if (!this.acustock.isConfigured()) throw new ConflictException("Falta configurar la exportación de AcuStock");
    // Las corridas sin latido (réplica caída) se cierran; el índice único parcial
    // de la migración deja una sola RUNNING por fuente entre todas las réplicas.
    await this.prisma.platformContentImportRun.updateMany({
      where: { source: ACUSTOCK_SOURCE, status: "RUNNING", heartbeatAt: { lt: new Date(Date.now() - STALE_MS) } },
      data: { status: "ERROR", finishedAt: new Date(), errorMessage: "Sin latido: se dio por interrumpida" },
    });
    let run: { id: string };
    try {
      run = await this.prisma.platformContentImportRun.create({
        data: { source: ACUSTOCK_SOURCE, mode, startedById: startedById ?? null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Ya hay una importación en curso");
      }
      throw err;
    }
    this.running = true;
    void this.execute(run.id, mode)
      .catch((err: unknown) => this.logger.error(`Importación ${run.id} falló`, err as Error))
      .finally(() => {
        this.running = false;
      });
    return { started: true, runId: run.id };
  }

  private async execute(runId: string, mode: Mode) {
    try {
      const products = await this.acustock.fetchAll((page, total) =>
        this.heartbeat(runId, { phase: "Leyendo AcuStock", page, totalPages: total })
      );
      await this.heartbeat(runId, { phase: "Cruzando con el catálogo", read: products.length });
      const catalog = await this.loadCatalog();
      const { links, stats } = matchContent(products, catalog, new Set<string>(KNOWN_PROVIDERS));
      const summary = {
        ...stats,
        catalogRows: catalog.length,
        withImages: products.filter((p) => p.images.length).length,
        withDescription: products.filter((p) => p.description).length,
        withSpecs: products.filter((p) => p.specs.length).length,
        unmatchedSample: stats.unmatchedSample.map((id) => products.find((p) => p.id === id)?.name ?? id),
      };
      if (mode === "APPLY") {
        await this.heartbeat(runId, { ...summary, phase: "Cargando contenido" });
        await this.apply(products, links, (phase) => this.heartbeat(runId, { ...summary, phase }));
        this.pcPartsCache.clear();
        this.healthCache = null;
      }
      await this.prisma.platformContentImportRun.update({
        where: { id: runId },
        data: { status: "OK", finishedAt: new Date(), stats: { ...summary, phase: "Listo" } },
      });
    } catch (err) {
      await this.prisma.platformContentImportRun.update({
        where: { id: runId },
        data: { status: "ERROR", finishedAt: new Date(), errorMessage: (err as Error).message.slice(0, 500) },
      });
      throw err;
    }
  }

  private heartbeat(runId: string, stats: Record<string, unknown>) {
    return this.prisma.platformContentImportRun
      .update({ where: { id: runId }, data: { heartbeatAt: new Date(), stats: stats as Prisma.InputJsonValue } })
      .then(() => undefined);
  }

  /** Claves de cruce de todas las fichas, en páginas para no traer `raw`. */
  private async loadCatalog(): Promise<CatalogRow[]> {
    const rows: CatalogRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.providerSyncCache.findMany({
        select: { id: true, provider: true, externalId: true, sku: true, partNumber: true },
        orderBy: { id: "asc" },
        take: CATALOG_PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      for (const { id: _id, ...row } of page) rows.push(row);
      if (page.length < CATALOG_PAGE) return rows;
      cursor = page[page.length - 1].id;
    }
  }

  /**
   * Upsert del contenido y sincronización de los vínculos por diferencia (sin una
   * transacción larga ni un momento con las fichas vacías). Se puede volver a correr.
   */
  private async apply(products: AcuStockProduct[], links: ContentLink[], progress: (phase: string) => Promise<void>) {
    for (let i = 0; i < products.length; i += CONTENT_CHUNK) {
      const chunk = products.slice(i, i + CONTENT_CHUNK);
      // Lote no interactivo: no tiene el tope de 5 s de las transacciones interactivas.
      await this.prisma.$transaction(chunk.map((p) => this.upsertContent(p)));
      await progress(`Cargando contenido (${Math.min(i + CONTENT_CHUNK, products.length)}/${products.length})`);
    }

    const ids = await this.prisma.platformProductContent.findMany({
      where: { source: ACUSTOCK_SOURCE },
      select: { id: true, sourceId: true },
    });
    const idBySource = new Map(ids.map((r) => [r.sourceId, r.id]));
    const wanted = new Map<string, { contentId: string; provider: string; externalId: string; matchedBy: string }>();
    for (const l of links) {
      const contentId = idBySource.get(l.contentId);
      if (contentId) {
        wanted.set(`${l.provider}|${l.externalId}`, { contentId, provider: l.provider, externalId: l.externalId, matchedBy: l.matchedBy });
      }
    }

    // Solo se manejan los vínculos por código: los agregados por nombre (revisados a mano) se respetan.
    const existing = await this.prisma.platformProductContentLink.findMany({
      where: { content: { source: ACUSTOCK_SOURCE }, matchedBy: "SUPPLIER_CODE" },
      select: { id: true, provider: true, externalId: true, contentId: true, matchedBy: true },
    });
    const stale: string[] = [];
    for (const e of existing) {
      const key = `${e.provider}|${e.externalId}`;
      const w = wanted.get(key);
      if (w && w.contentId === e.contentId && w.matchedBy === e.matchedBy) wanted.delete(key);
      else stale.push(e.id);
    }

    await progress(`Actualizando vínculos (${stale.length} cambian, ${wanted.size} nuevos)`);
    for (let i = 0; i < stale.length; i += LINK_CHUNK) {
      await this.prisma.platformProductContentLink.deleteMany({ where: { id: { in: stale.slice(i, i + LINK_CHUNK) } } });
    }
    const fresh = [...wanted.values()];
    for (let i = 0; i < fresh.length; i += LINK_CHUNK) {
      await this.prisma.platformProductContentLink.createMany({ data: fresh.slice(i, i + LINK_CHUNK), skipDuplicates: true });
    }
  }

  private upsertContent(p: AcuStockProduct) {
    const data = {
      name: p.name,
      brand: p.brand,
      ean: p.ean,
      partNumber: p.partNumber,
      category: p.category,
      shortDescription: p.shortDescription,
      descriptionHtml: p.description,
      specs: p.specs as Prisma.InputJsonValue,
      images: p.images as Prisma.InputJsonValue,
      warrantyMonths: p.warrantyMonths,
      sourceUpdatedAt: p.updatedAt,
    };
    return this.prisma.platformProductContent.upsert({
      where: { source_sourceId: { source: ACUSTOCK_SOURCE, sourceId: p.id } },
      create: { source: ACUSTOCK_SOURCE, sourceId: p.id, ...data },
      update: data,
    });
  }
}
