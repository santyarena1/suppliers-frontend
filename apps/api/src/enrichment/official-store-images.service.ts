import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { domainEvents } from "../common/events/domain-events";
import { OFFICIAL_STORE_NO_PHOTO_ERROR, OFFICIAL_STORE_PENDING_ERROR } from "../images/image-sync-candidates";
import { PrismaService } from "../prisma/prisma.service";
import { fromCatalogJson, OFFICIAL_STORE_HOSTS, officialStoreLink, pickOfficialImages } from "./official-store-images";
import { httpGet } from "./sources/http";
import { ShopifyProduct } from "./sources/manufacturers/shopify";

/** Pausa entre páginas del catálogo (Shopify corta con 429 si vamos rápido). */
const GAP_MS = 1500;
const RETRY_WAIT_MS = [20_000, 60_000];
const BOOT_DELAY_MS = 45_000;
/** Si una tienda no respondió, se reintenta más tarde. */
const PENDING_RETRY_MS = 30 * 60_000;

/** Sube al cambiar cómo se eligen las fotos: vuelve a revisar lo ya resuelto con la versión anterior. */
const PICK_VERSION = "v3";
/** Productos por página de /products.json (máximo de Shopify) y tope de páginas. */
const PAGE_SIZE = 250;
const MAX_PAGES = 20;
const MAX_CATALOG_BYTES = 20 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fotos de Aula, IROK y ATK desde su tienda oficial. Se lee el catálogo entero de
 * la tienda y cada producto de la lista se busca por modelo y color (el link de
 * la lista solo desempata: muchas veces apunta a otro producto). Se toma solo la
 * foto de su variante (color, idioma, switch). Si no hay certeza, queda sin foto y Serper
 * no la completa con una de Google.
 *
 * Corre al aplicar una lista y al arrancar el servidor (lo pendiente). No pisa
 * fotos subidas o elegidas a mano: solo completa vacías o reemplaza las de Serper.
 */
