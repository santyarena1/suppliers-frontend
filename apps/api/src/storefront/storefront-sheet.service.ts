import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import type { Provider } from "@nodo/shared";
import { createHash } from "node:crypto";
import { shouldRunScheduledJob } from "../common/cron-window";
import { ListImportService } from "../list-import/list-import.service";
import { PrismaService } from "../prisma/prisma.service";
import { fetchSheetCsv, fetchSheetWorkbook, parseSheetUrl, SheetFetchError, sheetViewUrl, type SheetRef } from "./sheet-source";
import {
  missingTabMessage,
  SheetWorkbook,
  tabAsWorkbook,
  tabFileName,
  tabHash,
  tabsStateOf,
  type SheetTabsState,
} from "./sheet-tabs";

/** Entre dos "Sincronizar ahora" del dueño. */
const MANUAL_COOLDOWN_MS = 60 * 1000;
/** Planillas que se leen a la vez en la ronda automática. */
const SYNC_CONCURRENCY = 4;

type Fetcher = (ref: SheetRef) => Promise<Buffer>;
type WorkbookFetcher = (sheetId: string) => Promise<Buffer>;
type SyncResult = { changed: boolean; importId: string | null; error: string | null };

/** Columnas de la tienda que usa la sincronización. */
type SheetRow = {
  id: string;
  retailerTenantId: string;
  sheetId: string | null;
  sheetGid: string | null;
  sheetTab: string | null;
  sheetTabs: Prisma.JsonValue | null;
  sheetHash: string | null;
  sheetError: string | null;
  sheetLinkedByUserId: string | null;
};

/** De dónde sale la pestaña que se lee, para explicárselo al dueño. */
export type SheetTabSource = "CHOSEN" | "MOST_ROWS" | "LINK";

/**
 * Catálogo de la tienda desde Google Sheets: el dueño conecta su planilla
 * (compartida como lector) y NODO la baja cada 15 minutos. Si cambió, entra como
 * una planilla subida a mano (mismo importador, misma revisión, mismo revertir).
 * Si no cambió, no se procesa nada. El contenido es solo datos: el importador
 * lo lee como texto y números, nunca lo ejecuta.
 *
 * Qué pestaña se lee: la elegida por nombre (`sheetTab`). Las tiendas que se
 * conectaron con un link que nombraba una pestaña (y las vinculadas antes de
 * poder elegir) leen la del gid del link, como siempre, hasta que elijan otra.
 */
