import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { domainEvents } from "../common/events/domain-events";
import { OFFICIAL_STORE_NO_PHOTO_ERROR, OFFICIAL_STORE_PENDING_ERROR } from "../images/image-sync-candidates";
import { PrismaService } from "../prisma/prisma.service";
import { fromCatalogJson, OFFICIAL_STORE_HOSTS, officialStoreLink, pickOfficialImages } from "./official-store-images";
import { ImageSyncService } from "../images/image-sync.service";
import { probeLiveImage } from "../images/live-image";
import { isSerperBlockingError } from "../images/serper-images.client";
import { httpGet } from "./sources/http";
import { pickSecondaryImages, pickWebImages, SECONDARY_STORES, webImageQuery } from "./web-image-pick";
import { ShopifyProduct } from "./sources/manufacturers/shopify";

/** Pausa entre páginas del catálogo (Shopify corta con 429 si vamos rápido). */
const GAP_MS = 1500;
const RETRY_WAIT_MS = [20_000, 60_000];
const BOOT_DELAY_MS = 45_000;
/** Si una tienda no respondió, se reintenta más tarde. */
const PENDING_RETRY_MS = 30 * 60_000;

/** Sube al cambiar cómo se eligen las fotos: vuelve a revisar lo ya resuelto con la versión anterior. */
const PICK_VERSION = "v4";
/** Marca de que ya se hizo la segunda búsqueda (Google) para ese producto. */
const WEB_MARK = "+web";
/** Fotos de las tiendas de la marca en otros países: revisadas en prueba (12/11), activas. */
const SECONDARY_LIVE = true;
/**
 * Búsqueda en Google (Serper) para lo que ninguna tienda de la marca tiene. En
 * `false` solo deja en el log qué foto elegiría (para revisarlo antes de activarlo).
 */
