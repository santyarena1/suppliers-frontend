import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { CRON_TZ, cronsAreGloballyEnabled, shouldRunScheduledJob } from "../common/cron-window";
import { PrismaService } from "../prisma/prisma.service";
import { ACUSTOCK_SOURCE, PlatformContentService } from "./platform-content.service";

/** Sin una importación buena en este tiempo, al arrancar se corre una (no se espera a las 6:30). */
export const CATCH_UP_AFTER_MS = 20 * 60 * 60_000;
/** Espera tras arrancar, para no competir con el arranque del servidor. */
const CATCH_UP_DELAY_MS = 90_000;

/** Hace falta ponerse al día: nunca hubo una importación completa buena o la última es vieja. */
export function needsCatchUp(lastOkAt: Date | null, now = new Date()): boolean {
  return !lastOkAt || now.getTime() - lastOkAt.getTime() > CATCH_UP_AFTER_MS;
}

/**
 * Fichas de AcuStock al día sin que nadie tenga que importarlas: una corrida
 * completa por día (cruza con el catálogo entero, así que no puede ser parcial)
 * y, al arrancar, una de recuperación si la última buena es de hace más de 20 h.
 * Si otra réplica ya la está corriendo, `start` lo rechaza y esta se saltea.
 */
@Injectable()
export class PlatformContentSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PlatformContentSchedulerService.name);
  private catchUpTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly content: PlatformContentService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onApplicationBootstrap() {
    if (!cronsAreGloballyEnabled() || this.disabled()) return;
    this.catchUpTimer = setTimeout(() => void this.catchUp(), CATCH_UP_DELAY_MS);
    this.catchUpTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.catchUpTimer) clearTimeout(this.catchUpTimer);
  }

  /** 6:30 Argentina, apenas abre la ventana de crons: el armador arranca el día con lo último. */
  @Cron("30 6 * * *", { timeZone: CRON_TZ })
  async tick() {
    if (!shouldRunScheduledJob() || this.disabled()) return;
    await this.run("diaria");
  }

  /** La de recuperación no espera la ventana de crons: de noche no hay otros trabajos corriendo. */
  async catchUp() {
    const last = await this.prisma.platformContentImportRun.findFirst({
      where: { source: ACUSTOCK_SOURCE, mode: "APPLY", status: "OK" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    if (!needsCatchUp(last?.finishedAt ?? null)) return;
    await this.run("de recuperación");
  }

  private disabled() {
    return this.config.get("PLATFORM_CONTENT_CRON_DISABLED") === "true" || !this.content.isConfigured();
  }

  private async run(kind: string) {
    try {
      const { runId } = await this.content.start("APPLY");
      this.logger.log(`Importación ${kind} de fichas de AcuStock iniciada (${runId})`);
    } catch (err) {
      this.logger.debug(`Importación ${kind} de fichas: no arrancó (${(err as Error).message})`);
    }
  }
}
