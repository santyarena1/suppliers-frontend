import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { DbHealthStatus } from "../prisma/recovery-gate";
import { classifyDbPing } from "./db-ping";

export type HealthPayload = {
  status: "ok";
  uptime: number;
  db: DbHealthStatus;
};

/** Tope para no colgar el healthcheck de Railway si Postgres no contesta. */
const DB_PING_MS = 2_000;

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check(): Promise<HealthPayload> {
    // Siempre HTTP 200: Railway usa este path como liveness del proceso.
    // El estado de Postgres va en `db` para que el front muestre la pantalla
    // de actualización sin tumbar el deploy.
    return {
      status: "ok",
      uptime: process.uptime(),
      db: await this.pingDb(),
    };
  }

  private async pingDb(): Promise<DbHealthStatus> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("db ping timeout")), DB_PING_MS);
        }),
      ]);
      return classifyDbPing(null);
    } catch (err) {
      return classifyDbPing(err);
    }
  }
}