const GOOGLE_LIVE = false;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageSync: ImageSyncService
  ) {}

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
    const official = await this.officialPass();
    await this.webPass();
    return official;
  }

  private async officialPass(): Promise<{ filled: number; withoutPhoto: number; pending: number }> {
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
      if (fill?.source.startsWith("official:") && fill.query?.startsWith(`${r.productUrl}#${PICK_VERSION}`) && fill.error !== OFFICIAL_STORE_PENDING_ERROR) return false;
      // Foto encontrada en la segunda búsqueda (Google), ya revisada.
      if (fill?.source.startsWith("web:") && fill.query?.startsWith(`${r.productUrl}#${PICK_VERSION}`)) return false;
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
      const replaceable = previous.startsWith("serper") || previous.startsWith("official:") || previous.startsWith("web:");
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

  /**
   * Lo que la tienda oficial no tiene: se busca en Google Imágenes y se toma una
   * foto solo si el título de la página dice el mismo modelo y los mismos colores
   * (ver web-image-pick). Una vez por producto.
   */
  private async webPass() {
    const rows = await this.prisma.providerSyncCache.findMany({
      where: {
        OR: OFFICIAL_STORE_HOSTS.map((host) => ({ productUrl: { contains: host } })),
        imageFills: { some: { source: { startsWith: "official:" }, error: OFFICIAL_STORE_NO_PHOTO_ERROR } },
      },
      select: { id: true, provider: true, externalId: true, name: true, brand: true, productUrl: true, imageUrl: true, imageFills: { select: { query: true } } },
    });
    const todo = rows.filter((r) => !r.imageUrl?.trim() && !(r.imageFills[0]?.query ?? "").endsWith(WEB_MARK));
    if (todo.length === 0) return;
    const catalogs = new Map<string, ShopifyProduct[] | "unavailable">();
    let found = 0;
    let serperOff = false;
    let pendingSerper = 0;
    for (const r of todo) {
      const link = officialStoreLink(r.productUrl);
      if (!link) continue;
      const brand = link.store.source.toUpperCase();
      const notes: string[] = [];
      let chosen: { imageUrl: string; source: string | null; note: string; live: boolean } | null = null;

      // 1) La misma marca en sus tiendas de otros países: foto de la variante exacta.
      for (const store of SECONDARY_STORES[link.store.source] ?? []) {
        if (!catalogs.has(store.origin)) {
          const catalog = await this.fetchCatalog(store.origin);
          catalogs.set(store.origin, catalog);
          this.logger.log(`Catálogo de ${store.origin}: ${catalog === "unavailable" ? "no respondió" : `${catalog.length} productos`}`);
          // En prueba: qué productos de la marca tiene, para revisar lo que no se encuentra.
          if (!GOOGLE_LIVE && catalog !== "unavailable") {
            const own = catalog.filter((p) => !store.brandInTitle || (p.title ?? "").toLowerCase().includes(brand.toLowerCase()));
            this.logger.log(`[web prueba] productos de ${store.origin}: ${own.map((p) => `${p.title} [${(p.variants ?? []).map((v) => v.title).join(" | ")}]`).join(" ;; ").slice(0, 60000)}`);
          }
        }
        const catalog = catalogs.get(store.origin)!;
        if (catalog === "unavailable") continue;
        const pick = pickSecondaryImages(catalog, { name: r.name, brand, brandInTitle: store.brandInTitle });
        const host = new URL(store.origin).host;
        if (pick.images.length && (await probeLiveImage(pick.images[0]))) {
          chosen = { imageUrl: pick.images[0], source: host, note: `${host} ${pick.note}`, live: SECONDARY_LIVE };
          break;
        }
        notes.push(`${host}: ${pick.note}`);
      }

      // 2) Google Imágenes, con el título de la página como control.
      const query = webImageQuery(r.name, brand);
      if (!chosen && !serperOff) {
        try {
          const hits = await this.imageSync.searchImages(query, 20);
          const { candidates, rejected } = pickWebImages(hits, { name: r.name, brand });
          for (const c of candidates.slice(0, 5)) {
            if (await probeLiveImage(c.imageUrl)) {
              chosen = { ...c, live: GOOGLE_LIVE };
              break;
            }
          }
          if (!chosen) notes.push(`Google: ${rejected.slice(0, 4).join(" | ") || "sin resultados"}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Búsqueda en Google de fotos cortada: ${msg}`);
          if (isSerperBlockingError(msg) || /api key/i.test(msg)) serperOff = true;
        }
      }
      if (!chosen && serperOff) pendingSerper += 1;
      const base = { provider: r.provider, externalId: r.externalId, name: r.name, brand: r.brand, query: `${r.productUrl ?? ""}#${PICK_VERSION}${WEB_MARK}` };
      if (chosen) {
        found += 1;
        this.logger.log(`${chosen.live ? "[web]" : "[web prueba]"} [foto] ${r.provider} ${r.externalId} «${r.name}» → ${chosen.note}: ${chosen.imageUrl}`);
        if (chosen.live) {
          await this.prisma.providerSyncCache.update({ where: { id: r.id }, data: { imageUrl: chosen.imageUrl } });
          await this.saveFill(r.id, { ...base, source: `web:${chosen.source ?? "google"}`.slice(0, 120), status: "filled", imageUrl: chosen.imageUrl, error: null });
        }
      } else {
        this.logger.log(`[web] [sin foto] ${r.provider} ${r.externalId} «${r.name}» (búsqueda: ${query}) → ${notes.join(" || ") || "sin resultados"}`);
        // Sin Google (sin créditos) no se marca: se reintenta cuando vuelva.
        if (GOOGLE_LIVE && !serperOff) {
          await this.saveFill(r.id, { ...base, source: `official:${new URL(link.store.origin).host}`, status: "skipped", imageUrl: null, error: OFFICIAL_STORE_NO_PHOTO_ERROR });
        }
      }
    }
    this.logger.log(`[web] Segunda búsqueda de fotos: ${found} de ${todo.length} con foto segura de internet${pendingSerper ? ` (${pendingSerper} esperan a Google: Serper sin créditos)` : ""}`);
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
