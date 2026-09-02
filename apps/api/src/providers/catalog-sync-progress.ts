import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CatalogSyncDiff } from "./catalog-sync-diff";

export const CATALOG_SYNC_CHANGE_CAP = 500;
export const CATALOG_SYNC_STALE_MS = 15 * 60_000;

export type CatalogSyncSource = "manual" | "cron" | "import";

export class CatalogSyncAlreadyRunningError extends Error {
  constructor() {
    super("Ya hay una sincronización en curso para este proveedor");
    this.name = "CatalogSyncAlreadyRunningError";
  }
}

export type CatalogSyncRunView = {
  id: string;
  provider: string;
  status: string;
  source: string;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  missingAffected: number;
  zeroStockAffected: number;
  expectedTotal: number;
  changesStored: number;
  changesTruncated: boolean;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  heartbeatAt: Date;
};

type PendingChange = {
  runId: string;
  externalId: string;
  name: string;
  action: string;
  changedFields: Prisma.InputJsonValue;
  before: Prisma.InputJsonValue | typeof Prisma.DbNull;
  after: Prisma.InputJsonValue;
};

/** Cierra corridas colgadas (deploy a mitad de un sync, proceso muerto). */
export async function interruptStaleCatalogSyncRuns(
  prisma: PrismaService,
  where: { tenantId?: string; provider?: string } = {},
  message = "Interrumpida (sin actividad)"
) {
  await prisma.catalogSyncRun.updateMany({
    where: {
      ...where,
      status: "RUNNING",
      heartbeatAt: { lt: new Date(Date.now() - CATALOG_SYNC_STALE_MS) },
    },
    data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
  });
}

export async function interruptRunningCatalogSyncRuns(
  prisma: PrismaService,
  message = "Interrumpida por reinicio del servidor"
) {
  await prisma.catalogSyncRun.updateMany({
    where: { status: "RUNNING" },
    data: { status: "ERROR", finishedAt: new Date(), errorMessage: message },
  });
}

export async function startCatalogSyncRun(
  prisma: PrismaService,
  opts: { tenantId: string; provider: string; source: CatalogSyncSource; expectedTotal: number }
): Promise<CatalogSyncProgress> {
  await interruptStaleCatalogSyncRuns(prisma, { tenantId: opts.tenantId, provider: opts.provider });
  const live = await prisma.catalogSyncRun.findFirst({
    where: { tenantId: opts.tenantId, provider: opts.provider, status: "RUNNING" },
    select: { id: true },
  });
  if (live) throw new CatalogSyncAlreadyRunningError();

  const run = await prisma.catalogSyncRun.create({
    data: {
      tenantId: opts.tenantId,
      provider: opts.provider,
      source: opts.source,
      expectedTotal: opts.expectedTotal,
      status: "RUNNING",
    },
  });
  return new CatalogSyncProgress(prisma, run.id);
}

export function serializeCatalogSyncRun(run: CatalogSyncRunView): CatalogSyncRunView {
  return {
    id: run.id,
    provider: run.provider,
    status: run.status,
    source: run.source,
    processed: run.processed,
    created: run.created,
    updated: run.updated,
    unchanged: run.unchanged,
    missingAffected: run.missingAffected,
    zeroStockAffected: run.zeroStockAffected,
    expectedTotal: run.expectedTotal,
    changesStored: run.changesStored,
    changesTruncated: run.changesTruncated,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    heartbeatAt: run.heartbeatAt,
  };
}

export class CatalogSyncProgress {
  processed = 0;
  created = 0;
  updated = 0;
  unchanged = 0;
  private pending: PendingChange[] = [];
  private stored = 0;
  private truncated = false;

  constructor(
    private readonly prisma: PrismaService,
    readonly runId: string
  ) {}

  record(diffs: CatalogSyncDiff[]) {
    for (const diff of diffs) {
      this.processed += 1;
      if (diff.action === "created") this.created += 1;
      else if (diff.action === "updated") this.updated += 1;
      else this.unchanged += 1;

      if (diff.action === "unchanged") continue;
      if (this.stored + this.pending.length >= CATALOG_SYNC_CHANGE_CAP) {
        this.truncated = true;
        continue;
      }
      this.pending.push({
        runId: this.runId,
        externalId: diff.externalId,
        name: diff.after.name || diff.externalId,
        action: diff.action,
        changedFields: diff.changedFields,
        before: diff.before === null ? Prisma.DbNull : (diff.before as unknown as Prisma.InputJsonValue),
        after: diff.after as unknown as Prisma.InputJsonValue,
      });
    }
  }

  async flush() {
    const pending = this.pending;
    this.pending = [];
    if (pending.length) {
      await this.prisma.catalogSyncChange.createMany({ data: pending });
      this.stored += pending.length;
    }
    await this.prisma.catalogSyncRun.update({
      where: { id: this.runId },
      data: {
        processed: this.processed,
        created: this.created,
        updated: this.updated,
        unchanged: this.unchanged,
        changesStored: this.stored,
        changesTruncated: this.truncated,
        heartbeatAt: new Date(),
      },
    });
  }

  async fail(message: string) {
    await this.flush().catch(() => undefined);
    await this.prisma.catalogSyncRun.update({
      where: { id: this.runId },
      data: {
        status: "ERROR",
        errorMessage: message.slice(0, 500),
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        processed: this.processed,
        created: this.created,
        updated: this.updated,
        unchanged: this.unchanged,
        changesStored: this.stored,
        changesTruncated: this.truncated,
      },
    });
  }

  async succeed(extra: { missingAffected: number; zeroStockAffected: number }) {
    await this.flush();
    const run = await this.prisma.catalogSyncRun.update({
      where: { id: this.runId },
      data: {
        status: "OK",
        errorMessage: null,
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        processed: this.processed,
        created: this.created,
        updated: this.updated,
        unchanged: this.unchanged,
        missingAffected: extra.missingAffected,
        zeroStockAffected: extra.zeroStockAffected,
        changesStored: this.stored,
        changesTruncated: this.truncated,
      },
    });
    return serializeCatalogSyncRun(run);
  }
}
