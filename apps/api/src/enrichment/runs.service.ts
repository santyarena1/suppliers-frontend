import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StartRunDto } from "./dto/enrichment.dto";
import { masterWhere } from "./masters.service";
import { EnrichmentPipelineService, PipelineBudget } from "./pipeline.service";

/** Productos que se procesan a la vez (las fuentes tienen su propio ritmo). */
const CONCURRENCY = 3;
/** Cada cuántos productos se guarda el progreso. */
const PROGRESS_EVERY = 5;
const MAX_LOG_LINES = 200;
/** Una muestra elige al azar entre los maestros del filtro. */
const SAMPLE_POOL = 5000;

interface LogLine {
  at: string;
  masterId?: string;
  msg: string;
}

/**
 * Corridas en segundo plano (muestra, filtro o lista de ids): progreso, tope
 * de productos, tope de costo de IA y cancelación. Una sola a la vez.
 */
@Injectable()
export class RunsService implements OnModuleInit {
  private readonly logger = new Logger(RunsService.name);
  private active: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: EnrichmentPipelineService
  ) {}

  /** Si la API se reinició a mitad de una corrida, queda marcada como cortada. */
  async onModuleInit(): Promise<void> {
    await this.prisma.enrichmentRun
      .updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED", error: "La API se reinició durante la corrida", finishedAt: new Date() } })
      .catch((err: unknown) => this.logger.warn(`No se pudieron cerrar corridas viejas: ${String(err)}`));
  }

  async list(limit = 20) {
    return this.prisma.enrichmentRun.findMany({ orderBy: { startedAt: "desc" }, take: limit });
  }

  async get(id: string) {
    const run = await this.prisma.enrichmentRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Corrida no encontrada");
    return run;
  }

  async cancel(id: string) {
    const run = await this.get(id);
    if (run.status !== "RUNNING") return run;
    return this.prisma.enrichmentRun.update({ where: { id }, data: { cancelRequested: true } });
  }

  private async selectIds(dto: StartRunDto): Promise<string[]> {
    if (dto.kind === "ids") {
      if (!dto.masterIds?.length) throw new BadRequestException("Faltan los productos");
      return dto.masterIds.slice(0, dto.maxItems);
    }
    const where: Prisma.CatalogMasterWhereInput = {
      AND: [masterWhere(dto.filter), ...(dto.onlyNew ? [{ status: "NEW" as const }] : []), { status: { not: "ENRICHING" as const } }],
    };
    if (dto.kind === "filter") {
      const rows = await this.prisma.catalogMaster.findMany({ where, select: { id: true }, orderBy: [{ memberCount: "desc" }, { id: "asc" }], take: dto.maxItems });
      return rows.map((r) => r.id);
    }
    const pool = await this.prisma.catalogMaster.findMany({ where, select: { id: true }, take: SAMPLE_POOL });
    const shuffled = pool.map((r) => ({ id: r.id, k: Math.random() })).sort((a, b) => a.k - b.k);
    return shuffled.slice(0, dto.maxItems).map((r) => r.id);
  }

  /** Arranca una corrida y devuelve enseguida; el trabajo sigue en segundo plano. */
  async start(dto: StartRunDto, userId: string) {
    if (this.active) throw new ConflictException("Ya hay una corrida en curso");
    const ids = await this.selectIds(dto);
    if (ids.length === 0) throw new BadRequestException("No hay productos que coincidan");
    const run = await this.prisma.enrichmentRun.create({
      data: {
        kind: dto.kind,
        filter: (dto.filter ?? (dto.masterIds ? { masterIds: dto.masterIds.length } : undefined)) as Prisma.InputJsonValue | undefined,
        total: ids.length,
        maxItems: dto.maxItems,
        maxCostUsd: dto.maxCostUsd,
        startedById: userId,
      },
    });
    this.active = run.id;
    void this.execute(run.id, ids, dto.maxCostUsd).finally(() => {
      this.active = null;
    });
    return run;
  }

  /** Enriquecer un solo producto, esperando el resultado (botón del detalle). */
  async runOne(masterId: string, userId: string) {
    if (this.active) throw new ConflictException("Hay una corrida en curso: esperá a que termine o cancelala");
    const run = await this.prisma.enrichmentRun.create({ data: { kind: "one", total: 1, maxItems: 1, maxCostUsd: 0.5, startedById: userId, filter: { masterId } } });
    this.active = run.id;
    try {
      return await this.execute(run.id, [masterId], 0.5);
    } finally {
      this.active = null;
    }
  }

  async execute(runId: string, ids: string[], maxCostUsd: number) {
    const state = { processed: 0, failed: 0, proposals: 0, aiCalls: 0, cost: 0, log: [] as LogLine[], cancelled: false };
    const budget: PipelineBudget = {
      canSpend: () => state.cost < maxCostUsd,
      onAiCall: (c) => {
        state.aiCalls++;
        state.cost += c;
      },
    };
    const note = (msg: string, masterId?: string) => {
      state.log.push({ at: new Date().toISOString(), msg, ...(masterId ? { masterId } : {}) });
      if (state.log.length > MAX_LOG_LINES) state.log.splice(0, state.log.length - MAX_LOG_LINES);
    };
    const save = (extra: Prisma.EnrichmentRunUpdateInput = {}) =>
      this.prisma.enrichmentRun.update({
        where: { id: runId },
        data: {
          processed: state.processed,
          failed: state.failed,
          proposals: state.proposals,
          aiCalls: state.aiCalls,
          estCostUsd: Math.round(state.cost * 10000) / 10000,
          log: state.log as unknown as Prisma.InputJsonValue,
          ...extra,
        },
      });

    let cursor = 0;
    let costCapNoted = false;
    const worker = async () => {
      for (;;) {
        if (state.cancelled) return;
        const i = cursor++;
        if (i >= ids.length) return;
        const masterId = ids[i];
        try {
          const out = await this.pipeline.enrichMaster(masterId, { runId, budget });
          state.proposals += out.proposals;
          if (out.notes.length) note(out.notes.join(" · "), masterId);
        } catch (err) {
          state.failed++;
          note(`error: ${err instanceof Error ? err.message : String(err)}`, masterId);
        }
        state.processed++;
        if (!costCapNoted && !budget.canSpend()) {
          costCapNoted = true;
          note(`tope de costo de IA alcanzado (US$ ${maxCostUsd}): sigue sin IA`);
        }
        if (state.processed % PROGRESS_EVERY === 0) {
          const fresh = await this.prisma.enrichmentRun.findUnique({ where: { id: runId }, select: { cancelRequested: true } });
          if (fresh?.cancelRequested) state.cancelled = true;
          await save();
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
      const finalCancel = state.cancelled || (await this.prisma.enrichmentRun.findUnique({ where: { id: runId }, select: { cancelRequested: true } }))?.cancelRequested;
      return await save({ status: finalCancel && state.processed < ids.length ? "CANCELLED" : "DONE", finishedAt: new Date() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`run ${runId}: ${message}`);
      return save({ status: "FAILED", error: message, finishedAt: new Date() });
    }
  }
}
