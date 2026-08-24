import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RetailSourceClient, type ExternalProduct, type ExternalStore } from "./retail-source.client";
import { normalizeSearchText } from "./retail-search.util";
import { detectPriceDivisor, normalizeExternalPrice } from "./retail-price.util";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: RetailSourceClient,
    private readonly config: ConfigService
  ) {}

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

    this.running = true;
    this.currentMode = "full";
    this.cancelRequested = false;
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
      const pageDelayMs = Math.max(0, Number(this.config.get("RETAIL_INGEST_PAGE_DELAY_MS") ?? 50));
      const count = await this.ingestStore(store.externalId, pageDelayMs, run.id);
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
      this.running = false;
      this.currentMode = null;
      this.activeRunId = null;
      if (this.pendingFull) {
        this.pendingFull = false;
        void this.runFullIngest();
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

    this.running = true;
    this.currentMode = opts.mode;
    this.cancelRequested = false;
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
      const remoteStores = await this.client.listStores();
      const activeRemote = remoteStores.filter((s) => {
        const estado = s.estado?.nombre?.toLowerCase();
        if (!estado) return true;
        return estado === "activa" || estado === "activo" || estado === "active";
      });

      await mapPool(activeRemote, 4, async (store) => {
        await this.upsertStoreMeta(store);
      });

      const ordered = await this.prisma.retailStore.findMany({
        where: {
          active: true,
          externalId: { in: activeRemote.map((s) => s.id) },
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
          if (this.cancelRequested) break;
          const current = idx++;
          if (current >= targets.length) break;
          const store = targets[current];
          try {
            await this.prisma.retailIngestRun.update({
              where: { id: run.id },
              data: { currentStoreName: store.name, heartbeatAt: new Date() },
            });
            const count = await this.ingestStore(store.externalId, pageDelayMs, run.id);
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

  private async upsertStoreMeta(store: ExternalStore) {
    const name = store.nombre?.trim() || `Tienda ${store.id}`;
    const logoUrl = firstImage(store.imagenes);
    await this.prisma.retailStore.upsert({
      where: { externalId: store.id },
      create: {
        externalId: store.id,
        name,
        logoUrl,
        active: true,
        raw: store as object,
        syncedAt: new Date(0),
      },
      update: {
        name,
        logoUrl,
        active: true,
        raw: store as object,
      },
    });
  }

  private async ingestStore(
    externalStoreId: number,
    pageDelayMs: number,
    runId: string | null
  ): Promise<number> {
    const store = await this.prisma.retailStore.findUnique({ where: { externalId: externalStoreId } });
    if (!store) return 0;

    let page = 1;
    let upserted = 0;
    let retries = 0;
    let divisor = store.priceDivisor > 1 ? store.priceDivisor : 1;
    let divisorDetected = store.priceDivisor > 1;
    const productConcurrency = Math.max(
      2,
      Math.min(12, Number(this.config.get("RETAIL_INGEST_PRODUCT_CONCURRENCY") ?? 8))
    );

    while (true) {
      if (this.cancelRequested) break;

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

      if (!divisorDetected && pageData.products.length >= 5) {
        divisor = detectPriceDivisor(pageData.products.map((p) => Number(p.precio)));
        divisorDetected = true;
        if (divisor !== store.priceDivisor) {
          await this.prisma.retailStore.update({
            where: { id: store.id },
            data: { priceDivisor: divisor },
          });
          if (divisor > 1) {
            this.logger.log(
              `Tienda ${store.name}: precios detectados en centavos (÷${divisor})`
            );
          }
        }
      }

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
    const history = (product.historialPrecios ?? [])
      .filter((h) => h?.id && h.precioActual != null)
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
          previousPrice:
            h.precioAnterior != null
              ? new Prisma.Decimal(normalizeExternalPrice(h.precioAnterior, divisor))
              : null,
          price: new Prisma.Decimal(normalizeExternalPrice(h.precioActual, divisor)),
          changedAt,
        },
        update: {
          previousPrice:
            h.precioAnterior != null
              ? new Prisma.Decimal(normalizeExternalPrice(h.precioAnterior, divisor))
              : null,
          price: new Prisma.Decimal(normalizeExternalPrice(h.precioActual, divisor)),
          changedAt,
        },
      });
    });
  }
}
