import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RetailSourceClient, type ExternalProduct, type ExternalStore } from "./retail-source.client";
import { normalizeSearchText } from "./retail-search.util";

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

@Injectable()
export class RetailIngestService {
  private readonly logger = new Logger(RetailIngestService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: RetailSourceClient,
    private readonly config: ConfigService
  ) {}

  isRunning() {
    return this.running;
  }

  async runFullIngest(): Promise<{ runId: string; productsUpserted: number }> {
    if (this.running) {
      this.logger.warn("Ingesta retail ya en curso — se omite");
      const last = await this.prisma.retailIngestRun.findFirst({ orderBy: { startedAt: "desc" } });
      return { runId: last?.id ?? "", productsUpserted: last?.productsUpserted ?? 0 };
    }

    this.running = true;
    const run = await this.prisma.retailIngestRun.create({ data: { status: "RUNNING" } });
    let productsUpserted = 0;

    const concurrency = Math.max(1, Math.min(3, Number(this.config.get("RETAIL_INGEST_CONCURRENCY") ?? 2)));
    const pageDelayMs = Math.max(0, Number(this.config.get("RETAIL_INGEST_PAGE_DELAY_MS") ?? 250));

    try {
      const stores = await this.client.listStores();
      const active = stores.filter((s) => {
        const estado = s.estado?.nombre?.toLowerCase();
        if (!estado) return true;
        return estado === "activa" || estado === "activo" || estado === "active";
      });

      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: { storesTotal: active.length },
      });

      // Upsert tiendas primero
      for (const store of active) {
        await this.upsertStore(store);
      }

      // Procesar tiendas con concurrencia limitada
      let idx = 0;
      const workers = Array.from({ length: concurrency }, async () => {
        while (idx < active.length) {
          const current = idx++;
          const store = active[current];
          try {
            const count = await this.ingestStore(store.id, pageDelayMs);
            productsUpserted += count;
          } catch (err) {
            this.logger.warn(
              `Ingesta tienda ${store.id} (${store.nombre}) falló: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          await this.prisma.retailIngestRun.update({
            where: { id: run.id },
            data: { storesDone: { increment: 1 }, productsUpserted },
          });
        }
      });
      await Promise.all(workers);

      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: {
          status: "OK",
          finishedAt: new Date(),
          productsUpserted,
        },
      });
      this.logger.log(`Ingesta retail OK: ${productsUpserted} productos`);
      return { runId: run.id, productsUpserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.retailIngestRun.update({
        where: { id: run.id },
        data: { status: "ERROR", finishedAt: new Date(), errorMessage: message, productsUpserted },
      });
      this.logger.error(`Ingesta retail ERROR: ${message}`);
      throw err;
    } finally {
      this.running = false;
    }
  }

  private async upsertStore(store: ExternalStore) {
    await this.prisma.retailStore.upsert({
      where: { externalId: store.id },
      create: {
        externalId: store.id,
        name: store.nombre?.trim() || `Tienda ${store.id}`,
        logoUrl: firstImage(store.imagenes),
        active: true,
        raw: store as object,
        syncedAt: new Date(),
      },
      update: {
        name: store.nombre?.trim() || `Tienda ${store.id}`,
        logoUrl: firstImage(store.imagenes),
        active: true,
        raw: store as object,
        syncedAt: new Date(),
      },
    });
  }

  private async ingestStore(externalStoreId: number, pageDelayMs: number): Promise<number> {
    const store = await this.prisma.retailStore.findUnique({ where: { externalId: externalStoreId } });
    if (!store) return 0;

    let page = 1;
    let upserted = 0;
    let retries = 0;

    while (true) {
      let pageData;
      try {
        pageData = await this.client.listStoreProducts(externalStoreId, page, 50);
        retries = 0;
      } catch (err) {
        retries += 1;
        if (retries > 3) throw err;
        const wait = 500 * 2 ** (retries - 1);
        this.logger.warn(
          `Retry página ${page} tienda ${externalStoreId} en ${wait}ms: ${err instanceof Error ? err.message : String(err)}`
        );
        await sleep(wait);
        continue;
      }

      if (!pageData) break;

      for (const product of pageData.products) {
        try {
          await this.upsertProduct(store.id, product);
          upserted += 1;
        } catch (err) {
          this.logger.warn(
            `Producto ${product.id} falló: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (!pageData.hasNextPage) break;
      page += 1;
      if (pageDelayMs) await sleep(pageDelayMs);
    }

    return upserted;
  }

  private async upsertProduct(storeId: string, product: ExternalProduct) {
    const name = (product.nombre || "").trim();
    if (!name || !product.id) return;

    const price = Number(product.precio);
    const safePrice = Number.isFinite(price) ? price : 0;
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
        raw: product as object,
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
        raw: product as object,
        syncedAt: new Date(),
      },
    });

    const history = product.historialPrecios ?? [];
    for (const h of history) {
      if (!h?.id || h.precioActual == null) continue;
      const changedAt = new Date(h.fechaDeCambio);
      if (Number.isNaN(changedAt.getTime())) continue;
      await this.prisma.retailPriceHistory.upsert({
        where: {
          productId_externalId: { productId: row.id, externalId: h.id },
        },
        create: {
          productId: row.id,
          externalId: h.id,
          previousPrice: h.precioAnterior != null ? new Prisma.Decimal(h.precioAnterior) : null,
          price: new Prisma.Decimal(h.precioActual),
          changedAt,
        },
        update: {
          previousPrice: h.precioAnterior != null ? new Prisma.Decimal(h.precioAnterior) : null,
          price: new Prisma.Decimal(h.precioActual),
          changedAt,
        },
      });
    }
  }
}
