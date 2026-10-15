import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { shouldRunScheduledJob } from "../common/cron-window";
import { ImageSyncService } from "../images/image-sync.service";
import type { SerperImageHit } from "../images/product-image";
import { PrismaService } from "../prisma/prisma.service";
import {
  assetIdOf,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_STORE,
  sniffImage,
  STOREFRONT_ASSET_PURPOSE,
} from "./storefront-rules";

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
/** Búsquedas de fotos con Serper por tienda y por día. */
export const IMAGE_SEARCHES_PER_DAY = 25;

/** Día calendario en Argentina (UTC−3, sin horario de verano): el cupo se renueva a la medianoche local. */
export function argentinaDay(now: Date): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Una foto recién subida y todavía sin guardar en un producto no se borra antes de esto. */
const UPLOAD_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * Fotos de las tiendas: el navegador las achica y las pasa a WebP (~1200 px,
 * < 300 KB) antes de subirlas; acá se valida el tipo real, el tamaño y el tope
 * por tienda, y se guardan como cualquier asset (`/assets/<id>`, cache inmutable).
 * Las que ningún producto ni el logo usan se borran.
 */
@Injectable()
export class StorefrontImagesService {
  private readonly logger = new Logger(StorefrontImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imageSync: ImageSyncService
  ) {}

  /**
   * Fotos de internet para un producto (Serper, como «Primera foto»). Cada
   * búsqueda cuesta créditos: hay un tope por tienda y por día. Solo devuelve
   * links; la web baja la elegida por el proxy, la achica y la sube con `upload`.
   */
  async search(storefrontId: string, query: string): Promise<{ query: string; images: SerperImageHit[]; left: number }> {
    const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
    if (q.length < 3) throw new BadRequestException("Escribí al menos 3 letras para buscar la foto");
    const day = argentinaDay(new Date());
    // Suma una búsqueda solo si queda cupo hoy (atómico: dos pedidos a la vez no pasan el tope).
    const rows = await this.prisma.$queryRaw<{ imageSearchCount: number }[]>`
      UPDATE "Storefront"
      SET "imageSearchCount" = CASE WHEN "imageSearchDay" = ${day} THEN "imageSearchCount" + 1 ELSE 1 END,
          "imageSearchDay" = ${day}
      WHERE id = ${storefrontId}
        AND ("imageSearchDay" IS DISTINCT FROM ${day} OR "imageSearchCount" < ${IMAGE_SEARCHES_PER_DAY})
      RETURNING "imageSearchCount"`;
    if (rows.length === 0) {
      throw new HttpException(
        `Llegaste a las ${IMAGE_SEARCHES_PER_DAY} búsquedas de fotos de hoy. Mañana podés seguir, o subí la foto desde tu celular o PC.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    const used = rows[0].imageSearchCount;
    try {
      const images = await this.imageSync.searchImages(q, 12);
      return { query: q, images, left: Math.max(0, IMAGE_SEARCHES_PER_DAY - used) };
    } catch (err) {
      // Si Serper falla, la búsqueda no cuenta.
      await this.prisma.storefront.updateMany({
        where: { id: storefrontId, imageSearchDay: day, imageSearchCount: { gt: 0 } },
        data: { imageSearchCount: { decrement: 1 } },
      });
      this.logger.warn(`Búsqueda de fotos de tienda falló: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("La búsqueda de fotos no está disponible ahora. Probá en un rato o subí la foto.");
    }
  }

  async upload(retailerTenantId: string, file: { filename: string; buffer: Buffer }): Promise<{ url: string; bytes: number }> {
    if (file.buffer.length === 0) throw new BadRequestException("La foto llegó vacía");
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException("La foto pesa demasiado. Probá con otra o sacale una captura.");
    }
    const mime = sniffImage(file.buffer);
    if (!mime) throw new BadRequestException("Solo fotos JPG, PNG o WebP");
    const used = await this.prisma.storedAsset.count({
      where: { ownerTenantId: retailerTenantId, purpose: STOREFRONT_ASSET_PURPOSE },
    });
    if (used >= MAX_IMAGES_PER_STORE) {
      throw new BadRequestException(`Tu tienda llegó al máximo de ${MAX_IMAGES_PER_STORE} fotos. Borrá las de productos que ya no vendés.`);
    }
    const base = (file.filename || "foto").replace(/\.[^.]*$/, "").replace(/[^\w\- ]+/g, "").trim().slice(0, 80) || "foto";
    const asset = await this.prisma.storedAsset.create({
      data: {
        mimeType: mime,
        filename: `${base}${EXT[mime]}`,
        byteSize: file.buffer.length,
        data: file.buffer,
        ownerTenantId: retailerTenantId,
        purpose: STOREFRONT_ASSET_PURPOSE,
      },
      select: { id: true },
    });
    return { url: `/assets/${asset.id}`, bytes: file.buffer.length };
  }

  /** Cuáles de estos ids son fotos subidas por esta tienda. */
  async ownedIds(retailerTenantId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.storedAsset.findMany({
      where: { id: { in: ids }, ownerTenantId: retailerTenantId, purpose: STOREFRONT_ASSET_PURPOSE },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Borra las fotos de la tienda que ya no usa nadie: ni un producto, ni el logo.
   * `graceMs` protege las recién subidas que todavía no se guardaron.
   */
  async collect(storefrontId: string, graceMs = UPLOAD_GRACE_MS): Promise<number> {
    const sf = await this.prisma.storefront.findUnique({
      where: { id: storefrontId },
      select: { retailerTenantId: true, logoUrl: true },
    });
    if (!sf) return 0;
    const items = await this.prisma.storefrontItem.findMany({ where: { storefrontId }, select: { images: true } });
    const keep = new Set<string>();
    for (const ref of [sf.logoUrl, ...items.flatMap((i) => i.images)]) {
      const id = ref ? assetIdOf(ref) : null;
      if (id) keep.add(id);
    }
    const before = new Date(Date.now() - graceMs);
    const candidates = await this.prisma.storedAsset.findMany({
      where: { ownerTenantId: sf.retailerTenantId, purpose: STOREFRONT_ASSET_PURPOSE, createdAt: { lt: before } },
      select: { id: true },
    });
    const drop = candidates.map((c) => c.id).filter((id) => !keep.has(id));
    if (drop.length === 0) return 0;
    const res = await this.prisma.storedAsset.deleteMany({
      where: { id: { in: drop }, ownerTenantId: sf.retailerTenantId, purpose: STOREFRONT_ASSET_PURPOSE },
    });
    return res.count;
  }

  /** Una vez por día: fotos subidas que nunca se guardaron o que quedaron sin uso. */
  @Cron("40 4 * * *")
  async collectAll() {
    if (!shouldRunScheduledJob()) return;
    try {
      const stores = await this.prisma.storefront.findMany({ select: { id: true } });
      let total = 0;
      for (const s of stores) total += await this.collect(s.id);
      if (total) this.logger.log(`Fotos de tiendas sin uso borradas: ${total}`);
    } catch (err) {
      this.logger.warn(`Limpieza de fotos de tiendas: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
