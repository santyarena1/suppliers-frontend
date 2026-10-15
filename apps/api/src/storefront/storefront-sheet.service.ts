import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Provider } from "@nodo/shared";
import { createHash } from "node:crypto";
import { shouldRunScheduledJob } from "../common/cron-window";
import { ListImportService } from "../list-import/list-import.service";
import { PrismaService } from "../prisma/prisma.service";
import { fetchSheetCsv, parseSheetUrl, SheetFetchError, sheetViewUrl, type SheetRef } from "./sheet-source";

/** Entre dos "Sincronizar ahora" del dueño. */
const MANUAL_COOLDOWN_MS = 60 * 1000;
/** Planillas que se leen a la vez en la ronda automática. */
const SYNC_CONCURRENCY = 4;

type Fetcher = (ref: SheetRef) => Promise<Buffer>;

/**
 * Catálogo de la tienda desde Google Sheets: el dueño conecta su planilla
 * (compartida como lector) y NODO la baja cada 15 minutos. Si cambió, entra como
 * una planilla subida a mano (mismo importador, misma revisión, mismo revertir).
 * Si no cambió, no se procesa nada. El contenido es solo datos: el importador
 * lo lee como texto y números, nunca lo ejecuta.
 */
@Injectable()
export class StorefrontSheetService {
  private readonly logger = new Logger(StorefrontSheetService.name);
  private readonly running = new Set<string>();
  private syncingAll = false;
  /** Reemplazable en tests. */
  fetcher: Fetcher = (ref) => fetchSheetCsv(ref);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ListImportService
  ) {}

  /** Lo que ve el dueño de su planilla conectada (nunca se manda a compradores). */
  static view(sf: {
    sheetId: string | null;
    sheetGid: string | null;
    sheetCheckedAt: Date | null;
    sheetChangedAt: Date | null;
    sheetError: string | null;
    sheetImportId: string | null;
  }) {
    if (!sf.sheetId) return null;
    return {
      url: sheetViewUrl({ sheetId: sf.sheetId, gid: sf.sheetGid ?? "0" }),
      checkedAt: sf.sheetCheckedAt?.toISOString() ?? null,
      changedAt: sf.sheetChangedAt?.toISOString() ?? null,
      error: sf.sheetError,
      importId: sf.sheetImportId,
    };
  }

  /** Conecta la planilla: la prueba en el momento y, si se puede leer, la carga. */
  async link(storefrontId: string, userId: string, rawUrl: string) {
    const ref = parseSheetUrl(rawUrl);
    if ("error" in ref) throw new BadRequestException(ref.error);
    let csv: Buffer;
    try {
      csv = await this.fetcher(ref);
    } catch (err) {
      throw new BadRequestException(err instanceof SheetFetchError ? err.message : "No pudimos leer la planilla");
    }
    if (csv.length === 0 || !csv.toString("utf8").trim()) throw new BadRequestException("La pestaña está vacía");
    await this.prisma.storefront.update({
      where: { id: storefrontId },
      data: {
        sheetId: ref.sheetId,
        sheetGid: ref.gid,
        sheetLinkedByUserId: userId,
        sheetHash: null,
        sheetError: null,
        sheetCheckedAt: null,
        sheetChangedAt: null,
        sheetImportId: null,
      },
    });
    return this.syncOne(storefrontId, { prefetched: csv });
  }

  async unlink(storefrontId: string) {
    await this.prisma.storefront.update({
      where: { id: storefrontId },
      data: { sheetId: null, sheetGid: null, sheetLinkedByUserId: null, sheetHash: null, sheetError: null, sheetCheckedAt: null, sheetChangedAt: null, sheetImportId: null },
    });
  }

  /** "Sincronizar ahora" del dueño, con un minuto de espera entre uno y otro. */
  async syncNow(storefrontId: string) {
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, select: { sheetId: true, sheetCheckedAt: true } });
    if (!sf?.sheetId) throw new NotFoundException("No tenés una planilla conectada");
    if (sf.sheetCheckedAt && Date.now() - sf.sheetCheckedAt.getTime() < MANUAL_COOLDOWN_MS) {
      throw new BadRequestException("Recién la revisamos. Esperá un minuto y probá de nuevo.");
    }
    return this.syncOne(storefrontId);
  }

  /**
   * Baja la planilla y, si cambió, la carga. Nunca corre dos veces a la vez para
   * la misma tienda, y no apila cargas: si la anterior sigue en proceso o en
   * revisión, espera.
   */
  async syncOne(storefrontId: string, opts: { prefetched?: Buffer } = {}): Promise<{ changed: boolean; importId: string | null; error: string | null }> {
    if (this.running.has(storefrontId)) return { changed: false, importId: null, error: null };
    this.running.add(storefrontId);
    try {
      const sf = await this.prisma.storefront.findUnique({
        where: { id: storefrontId },
        include: { supplierTenant: { select: { providerKey: true } } },
      });
      const provider = sf?.supplierTenant.providerKey;
      if (!sf?.sheetId || !provider || !sf.sheetLinkedByUserId) return { changed: false, importId: null, error: null };
      const now = new Date();

      if (sf.sheetImportId) {
        const last = await this.prisma.supplierListImport.findUnique({ where: { id: sf.sheetImportId }, select: { status: true } });
        if (last && (last.status === "PROCESSING" || last.status === "NEEDS_REVIEW")) {
          await this.prisma.storefront.update({ where: { id: sf.id }, data: { sheetCheckedAt: now } });
          return { changed: false, importId: sf.sheetImportId, error: null };
        }
      }

      let csv: Buffer;
      try {
        csv = opts.prefetched ?? (await this.fetcher({ sheetId: sf.sheetId, gid: sf.sheetGid ?? "0" }));
      } catch (err) {
        const message = err instanceof SheetFetchError ? err.message : "No pudimos leer la planilla. Probamos de nuevo más tarde.";
        await this.recordError(sf, message, now);
        return { changed: false, importId: null, error: message };
      }

      const hash = createHash("sha256").update(csv).digest("hex");
      if (hash === sf.sheetHash) {
        await this.prisma.storefront.update({ where: { id: sf.id }, data: { sheetCheckedAt: now, sheetError: null } });
        return { changed: false, importId: null, error: null };
      }
      try {
        const created = await this.imports.uploadStorefrontSheet(provider as Provider, sf.sheetLinkedByUserId, {
          buffer: csv,
          filename: "google-sheets.csv",
        });
        await this.prisma.storefront.update({
          where: { id: sf.id },
          data: { sheetCheckedAt: now, sheetChangedAt: now, sheetHash: hash, sheetError: null, sheetImportId: created.id },
        });
        return { changed: true, importId: created.id, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.recordError(sf, `No se pudo cargar la planilla: ${message}`, now);
        return { changed: false, importId: null, error: message };
      }
    } finally {
      this.running.delete(storefrontId);
    }
  }

  /** Guarda el error; el primero de una racha se avisa al dueño. */
  private async recordError(sf: { id: string; retailerTenantId: string; sheetError: string | null }, message: string, now: Date) {
    const alreadyFailing = Boolean(sf.sheetError);
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { sheetCheckedAt: now, sheetError: message.slice(0, 500) } });
    if (alreadyFailing) return;
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: sf.retailerTenantId,
        kind: "SYSTEM",
        title: "No pudimos leer tu Google Sheets",
        body: `${message} Tu tienda sigue con lo último que cargamos.`,
        landingKey: "storefront:sheet",
      },
    });
  }

  @Cron("*/15 * * * *")
  async syncAll() {
    // Si la ronda anterior todavía no terminó (Google lento), esta no arranca.
    if (!shouldRunScheduledJob() || this.syncingAll) return;
    this.syncingAll = true;
    try {
      const rows = await this.prisma.storefront.findMany({
        where: { sheetId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } },
        select: { id: true },
      });
      // De a 4: con 100 tiendas son ~25 tandas de menos de un segundo cada una.
      const queue = rows.map((r) => r.id);
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          await this.syncOne(id).catch((err) => this.logger.warn(`Google Sheets de ${id}: ${err instanceof Error ? err.message : String(err)}`));
        }
      };
      await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, queue.length) }, worker));
    } catch (err) {
      this.logger.warn(`Sincronización de Google Sheets: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.syncingAll = false;
    }
  }
}
