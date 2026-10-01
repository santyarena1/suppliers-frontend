import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Cada cuánto se vuelcan los contadores a la base. */
const FLUSH_MS = 60_000;
/** Historia que se guarda de métricas y errores. */
const RETENTION_DAYS = 30;
/** Tope de errores en memoria entre volcados (un pico no llena la RAM). */
const MAX_PENDING_ERRORS = 500;

type Counter = { hourStart: Date; method: string; route: string; status: number; count: number; totalMs: number; maxMs: number };

export type ErrorEventInput = {
  method: string;
  route: string;
  status: number;
  message: string;
  userId?: string | null;
  tenantId?: string | null;
};

export function hourStartOf(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Cuenta cada respuesta del API por hora, ruta y código, en memoria, y lo
 * vuelca a la base en lote cada minuto: medir no agrega una escritura por
 * pedido. Si la base no responde, se pierde ese minuto y nada más.
 */
@Injectable()
export class RequestMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestMetricsService.name);
  private counters = new Map<string, Counter>();
  private errors: ErrorEventInput[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  record(method: string, route: string, status: number, ms: number, at = new Date()) {
    const hourStart = hourStartOf(at);
    const key = `${hourStart.toISOString()}|${method}|${route}|${status}`;
    const c = this.counters.get(key) ?? { hourStart, method, route, status, count: 0, totalMs: 0, maxMs: 0 };
    const elapsed = Math.max(0, Math.round(ms));
    c.count += 1;
    c.totalMs += elapsed;
    c.maxMs = Math.max(c.maxMs, elapsed);
    this.counters.set(key, c);
  }

  recordError(event: ErrorEventInput) {
    if (this.errors.length >= MAX_PENDING_ERRORS) return;
    this.errors.push({ ...event, message: event.message.slice(0, 1000) });
  }

  async flush() {
    const counters = [...this.counters.values()];
    const errors = this.errors;
    this.counters = new Map();
    this.errors = [];
    try {
      for (const c of counters) {
        // La hora va como UTC explícita: un Date en SQL crudo se convierte con
        // la zona horaria de la sesión y corría la hora.
        const hour = c.hourStart.toISOString().replace("Z", "");
        await this.prisma.$executeRaw`
          INSERT INTO "ApiMetric" ("hourStart", "method", "route", "status", "count", "totalMs", "maxMs")
          VALUES (CAST(${hour} AS timestamp), ${c.method}, ${c.route}, ${c.status}, ${c.count}, ${c.totalMs}, ${c.maxMs})
          ON CONFLICT ("hourStart", "method", "route", "status") DO UPDATE SET
            "count" = "ApiMetric"."count" + EXCLUDED."count",
            "totalMs" = "ApiMetric"."totalMs" + EXCLUDED."totalMs",
            "maxMs" = GREATEST("ApiMetric"."maxMs", EXCLUDED."maxMs")`;
      }
      if (errors.length) await this.prisma.apiErrorEvent.createMany({ data: errors });
    } catch (err) {
      this.logger.warn(`No se pudieron guardar las métricas: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Borra lo que tiene más de 30 días. */
  @Cron("15 4 * * *")
  async prune() {
    const before = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await this.prisma.apiMetric.deleteMany({ where: { hourStart: { lt: before } } });
    await this.prisma.apiErrorEvent.deleteMany({ where: { createdAt: { lt: before } } });
  }
}

export type MetricRow = Prisma.ApiMetricGetPayload<object>;