@Injectable()
export class StorefrontSheetService {
  private readonly logger = new Logger(StorefrontSheetService.name);
  private readonly running = new Set<string>();
  private syncingAll = false;
  /** Reemplazables en tests. */
  fetcher: Fetcher = (ref) => fetchSheetCsv(ref);
  workbookFetcher: WorkbookFetcher = (sheetId) => fetchSheetWorkbook(sheetId);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imports: ListImportService
  ) {}

  /** Lo que ve el dueño de su planilla conectada (nunca se manda a compradores). */
  static view(sf: {
    sheetId: string | null;
    sheetGid: string | null;
    sheetTab?: string | null;
    sheetTabs?: Prisma.JsonValue | null;
    sheetCheckedAt: Date | null;
    sheetChangedAt: Date | null;
    sheetError: string | null;
    sheetImportId: string | null;
  }) {
    if (!sf.sheetId) return null;
    const state = tabsStateOf(sf.sheetTabs);
    const tabSource: SheetTabSource = sf.sheetTab ? (state.autoPicked ? "MOST_ROWS" : "CHOSEN") : "LINK";
    return {
      url: sheetViewUrl({ sheetId: sf.sheetId, gid: sf.sheetGid ?? "0" }),
      checkedAt: sf.sheetCheckedAt?.toISOString() ?? null,
      changedAt: sf.sheetChangedAt?.toISOString() ?? null,
      error: sf.sheetError,
      importId: sf.sheetImportId,
      /** Pestaña que se está leyendo. `null`: la del link, sin saber cómo se llama. */
      tab: sf.sheetTab ?? state.linkTab,
      tabSource,
      /** Todas las pestañas de la planilla en la última lectura (vacío si todavía no se pudo ver). */
      tabs: state.tabs,
    };
  }

  /** Conecta la planilla: la prueba en el momento y, si se puede leer, la carga. */
  async link(storefrontId: string, userId: string, rawUrl: string) {
    const ref = parseSheetUrl(rawUrl);
    if ("error" in ref) throw new BadRequestException(ref.error);
    const reset = {
      sheetId: ref.sheetId,
      sheetGid: ref.gid,
      sheetLinkedByUserId: userId,
      sheetHash: null,
      sheetError: null,
      sheetCheckedAt: null,
      sheetChangedAt: null,
      sheetImportId: null,
    };

    // El link nombra una pestaña: se lee esa, por su gid, como siempre.
    if (ref.explicitGid) {
      const csv = await this.ownerFetch(() => this.fetcher(ref));
      if (csv.length === 0 || !csv.toString("utf8").trim()) throw new BadRequestException("La pestaña está vacía");
      const state = await this.linkTabsOf(ref.sheetId, csv);
      await this.prisma.storefront.update({
        where: { id: storefrontId },
        data: { ...reset, sheetTab: null, sheetTabs: state as unknown as Prisma.InputJsonValue },
      });
      return this.syncOne(storefrontId, { prefetchedCsv: csv });
    }

    // Sin pestaña en el link: la de más productos, y se le muestra cuál es.
    const buffer = await this.ownerFetch(() => this.workbookFetcher(ref.sheetId));
    const workbook = this.ownerRead(buffer);
    const best = workbook.bestTab();
    if (!best) throw new BadRequestException("No encontramos una tabla de productos en ninguna pestaña de la planilla");
    const state: SheetTabsState = { tabs: workbook.tabs, linkTab: null, autoPicked: true };
    await this.prisma.storefront.update({
      where: { id: storefrontId },
      data: { ...reset, sheetTab: best, sheetTabs: state as unknown as Prisma.InputJsonValue },
    });
    return this.syncOne(storefrontId, { prefetchedWorkbook: buffer });
  }

  /**
   * El dueño elige qué pestaña es la de productos. Se guarda por nombre y se lee
   * en el momento. Una carga en revisión de la pestaña anterior se descarta: ya
   * no corresponde.
   */
  async chooseTab(storefrontId: string, rawName: string) {
    const name = (rawName ?? "").trim();
    if (!name) throw new BadRequestException("Elegí una pestaña");
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, select: { sheetId: true, sheetTabs: true, sheetImportId: true } });
    if (!sf?.sheetId) throw new NotFoundException("No tenés una planilla conectada");
    const buffer = await this.ownerFetch(() => this.workbookFetcher(sf.sheetId!));
    const workbook = this.ownerRead(buffer);
    const grid = workbook.find(name);
    if (!grid) throw new BadRequestException(missingTabMessage(name));
    if (sf.sheetImportId) {
      await this.prisma.supplierListImport.updateMany({
        where: { id: sf.sheetImportId, status: "NEEDS_REVIEW" },
        data: { status: "DISCARDED", normalizedRows: Prisma.DbNull },
      });
    }
    const state: SheetTabsState = { ...tabsStateOf(sf.sheetTabs), tabs: workbook.tabs, autoPicked: false };
    await this.prisma.storefront.update({
      where: { id: storefrontId },
      data: { sheetTab: grid.name, sheetTabs: state as unknown as Prisma.InputJsonValue, sheetHash: null, sheetError: null },
    });
    return this.syncOne(storefrontId, { prefetchedWorkbook: buffer });
  }

  async unlink(storefrontId: string) {
    await this.prisma.storefront.update({
      where: { id: storefrontId },
      data: {
        sheetId: null,
        sheetGid: null,
        sheetTab: null,
        sheetTabs: Prisma.DbNull,
        sheetLinkedByUserId: null,
        sheetHash: null,
        sheetError: null,
        sheetCheckedAt: null,
        sheetChangedAt: null,
        sheetImportId: null,
      },
    });
  }

  /** "Sincronizar ahora" del dueño, con un minuto de espera entre uno y otro. También vuelve a mirar las pestañas. */
  async syncNow(storefrontId: string) {
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, select: { sheetId: true, sheetCheckedAt: true } });
    if (!sf?.sheetId) throw new NotFoundException("No tenés una planilla conectada");
    if (sf.sheetCheckedAt && Date.now() - sf.sheetCheckedAt.getTime() < MANUAL_COOLDOWN_MS) {
      throw new BadRequestException("Recién la revisamos. Esperá un minuto y probá de nuevo.");
    }
    return this.syncOne(storefrontId, { refreshTabs: true });
  }

  /**
   * Baja la planilla y, si cambió, la carga. Nunca corre dos veces a la vez para
   * la misma tienda, y no apila cargas: si la anterior sigue en proceso o en
   * revisión, espera.
   */
  async syncOne(
    storefrontId: string,
    opts: { prefetchedCsv?: Buffer; prefetchedWorkbook?: Buffer; refreshTabs?: boolean } = {}
  ): Promise<SyncResult> {
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

      return sf.sheetTab
        ? await this.syncByTab(sf, provider as Provider, now, opts.prefetchedWorkbook)
        : await this.syncByGid(sf, provider as Provider, now, opts);
    } finally {
      this.running.delete(storefrontId);
    }
  }

  /** Pestaña elegida por nombre: se baja la planilla entera y se carga esa pestaña sola. */
  private async syncByTab(sf: SheetRow, provider: Provider, now: Date, prefetched?: Buffer): Promise<SyncResult> {
    const tab = sf.sheetTab!;
    let workbook: SheetWorkbook;
    try {
      workbook = SheetWorkbook.read(prefetched ?? (await this.workbookFetcher(sf.sheetId!)));
    } catch (err) {
      return this.failed(sf, err, now);
    }
    const state: SheetTabsState = { ...tabsStateOf(sf.sheetTabs), tabs: workbook.tabs };
    const grid = workbook.find(tab);
    if (!grid) {
      await this.prisma.storefront.update({ where: { id: sf.id }, data: { sheetTabs: state as unknown as Prisma.InputJsonValue } });
      return this.failed(sf, new SheetFetchError(missingTabMessage(tab)), now);
    }
    const hash = tabHash(grid);
    if (hash === sf.sheetHash) {
      await this.prisma.storefront.update({
        where: { id: sf.id },
        data: { sheetCheckedAt: now, sheetError: null, sheetTabs: state as unknown as Prisma.InputJsonValue },
      });
      return { changed: false, importId: null, error: null };
    }
    return this.load(sf, provider, now, hash, { buffer: tabAsWorkbook(grid), filename: tabFileName(grid.name) }, state);
  }

  /** Pestaña del link (por gid): se baja como CSV, igual que antes de poder elegir. */
  private async syncByGid(
    sf: SheetRow,
    provider: Provider,
    now: Date,
    opts: { prefetchedCsv?: Buffer; refreshTabs?: boolean }
  ): Promise<SyncResult> {
    let csv: Buffer;
    try {
      csv = opts.prefetchedCsv ?? (await this.fetcher({ sheetId: sf.sheetId!, gid: sf.sheetGid ?? "0" }));
    } catch (err) {
      return this.failed(sf, err, now);
    }
    const hash = createHash("sha256").update(csv).digest("hex");
    // Las pestañas se vuelven a mirar si cambió algo, si nunca se vieron o si lo pide el dueño.
    const lookTabs = !opts.prefetchedCsv && (opts.refreshTabs || hash !== sf.sheetHash || tabsStateOf(sf.sheetTabs).tabs.length === 0);
    const state = lookTabs ? await this.linkTabsOf(sf.sheetId!, csv, tabsStateOf(sf.sheetTabs)) : null;
    const tabsData = state ? { sheetTabs: state as unknown as Prisma.InputJsonValue } : {};
    if (hash === sf.sheetHash) {
      await this.prisma.storefront.update({ where: { id: sf.id }, data: { sheetCheckedAt: now, sheetError: null, ...tabsData } });
      return { changed: false, importId: null, error: null };
    }
    return this.load(sf, provider, now, hash, { buffer: csv, filename: "google-sheets.csv" }, state);
  }

  private async load(
    sf: SheetRow,
    provider: Provider,
    now: Date,
    hash: string,
    file: { buffer: Buffer; filename: string },
    state: SheetTabsState | null
  ): Promise<SyncResult> {
    try {
      const created = await this.imports.uploadStorefrontSheet(provider, sf.sheetLinkedByUserId!, file);
      await this.prisma.storefront.update({
        where: { id: sf.id },
        data: {
          sheetCheckedAt: now,
          sheetChangedAt: now,
          sheetHash: hash,
          sheetError: null,
          sheetImportId: created.id,
          ...(state ? { sheetTabs: state as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      return { changed: true, importId: created.id, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordError(sf, `No se pudo cargar la planilla: ${message}`, now);
      return { changed: false, importId: null, error: message };
    }
  }

  private async failed(sf: SheetRow, err: unknown, now: Date): Promise<SyncResult> {
    const message = err instanceof SheetFetchError ? err.message : "No pudimos leer la planilla. Probamos de nuevo más tarde.";
    await this.recordError(sf, message, now);
    return { changed: false, importId: null, error: message };
  }

  /**
   * Pestañas de la planilla y cuál es la del link. Si no se puede bajar entera,
   * se sigue igual: la pestaña del link se lee por su cuenta.
   */
  private async linkTabsOf(sheetId: string, csv: Buffer, previous: SheetTabsState = tabsStateOf(null)): Promise<SheetTabsState> {
    try {
      const workbook = SheetWorkbook.read(await this.workbookFetcher(sheetId));
      return { tabs: workbook.tabs, linkTab: workbook.matchCsv(csv), autoPicked: false };
    } catch (err) {
      this.logger.warn(`Pestañas de la planilla ${sheetId}: ${err instanceof Error ? err.message : String(err)}`);
      return previous;
    }
  }

  /** Para lo que dispara el dueño: el error de Google le llega tal cual. */
  private async ownerFetch(run: () => Promise<Buffer>): Promise<Buffer> {
    try {
      return await run();
    } catch (err) {
      throw new BadRequestException(err instanceof SheetFetchError ? err.message : "No pudimos leer la planilla");
    }
  }

  private ownerRead(buffer: Buffer): SheetWorkbook {
    try {
      return SheetWorkbook.read(buffer);
    } catch (err) {
      throw new BadRequestException(err instanceof SheetFetchError ? err.message : "No pudimos leer la planilla");
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