@Injectable()
export class OfficialStoreImagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OfficialStoreImagesService.name);
  private readonly unsubscribes: (() => void)[] = [];
  private running: Promise<unknown> | null = null;
  private again = false;
  private bootTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.unsubscribes.push(domainEvents.on("list.applied", () => this.schedule()));
    if (process.env.NODE_ENV !== "test") {
      this.bootTimer = setTimeout(() => this.schedule(), BOOT_DELAY_MS);
    }
  }

  onModuleDestroy() {
    for (const off of this.unsubscribes) off();
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  /** Una corrida a la vez; si llega otra lista mientras corre, se repite al terminar. */
  schedule() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run()
      .catch((err) => this.logger.warn(`Fotos de tiendas oficiales: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.schedule();
        }
      });
  }

  async run(): Promise<{ filled: number; withoutPhoto: number; pending: number }> {
    const rows = await this.prisma.providerSyncCache.findMany({
      where: { OR: OFFICIAL_STORE_HOSTS.map((host) => ({ productUrl: { contains: host } })) },
      select: {
        id: true,
        provider: true,
        externalId: true,
        name: true,
        brand: true,
        ean: true,
        productUrl: true,
        imageUrl: true,
        imageFills: { select: { source: true, status: true, error: true, query: true } },
      },
    });

    // Pendientes: sin foto o con la de Serper, y no resueltos ya con este mismo link.
    const todo = rows.filter((r) => {
      const fill = r.imageFills[0];
      const hasImage = Boolean(r.imageUrl?.trim());
      if (fill?.source.startsWith("official:") && fill.query === `${r.productUrl}#${PICK_VERSION}` && fill.error !== OFFICIAL_STORE_PENDING_ERROR) return false;
      // Resuelto con otra versión o con otro link: se vuelve a revisar.
      if (fill?.source.startsWith("official:")) return true;
      if (!hasImage) return true;
      return Boolean(fill && fill.source.startsWith("serper") && fill.status === "filled");
    });
    if (todo.length === 0) return { filled: 0, withoutPhoto: 0, pending: 0 };

    const catalogs = new Map<string, ShopifyProduct[] | "unavailable">();
    let filled = 0;
    let withoutPhoto = 0;
    let pending = 0;
    for (const r of todo) {
      const link = officialStoreLink(r.productUrl);
      if (!link) continue;
      const origin = link.store.origin;
      if (!catalogs.has(origin)) {
        const catalog = await this.fetchCatalog(origin);
        catalogs.set(origin, catalog);
        if (catalog !== "unavailable") this.logger.log(`Catálogo de ${origin}: ${catalog.length} productos`);
      }
      const catalog = catalogs.get(origin)!;
      const previous = r.imageFills[0]?.source ?? "";
      // La foto anterior la puso Serper o esta misma revisión: se puede sacar si ya no es segura.
      const replaceable = previous.startsWith("serper") || previous.startsWith("official:");
      const base = { provider: r.provider, externalId: r.externalId, name: r.name, brand: r.brand, query: `${r.productUrl ?? ""}#${PICK_VERSION}` };
      const source = `official:${new URL(origin).host}`;
      if (catalog === "unavailable") {
        pending += 1;
        await this.saveFill(r.id, { ...base, source, status: "skipped", imageUrl: null, error: OFFICIAL_STORE_PENDING_ERROR });
        continue;
      }
      const pick = pickOfficialImages(catalog, { name: r.name, ean: r.ean, linkedHandle: link.handle });
      if (pick.images.length) {
        await this.prisma.providerSyncCache.update({ where: { id: r.id }, data: { imageUrl: pick.images[0] } });
        await this.saveFill(r.id, { ...base, source, status: "filled", imageUrl: pick.images[0], error: null });
        this.logger.log(`[foto] ${r.provider} ${r.externalId} «${r.name}» → ${pick.note}: ${pick.images[0]}`);
        filled += 1;
      } else {
        // Una foto que no es segura (de Google o de una revisión anterior) se saca.
        if (replaceable && r.imageUrl) await this.prisma.providerSyncCache.update({ where: { id: r.id }, data: { imageUrl: null } });
        await this.saveFill(r.id, { ...base, source, status: "skipped", imageUrl: null, error: OFFICIAL_STORE_NO_PHOTO_ERROR });
        this.logger.log(`[sin foto] ${r.provider} ${r.externalId} «${r.name}» → ${pick.note} (link: ${link.handle})`);
        withoutPhoto += 1;
      }
    }
    if (pending > 0 && !this.retryTimer) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.schedule();
      }, PENDING_RETRY_MS);
    }
    this.logger.log(`Fotos de tiendas oficiales: ${filled} con foto de su variante, ${withoutPhoto} sin foto segura, ${pending} pendientes`);
    return { filled, withoutPhoto, pending };
  }

  /** Todo el catálogo público de la tienda (`/products.json`), o "unavailable" si no respondió. */
  private async fetchCatalog(origin: string): Promise<ShopifyProduct[] | "unavailable"> {
    const all: ShopifyProduct[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.fetchJson(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`);
      if (body === "unavailable") return "unavailable";
      const products = fromCatalogJson(body);
      all.push(...products);
      if (products.length < PAGE_SIZE) break;
    }
    return all;
  }

  private async fetchJson(url: string): Promise<unknown | "unavailable"> {
    for (let attempt = 0; ; attempt++) {
      await sleep(GAP_MS);
      try {
        const res = await httpGet(url, { maxBytes: MAX_CATALOG_BYTES });
        if (res.status === 200) return JSON.parse(res.buffer.toString("utf8"));
        if (attempt >= RETRY_WAIT_MS.length) {
          this.logger.warn(`${url} respondió ${res.status}`);
          return "unavailable";
        }
      } catch (err) {
        if (attempt >= RETRY_WAIT_MS.length) {
          this.logger.warn(`${url}: ${err instanceof Error ? err.message : String(err)}`);
          return "unavailable";
        }
      }
      await sleep(RETRY_WAIT_MS[attempt]);
    }
  }

  private saveFill(
    productId: string,
    data: { provider: string; externalId: string; name: string; brand: string | null; query: string; source: string; status: string; imageUrl: string | null; error: string | null }
  ) {
    return this.prisma.imageSyncFill.upsert({
      where: { productId },
      create: { productId, runId: null, ...data },
      update: { runId: null, ...data },
    });
  }
}
