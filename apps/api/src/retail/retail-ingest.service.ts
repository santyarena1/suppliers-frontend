import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RetailSourceClient, type ExternalProduct, type ExternalStore } from "./retail-source.client";
import {
  HG_PAGE_SIZE,
  RetailHardgamersClient,
  hardgamersExternalId,
  type HardgamersDoc,
} from "./retail-hardgamers.client";
import { normalizeSearchText } from "./retail-search.util";
import {
  catalogLooksFalselyDivided,
  isCentsBasedStore,
  normalizeExternalPrice,
  resolvePriceDivisor,
} from "./retail-price.util";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const STALE_MS = 15 * 60_000;

/** Tope de seguridad por tienda en una corrida de la segunda fuente. */
const MAX_HG_PAGES_PER_STORE = 120;

function firstImage(images?: { url?: string }[]): string | null {
  const url = images?.find((i) => i?.url)?.url;
  return url?.trim() || null;
}

function categoryName(p: ExternalProduct): string | null {
  const name = p.categorias?.find((c) => c?.categoria?.nombre)?.categoria?.nombre;
  return name?.trim() || null;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < items.length) {
      const cur = i++;
      await fn(items[cur]);
    }
  });
  await Promise.all(workers);
}

@Injectable()
export class RetailIngestService implements OnModuleInit {
  private readonly logger = new Logger(RetailIngestService.name);
  private running = false;
  private currentMode: "full" | "batch" | null = null;
  private cancelRequested = false;
  private pendingFull = false;
  private activeRunId: string | null = null;
  /** Sube al abortar un lock colgado, para que el `finally` viejo no pise la corrida nueva. */
  private runGeneration = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: RetailSourceClient,
    private readonly hardgamers: RetailHardgamersClient,
    private readonly config: ConfigService
  ) {}

  /**
   * Segunda fuente, con la misma cadencia que el resto de los locales.
   *
   * El ingest principal corre cada 5 minutos y en cada vuelta toma un lote de
   * las tiendas más viejas; acá igual, pero el lote se mide en páginas porque
   * el límite real es de pedidos por minuto, no de tiendas. Con el presupuesto
   * por defecto una vuelta completa de todos los locales tarda unos diez
   * minutos, en vez de esperar un batch cada seis horas.
   */
  async ingestHardgamersStores(
    slugs?: string[],
    opts: { pageBudget?: number } = {}
  ): Promise<{ stores: number; products: number; pages: number; skipped: string[] }> {
    const configured = slugs?.length ? slugs : this.hardgamers.storeSlugs();
    // Sin presupuesto (disparo manual) se hace la vuelta entera.
    let budget = opts.pageBudget ?? Number.POSITIVE_INFINITY;
    const targets = await this.hardgamersByStaleness(configured);

    let storesDone = 0;
    let productsUpserted = 0;
    let pagesRead = 0;
    const skipped: string[] = [];

    for (const slug of targets) {
      if (budget <= 0) break;
      try {
        const first = await this.hardgamers.fetchStorePage(slug, 1);
        budget -= 1;
        pagesRead += 1;
        if (!first || first.docs.length === 0) {
          skipped.push(slug);
          continue;
        }

        const storeName = first.storeName || slug;
        const store = await this.upsertHardgamersStore(slug, storeName);
        productsUpserted += await this.saveHardgamersDocs(store.id, first.docs);

        const pages = Math.max(1, Math.min(first.pages, Math.ceil(first.total / HG_PAGE_SIZE)));
        // El presupuesto decide si se ARRANCA otra tienda, no corta una empezada.
        // Cortarla a mitad la dejaba sin marcar como sincronizada, y al ser la más
        // vieja volvía a salir primera en la vuelta siguiente: una tienda más
        // grande que el presupuesto no terminaba nunca y tapaba a las demás.
        for (let page = 2; page <= pages && page <= MAX_HG_PAGES_PER_STORE; page++) {
          const data = await this.hardgamers.fetchStorePage(slug, page);
          budget -= 1;
          pagesRead += 1;
          if (!data || data.docs.length === 0) break;
          productsUpserted += await this.saveHardgamersDocs(store.id, data.docs);
        }

        await this.prisma.retailStore.update({
          where: { id: store.id },
          data: { syncedAt: new Date() },
        });
        storesDone += 1;
        this.logger.log(
          "HardGamers: " + storeName + " (" + slug + ") " + first.total + " productos"
        );
      } catch (err) {
        skipped.push(slug);
        this.logger.warn(
          "HardGamers " + slug + " falló: " + (err instanceof Error ? err.message : String(err))
        );
      }
    }

    return { stores: storesDone, products: productsUpserted, pages: pagesRead, skipped };
  }

  /** Las tiendas más viejas primero; las que nunca se trajeron van al frente. */
  private async hardgamersByStaleness(slugs: string[]): Promise<string[]> {
    const ids = new Map(slugs.map((s) => [hardgamersExternalId("store:" + s), s]));
    const rows = await this.prisma.retailStore.findMany({
      where: { externalId: { in: [...ids.keys()] } },
      select: { externalId: true, syncedAt: true },
    });
    const syncedAt = new Map<string, number>();
    for (const slug of slugs) syncedAt.set(slug, 0);
    for (const row of rows) {
      const slug = ids.get(row.externalId);
      if (slug) syncedAt.set(slug, row.syncedAt.getTime());
    }
    return [...slugs].sort((a, b) => (syncedAt.get(a) ?? 0) - (syncedAt.get(b) ?? 0));
  }

  private async upsertHardgamersStore(slug: string, name: string) {
    const externalId = hardgamersExternalId("store:" + slug);
    return this.prisma.retailStore.upsert({
      where: { externalId },
      create: {
        externalId,
        name,
        active: true,
        // HardGamers publica el precio final en pesos, sin centavos escondidos.
        priceDivisor: 1,
        raw: { source: "hardgamers", slug } as object,
        syncedAt: new Date(0),
      },
      update: {
        name,
        active: true,
        priceDivisor: 1,
        raw: { source: "hardgamers", slug } as object,
      },
      select: { id: true },
    });
  }

  private async saveHardgamersDocs(storeId: string, docs: HardgamersDoc[]): Promise<number> {
    let n = 0;
    for (const doc of docs) {
      const name = (doc.name || "").trim();
      const price = Number(doc.price);
      if (!name || !doc._id || !Number.isFinite(price) || price <= 0) continue;

      const externalId = hardgamersExternalId(doc._id);
      const searchText = normalizeSearchText(name);
      // El link trae utm de HardGamers: guardamos la ficha del local, limpia.
      const productUrl = (doc.link || "").split("?")[0] || null;

      const row = await this.prisma.retailProduct.upsert({
        where: { externalId },
        create: {
          externalId,
          storeId,
          name,
          price: new Prisma.Decimal(price),
          productUrl,
          imageUrl: doc.image?.trim() || null,
          searchText,
          active: doc.availability !== false,
          syncedAt: new Date(),
        },
        update: {
          storeId,
          name,
          price: new Prisma.Decimal(price),
          productUrl,
          imageUrl: doc.image?.trim() || null,
          searchText,
          active: doc.availability !== false,
          syncedAt: new Date(),
        },
        select: { id: true, price: true },
      });

      // Historial: un punto por cambio real de precio, igual que la otra fuente.
      // Esta fuente no entrega id de cambio, asi que el punto se fecha al momento
      // de la lectura y se guarda el precio anterior para poder graficar el salto.
      const last = await this.prisma.retailPriceHistory.findFirst({
        where: { productId: row.id },
        orderBy: { changedAt: "desc" },
        select: { price: true },
      });
      const previous = last ? Number(last.price) : null;
      if (previous == null || Math.abs(previous - price) > 0.009) {
        await this.prisma.retailPriceHistory
          .create({
            data: {
              productId: row.id,
              price: new Prisma.Decimal(price),
              previousPrice: previous == null ? null : new Prisma.Decimal(previous),
              changedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
      n += 1;
    }
    return n;
  }

  async onModuleInit() {
    // Corridas huérfanas tras restart del proceso
    await this.prisma.retailIngestRun.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Interrumpida por reinicio del servidor",
      },
    });
  }

  isRunning() {
    return this.running;
  }

  getCurrentMode() {
    return this.currentMode;
  }

  /**
   * Si el proceso quedó con `running=true` pero no hay heartbeat, libera el lock.
   * Sin esto el cron se salta para siempre (una corrida de la mañana deja el día muerto).
   */
  async recoverStaleLock(): Promise<boolean> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await this.prisma.retailIngestRun.updateMany({
      where: { status: "RUNNING", heartbeatAt: { lt: staleBefore } },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Sin progreso (timeout / proceso reiniciado)",
      },
    });

    if (!this.running) return false;

    let heartbeat: Date | null = null;
    if (this.activeRunId) {
      const run = await this.prisma.retailIngestRun.findUnique({
        where: { id: this.activeRunId },
        select: { heartbeatAt: true, status: true },
      });
      heartbeat = run?.heartbeatAt ?? null;
      if (run && run.status !== "RUNNING") {
        this.logger.warn("Ingesta retail: lock en memoria con corrida ya cerrada — se libera");
        this.abortCurrentRun();
        return true;
      }
    }

    if (!heartbeat || heartbeat < staleBefore) {
      this.logger.warn("Ingesta retail colgada: se libera el lock para que el cron siga");
      this.abortCurrentRun();
      return true;
    }
    return false;
  }

  private abortCurrentRun() {
    this.runGeneration += 1;
    this.cancelRequested = true;
    this.running = false;
    this.currentMode = null;
    this.activeRunId = null;
  }

  /**
   * Admin “Sincronizar ahora”: full en background.
   * Si hay un batch del cron, lo cancela al terminar la tienda actual y encola el full.
   */
  requestFullIngest(): { started: boolean; reason?: string } {
    if (this.running && this.currentMode === "full") {
      return { started: false, reason: "already_running" };
    }
    if (this.running && this.currentMode === "batch") {
      this.cancelRequested = true;
      this.pendingFull = true;
      this.logger.log("Full retail encolado: se inicia al cortar el batch del cron");
      return { started: true, reason: "queued_after_batch" };
    }
    void this.runFullIngest().catch((err) => {
      this.logger.error(`Full retail falló: ${err instanceof Error ? err.message : String(err)}`);
    });
    return { started: true };
  }

  async runFullIngest(): Promise<{ runId: string; productsUpserted: number; storesDone: number }> {
    return this.runIngest({ mode: "full" });
  }

  async runBatchIngest(maxStores: number): Promise<{ runId: string; productsUpserted: number; storesDone: number }> {
    return this.runIngest({ mode: "batch", maxStores: Math.max(1, maxStores) });
  }

  /** Sync de una sola tienda (admin). */
  async runStoreIngest(storeId: string): Promise<{ productsUpserted: number }> {
    if (this.running) {
      throw new Error("Ya hay una ingesta en curso");
    }
    const store = await this.prisma.retailStore.findUnique({ where: { id: storeId } });
    if (!store) throw new Error("Local no encontrado");

    this.cancelRequested = false;
    const gen = ++this.runGeneration;
    this.running = true;
    this.currentMode = "full";
    const run = await this.prisma.retailIngestRun.create({
      data: {
        status: "RUNNING",
        mode: "full",
        storesTotal: 1,
        currentStoreName: store.name,
        heartbeatAt: new Date(),
      },
    });
    this.activeRunId = run.id;

    try {
      // Corrige divisor + precios ya divididos de más antes de re-sincronizar
      await this.repairFalselyDividedCatalogs();
      const pageDelayMs = Math.max(0, Number(this.config.get("RETAIL_INGEST_PAGE_DELAY_MS") ?? 50));
      const count = await this.ingestStore(store.externalId, pageDelayMs, run.id, gen);
      await this.prisma.retailStore.update({
        where: { id: store.id },
        data: { syncedAt: new Date() },
      });
      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: {
          status: "OK",
          finishedAt: new Date(),
          storesDone: 1,
          productsUpserted: count,
          currentStoreName: store.name,
          heartbeatAt: new Date(),
        },
      });
      return { productsUpserted: count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
      });
      throw err;
    } finally {
      if (this.runGeneration === gen) {
        this.running = false;
        this.currentMode = null;
        this.activeRunId = null;
        if (this.pendingFull) {
          this.pendingFull = false;
          void this.runFullIngest();
        }
      }
    }
  }

  private async runIngest(opts: {
    mode: "full" | "batch";
    maxStores?: number;
  }): Promise<{ runId: string; productsUpserted: number; storesDone: number }> {
    if (this.running) {
      this.logger.warn("Ingesta retail ya en curso — se omite");
      const last = await this.prisma.retailIngestRun.findFirst({ orderBy: { startedAt: "desc" } });
      return {
        runId: last?.id ?? "",
        productsUpserted: last?.productsUpserted ?? 0,
        storesDone: last?.storesDone ?? 0,
      };
    }

    this.cancelRequested = false;
    const gen = ++this.runGeneration;
    this.running = true;
    this.currentMode = opts.mode;
    const run = await this.prisma.retailIngestRun.create({
      data: { status: "RUNNING", mode: opts.mode, heartbeatAt: new Date() },
    });
    this.activeRunId = run.id;

    let productsUpserted = 0;
    let storesDone = 0;

    const concurrency = Math.max(
      1,
      Math.min(4, Number(this.config.get("RETAIL_INGEST_CONCURRENCY") ?? (opts.mode === "full" ? 3 : 2)))
    );
    const pageDelayMs = Math.max(
      0,
      Number(this.config.get("RETAIL_INGEST_PAGE_DELAY_MS") ?? (opts.mode === "full" ? 50 : 100))
    );

    try {
      // Se ingestan todos los locales que publica la fuente. El "estado" que
      // trae es criterio del agregador, no del local: varios marcados como
      // inactivos siguen publicando precios y nos interesan igual.
      const remoteStores = await this.client.listStores();

      await mapPool(remoteStores, 4, async (store) => {
        await this.upsertStoreMeta(store);
      });

      // Recompone catálogos que el auto-detect viejo dejó ÷100 (varios locales, no solo Multiplo)
      const repair = await this.repairFalselyDividedCatalogs();
      if (repair.storesRepaired > 0) {
        this.logger.warn(
          `Precios reparados: ${repair.storesRepaired} locales, ${repair.productsScaled} productos ×100`
        );
      }

      const ordered = await this.prisma.retailStore.findMany({
        where: {
          active: true,
          externalId: { in: remoteStores.map((s) => s.id) },
        },
        orderBy: { syncedAt: "asc" },
        select: { id: true, externalId: true, name: true },
      });

      const targets = opts.mode === "full" ? ordered : ordered.slice(0, opts.maxStores ?? 6);

      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: { storesTotal: targets.length, heartbeatAt: new Date() },
      });

      let idx = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (idx < targets.length) {
          if (this.cancelRequested || this.runGeneration !== gen) break;
          const current = idx++;
          if (current >= targets.length) break;
          const store = targets[current];
          try {
            await this.prisma.retailIngestRun.update({
              where: { id: run.id },
              data: { currentStoreName: store.name, heartbeatAt: new Date() },
            });
            const count = await this.ingestStore(store.externalId, pageDelayMs, run.id, gen);
            productsUpserted += count;
            await this.prisma.retailStore.update({
              where: { id: store.id },
              data: { syncedAt: new Date() },
            });
          } catch (err) {
            this.logger.warn(
              `Ingesta tienda ${store.externalId} (${store.name}) falló: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
          storesDone += 1;
          await this.prisma.retailIngestRun.update({
            where: { id: run.id },
            data: {
              storesDone,
              productsUpserted,
              heartbeatAt: new Date(),
            },
          });
        }
      });
      await Promise.all(workers);

      const cancelled = this.cancelRequested;
      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: {
          status: cancelled ? "CANCELLED" : "OK",
          finishedAt: new Date(),
          productsUpserted,
          storesDone,
          currentStoreName: null,
          heartbeatAt: new Date(),
          errorMessage: cancelled ? "Cancelada para iniciar sync full" : null,
        },
      });
      this.logger.log(
        `Ingesta retail ${opts.mode} ${cancelled ? "CANCELLED" : "OK"}: ${storesDone} tiendas, ${productsUpserted} productos`
      );
      return { runId: run.id, productsUpserted, storesDone };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          errorMessage: message,
          productsUpserted,
          storesDone,
          heartbeatAt: new Date(),
        },
      });
      this.logger.error(`Ingesta retail ERROR: ${message}`);
      throw err;
    } finally {
      if (this.runGeneration === gen) {
        this.running = false;
        this.currentMode = null;
        this.activeRunId = null;
        this.cancelRequested = false;
        if (this.pendingFull) {
          this.pendingFull = false;
          this.logger.log("Iniciando full retail encolado…");
          void this.runFullIngest().catch((err) => {
            this.logger.error(
              `Full encolado falló: ${err instanceof Error ? err.message : String(err)}`
            );
          });
        }
      }
    }
  }

  private async upsertStoreMeta(store: ExternalStore) {
    const name = store.nombre?.trim() || `Tienda ${store.id}`;
    const logoUrl = firstImage(store.imagenes);
    const divisor = resolvePriceDivisor(name, store.id);
    await this.prisma.retailStore.upsert({
      where: { externalId: store.id },
      create: {
        externalId: store.id,
        name,
        logoUrl,
        active: true,
        priceDivisor: divisor,
        raw: store as object,
        syncedAt: new Date(0),
      },
      update: {
        name,
        logoUrl,
        active: true,
        // Siempre el divisor correcto (nunca confiar en un auto-detect viejo)
        priceDivisor: divisor,
        raw: store as object,
      },
    });
  }

  /**
   * Recompone catálogos no-Multiplo que quedaron ÷100 por el auto-detect viejo.
   * Criterio: el tramo caro del local quedó &lt;100k pero ×100 vuelve a zona sana.
   */
  async repairFalselyDividedCatalogs(): Promise<{ storesRepaired: number; productsScaled: number }> {
    const stores = await this.prisma.retailStore.findMany({
      where: { active: true },
      select: { id: true, name: true, externalId: true },
    });

    let storesRepaired = 0;
    let productsScaled = 0;

    for (const store of stores) {
      if (isCentsBasedStore(store.name, store.externalId)) {
        // Asegura divisor 100 en Multiplo
        await this.prisma.retailStore.update({
          where: { id: store.id },
          data: { priceDivisor: 100 },
        });
        continue;
      }

      await this.prisma.retailStore.update({
        where: { id: store.id },
        data: { priceDivisor: 1 },
      });

      const sample = await this.prisma.retailProduct.findMany({
        where: { storeId: store.id, active: true },
        select: { price: true },
        orderBy: { price: "desc" },
        take: 40,
      });
      const prices = sample.map((p) => Number(p.price));
      if (!catalogLooksFalselyDivided(prices)) continue;

      const scaled = await this.prisma.$executeRaw`
        UPDATE "RetailProduct"
        SET price = price * 100
        WHERE "storeId" = ${store.id}
          AND price > 0
          AND price < 100000
      `;
      await this.prisma.$executeRaw`
        UPDATE "RetailPriceHistory" AS h
        SET
          price = h.price * 100,
          "previousPrice" = CASE
            WHEN h."previousPrice" IS NULL THEN NULL
            ELSE h."previousPrice" * 100
          END
        FROM "RetailProduct" AS p
        WHERE h."productId" = p.id
          AND p."storeId" = ${store.id}
          AND h.price > 0
          AND h.price < 100000
      `;

      const n = typeof scaled === "number" ? scaled : 0;
      storesRepaired += 1;
      productsScaled += n;
      this.logger.warn(
        `Reparación ÷100 falso: ${store.name} (id externo ${store.externalId}) — ~${n} productos ×100`
      );
    }

    return { storesRepaired, productsScaled };
  }

  private async ingestStore(
    externalStoreId: number,
    pageDelayMs: number,
    runId: string | null,
    gen: number
  ): Promise<number> {
    const store = await this.prisma.retailStore.findUnique({ where: { externalId: externalStoreId } });
    if (!store) return 0;

    // Única fuente de verdad: Multiplo = 100, resto = 1. Nunca auto-detect.
    const divisor = resolvePriceDivisor(store.name, store.externalId);
    if (store.priceDivisor !== divisor) {
      await this.prisma.retailStore.update({
        where: { id: store.id },
        data: { priceDivisor: divisor },
      });
      if (divisor > 1) {
        this.logger.log(`Tienda ${store.name}: precios en centavos (÷${divisor})`);
      }
    }

    let page = 1;
    let upserted = 0;
    let retries = 0;
    const productConcurrency = Math.max(
      2,
      Math.min(12, Number(this.config.get("RETAIL_INGEST_PRODUCT_CONCURRENCY") ?? 8))
    );

    while (true) {
      if (this.cancelRequested || this.runGeneration !== gen) break;

      let pageData;
      try {
        pageData = await this.client.listStoreProducts(externalStoreId, page, 100);
        retries = 0;
      } catch (err) {
        retries += 1;
        if (retries > 3) throw err;
        const wait = 500 * 2 ** (retries - 1);
        this.logger.warn(
          `Retry página ${page} tienda ${externalStoreId} en ${wait}ms: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        await sleep(wait);
        continue;
      }

      if (!pageData) break;

      await mapPool(pageData.products, productConcurrency, async (product) => {
        try {
          await this.upsertProduct(store.id, product, divisor);
          upserted += 1;
        } catch (err) {
          this.logger.warn(
            `Producto ${product.id} falló: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      });

      if (runId && page % 3 === 0) {
        await this.prisma.retailIngestRun
          .update({
            where: { id: runId },
            data: { heartbeatAt: new Date() },
          })
          .catch(() => undefined);
      }

      if (!pageData.hasNextPage) break;
      page += 1;
      if (pageDelayMs) await sleep(pageDelayMs);
    }

    return upserted;
  }

  private async upsertProduct(storeId: string, product: ExternalProduct, divisor: number) {
    const name = (product.nombre || "").trim();
    if (!name || !product.id) return;

    const price = normalizeExternalPrice(product.precio, divisor);
    const safePrice = Number.isFinite(price) && price > 0 ? price : 0;
    const searchText = normalizeSearchText(`${name} ${categoryName(product) ?? ""}`);

    const row = await this.prisma.retailProduct.upsert({
      where: { externalId: product.id },
      create: {
        externalId: product.id,
        storeId,
        name,
        description: product.descripcion?.trim() || null,
        price: new Prisma.Decimal(safePrice),
        productUrl: product.url?.trim() || null,
        imageUrl: firstImage(product.imagenes),
        categoryName: categoryName(product),
        searchText,
        active: true,
        syncedAt: new Date(),
      },
      update: {
        storeId,
        name,
        description: product.descripcion?.trim() || null,
        price: new Prisma.Decimal(safePrice),
        productUrl: product.url?.trim() || null,
        imageUrl: firstImage(product.imagenes),
        categoryName: categoryName(product),
        searchText,
        active: true,
        syncedAt: new Date(),
      },
    });

    // Solo últimos puntos de historial (el chart no necesita todo el archivo).
    // Un punto cuyo precio normalizado da 0 es basura de la fuente: se saltea en
    // vez de reventar el upsert con "numeric field overflow".
    const history = (product.historialPrecios ?? [])
      .filter((h) => h?.id && h.precioActual != null && normalizeExternalPrice(h.precioActual, divisor) > 0)
      .slice(-8);

    if (history.length === 0) return;

    await mapPool(history, 4, async (h) => {
      const changedAt = new Date(h.fechaDeCambio);
      if (Number.isNaN(changedAt.getTime())) return;
      await this.prisma.retailPriceHistory.upsert({
        where: {
          productId_externalId: { productId: row.id, externalId: h.id },
        },
        create: {
          productId: row.id,
          externalId: h.id,
          previousPrice: previousPriceOrNull(h.precioAnterior, divisor),
          price: new Prisma.Decimal(normalizeExternalPrice(h.precioActual, divisor)),
          changedAt,
        },
        update: {
          previousPrice: previousPriceOrNull(h.precioAnterior, divisor),
          price: new Prisma.Decimal(normalizeExternalPrice(h.precioActual, divisor)),
          changedAt,
        },
      });
    });
  }
}

/** Precio anterior de un punto de historial, o null si no vino o es basura (0). */
function previousPriceOrNull(raw: unknown, divisor: number): Prisma.Decimal | null {
  if (raw == null) return null;
  const n = normalizeExternalPrice(raw, divisor);
  return n > 0 ? new Prisma.Decimal(n) : null;
}
