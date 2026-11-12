import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { domainEvents } from "../common/events/domain-events";
import { OFFICIAL_STORE_NO_PHOTO_ERROR, OFFICIAL_STORE_PENDING_ERROR } from "../images/image-sync-candidates";
import { PrismaService } from "../prisma/prisma.service";
import { OFFICIAL_STORE_HOSTS, officialStoreLink, pickOfficialImages } from "./official-store-images";
import { httpGet } from "./sources/http";
import { ShopifyProduct } from "./sources/manufacturers/shopify";

/** Pausa entre fichas de una misma tienda (Shopify corta con 429 si vamos rápido). */
const GAP_MS = 1500;
const RETRY_WAIT_MS = [20_000, 60_000];
const BOOT_DELAY_MS = 45_000;
/** Si una tienda no respondió, se reintenta más tarde. */
const PENDING_RETRY_MS = 30 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fotos de Aula, IROK y ATK desde su tienda oficial. Las listas traen el link a
 * la ficha de cada producto: se lee esa ficha y se toma solo la foto de su
 * variante (color, idioma, switch). Si no hay certeza, queda sin foto y Serper
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
      if (fill?.source.startsWith("official:") && fill.query === r.productUrl && fill.error !== OFFICIAL_STORE_PENDING_ERROR) return false;
      if (!hasImage) return true;
      return Boolean(fill && fill.source.startsWith("serper") && fill.status === "filled");
    });
    if (todo.length === 0) return { filled: 0, withoutPhoto: 0, pending: 0 };

    const byHandle = new Map<string, typeof todo>();
    for (const r of todo) {
      const link = officialStoreLink(r.productUrl);
      if (!link) continue;
      const key = `${link.store.origin}|${link.handle}`;
      byHandle.set(key, [...(byHandle.get(key) ?? []), r]);
    }

    let filled = 0;
    let withoutPhoto = 0;
    let pending = 0;
    for (const [key, items] of byHandle) {
      const [origin, handle] = key.split("|");
      const product = await this.fetchProduct(origin, handle);
      for (const r of items) {
        const fromSerper = r.imageFills[0]?.source.startsWith("serper") ?? false;
        const base = { provider: r.provider, externalId: r.externalId, name: r.name, brand: r.brand, query: r.productUrl ?? "" };
        const source = `official:${new URL(origin).host}`;
        if (product === "unavailable") {
          pending += 1;
          await this.saveFill(r.id, { ...base, source, status: "skipped", imageUrl: null, error: OFFICIAL_STORE_PENDING_ERROR });
          continue;
        }
        const pick = product ? pickOfficialImages(product, { name: r.name, ean: r.ean }) : { images: [], note: "la ficha del link ya no existe" };
        if (pick.images.length) {
          await this.prisma.providerSyncCache.update({ where: { id: r.id }, data: { imageUrl: pick.images[0] } });
          await this.saveFill(r.id, { ...base, source, status: "filled", imageUrl: pick.images[0], error: null });
          this.logger.log(`[foto] ${r.provider} ${r.externalId} «${r.name}» → ${pick.note}: ${pick.images[0]}`);
          filled += 1;
        } else {
          // Una foto de Google puede ser de otro color: si la había puesto Serper, se saca.
          if (fromSerper) await this.prisma.providerSyncCache.update({ where: { id: r.id }, data: { imageUrl: null } });
          await this.saveFill(r.id, { ...base, source, status: "skipped", imageUrl: null, error: OFFICIAL_STORE_NO_PHOTO_ERROR });
          this.logger.log(`[sin foto] ${r.provider} ${r.externalId} «${r.name}» → ${pick.note} (${r.productUrl})`);
          withoutPhoto += 1;
        }
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

  /** La ficha `.js` de Shopify; `null` si no existe, "unavailable" si la tienda no respondió. */
  private async fetchProduct(origin: string, handle: string): Promise<ShopifyProduct | null | "unavailable"> {
    const url = `${origin}/products/${encodeURIComponent(handle)}.js`;
    for (let attempt = 0; ; attempt++) {
      await sleep(GAP_MS);
      try {
        const res = await httpGet(url);
        if (res.status === 200) return JSON.parse(res.buffer.toString("utf8")) as ShopifyProduct;
        if (res.status === 404) return null;
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
