import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { Prisma } from "@prisma/client";
import { CryptoService } from "../common/crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildImageSearchQuery, hasProductImage } from "./product-image";
import { SerperImagesClient } from "./serper-images.client";

const SETTINGS_ID = "default";
const DEFAULT_BATCH = 50;
const PAUSE_MS = 180;
const BATCH_PAUSE_MS = 400;
const STALE_MS = 15 * 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const missingImage: Prisma.ProviderSyncCacheWhereInput = {
  OR: [{ imageUrl: null }, { imageUrl: "" }],
};

function assertProvider(value: string | undefined): Provider | undefined {
  if (!value?.trim()) return undefined;
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

@Injectable()
export class ImageSyncService implements OnModuleInit {
  private readonly logger = new Logger(ImageSyncService.name);
  private running = false;
  private cancelRequested = false;
  private activeRunId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly serper: SerperImagesClient
  ) {}

  async onModuleInit() {
    await this.prisma.imageSyncRun.updateMany({
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

  requestStop() {
    if (!this.running) return { stopped: false };
    this.cancelRequested = true;
    return { stopped: true };
  }

  async hasSerperKey() {
    const row = await this.prisma.imageSyncSettings.findUnique({ where: { id: SETTINGS_ID } });
    return Boolean(row?.serperApiKeyEncrypted);
  }

  async saveSerperKey(apiKey: string) {
    const trimmed = apiKey.trim();
    if (trimmed.length < 8) throw new BadRequestException("La API key de Serper es demasiado corta");
    const encrypted = this.crypto.encrypt(trimmed);
    await this.prisma.imageSyncSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, serperApiKeyEncrypted: encrypted },
      update: { serperApiKeyEncrypted: encrypted },
    });
    return { hasSerperKey: true };
  }

  async clearSerperKey() {
    await this.prisma.imageSyncSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, serperApiKeyEncrypted: null },
      update: { serperApiKeyEncrypted: null },
    });
    return { hasSerperKey: false };
  }

  private async readApiKey(): Promise<string> {
    const row = await this.prisma.imageSyncSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row?.serperApiKeyEncrypted) {
      throw new BadRequestException("Cargá la API key de Serper antes de sincronizar fotos");
    }
    try {
      return this.crypto.decrypt(row.serperApiKeyEncrypted);
    } catch {
      throw new BadRequestException("No se pudo leer la API key de Serper. Volvé a guardarla.");
    }
  }

  private missingWhere(provider?: Provider): Prisma.ProviderSyncCacheWhereInput {
    return provider ? { provider, AND: [missingImage] } : missingImage;
  }

  async status() {
    await this.markStaleRuns();
    const [hasSerperKey, missing, lastRun, byProvider] = await Promise.all([
      this.hasSerperKey(),
      this.prisma.providerSyncCache.count({ where: missingImage }),
      this.prisma.imageSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      this.prisma.providerSyncCache.groupBy({
        by: ["provider"],
        where: missingImage,
        _count: { _all: true },
      }),
    ]);
    const totals = await this.prisma.providerSyncCache.groupBy({
      by: ["provider"],
      _count: { _all: true },
    });
    const totalBy = new Map(totals.map((r) => [r.provider, r._count._all]));
    return {
      hasSerperKey,
      missing,
      running: this.running,
      byProvider: byProvider
        .map((r) => ({
          provider: r.provider,
          missing: r._count._all,
          total: totalBy.get(r.provider) ?? r._count._all,
        }))
        .sort((a, b) => b.missing - a.missing),
      lastRun: lastRun ? this.serializeRun(lastRun) : null,
    };
  }

  async listMissing(take = 20, provider?: string) {
    const p = assertProvider(provider);
    const rows = await this.prisma.providerSyncCache.findMany({
      where: this.missingWhere(p),
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(take, 1), 50),
      select: {
        id: true,
        provider: true,
        externalId: true,
        name: true,
        brand: true,
        sku: true,
        ean: true,
        partNumber: true,
      },
    });
    return {
      items: rows.map((r) => ({
        ...r,
        query: buildImageSearchQuery(r),
      })),
    };
  }

  requestFirstPhoto(opts: { provider?: string; batchSize?: number; once?: boolean; startedById?: string }) {
    if (this.running) return { started: false, reason: "already_running" as const };
    const provider = assertProvider(opts.provider);
    const batchSize = Math.min(DEFAULT_BATCH, Math.max(1, opts.batchSize ?? DEFAULT_BATCH));
    void this.runFirstPhoto({
      provider,
      batchSize,
      once: Boolean(opts.once),
      startedById: opts.startedById,
    }).catch((err) => {
      this.logger.error(`Primera foto falló: ${err instanceof Error ? err.message : String(err)}`);
    });
    return { started: true as const };
  }

  async runFirstPhoto(opts: {
    provider?: Provider;
    batchSize: number;
    once: boolean;
    startedById?: string;
  }) {
    if (this.running) throw new Error("Ya hay una sincronización de imágenes en curso");
    const apiKey = await this.readApiKey();
    const where = this.missingWhere(opts.provider);
    const missingTotal = await this.prisma.providerSyncCache.count({ where });

    this.running = true;
    this.cancelRequested = false;
    const run = await this.prisma.imageSyncRun.create({
      data: {
        status: "RUNNING",
        kind: "first_photo",
        provider: opts.provider ?? null,
        batchSize: opts.batchSize,
        once: opts.once,
        missingTotal,
        startedById: opts.startedById ?? null,
      },
    });
    this.activeRunId = run.id;

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let lastQuery: string | null = null;
    let errorMessage: string | null = null;
    let status: "OK" | "ERROR" | "CANCELLED" = "OK";
    const tried = new Set<string>();

    try {
      while (!this.cancelRequested) {
        const batch = await this.prisma.providerSyncCache.findMany({
          where: {
            AND: [
              where,
              tried.size > 0 ? { id: { notIn: [...tried] } } : {},
            ],
          },
          orderBy: { updatedAt: "asc" },
          take: opts.batchSize,
          select: {
            id: true,
            provider: true,
            externalId: true,
            name: true,
            brand: true,
            sku: true,
            ean: true,
            partNumber: true,
            imageUrl: true,
          },
        });
        if (batch.length === 0) break;

        for (const product of batch) {
          if (this.cancelRequested) break;
          tried.add(product.id);
          if (hasProductImage(product.imageUrl)) {
            skipped += 1;
            processed += 1;
            continue;
          }
          const query = buildImageSearchQuery(product);
          lastQuery = query;
          if (!query) {
            skipped += 1;
            processed += 1;
            continue;
          }
          try {
            const url = await this.serper.firstPhoto(apiKey, query);
            if (!url) {
              skipped += 1;
            } else {
              const stillMissing = await this.prisma.providerSyncCache.updateMany({
                where: { id: product.id, OR: [{ imageUrl: null }, { imageUrl: "" }] },
                data: { imageUrl: url },
              });
              if (stillMissing.count > 0) updated += 1;
              else skipped += 1;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("API key de Serper no es válida")) {
              errorMessage = msg;
              status = "ERROR";
              throw err;
            }
            failed += 1;
            this.logger.warn(
              `Sin foto para ${product.provider}/${product.externalId}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
          processed += 1;
          await this.heartbeat(run.id, { processed, updated, skipped, failed, lastQuery });
          await sleep(PAUSE_MS);
        }

        if (opts.once) break;
        await sleep(BATCH_PAUSE_MS);
      }
      if (this.cancelRequested) status = "CANCELLED";
    } catch (err) {
      status = "ERROR";
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      await this.prisma.imageSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          processed,
          updated,
          skipped,
          failed,
          lastQuery,
          errorMessage,
          finishedAt: new Date(),
          heartbeatAt: new Date(),
        },
      });
      this.running = false;
      this.activeRunId = null;
      this.cancelRequested = false;
    }

    return { runId: run.id, processed, updated, skipped, failed, status };
  }

  private async heartbeat(
    runId: string,
    counters: { processed: number; updated: number; skipped: number; failed: number; lastQuery: string | null }
  ) {
    await this.prisma.imageSyncRun.update({
      where: { id: runId },
      data: { ...counters, heartbeatAt: new Date() },
    });
  }

  private async markStaleRuns() {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await this.prisma.imageSyncRun.updateMany({
      where: { status: "RUNNING", heartbeatAt: { lt: staleBefore } },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Sin progreso (timeout / proceso reiniciado)",
      },
    });
  }

  private serializeRun(run: {
    id: string;
    status: string;
    kind: string;
    provider: string | null;
    batchSize: number;
    once: boolean;
    missingTotal: number;
    processed: number;
    updated: number;
    skipped: number;
    failed: number;
    lastQuery: string | null;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    heartbeatAt: Date;
  }) {
    return {
      id: run.id,
      status: run.status,
      kind: run.kind,
      provider: run.provider,
      batchSize: run.batchSize,
      once: run.once,
      missingTotal: run.missingTotal,
      processed: run.processed,
      updated: run.updated,
      skipped: run.skipped,
      failed: run.failed,
      lastQuery: run.lastQuery,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      heartbeatAt: run.heartbeatAt,
    };
  }
}
