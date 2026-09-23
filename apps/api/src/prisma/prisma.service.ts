import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { errorText, isPostgresStarting, waitUntil } from "./postgres-starting";
import { withPrismaPool } from "./prisma-url";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnecting: Promise<void> | null = null;

  constructor() {
    super({
      datasources: {
        db: { url: withPrismaPool(process.env.DATABASE_URL ?? "") },
      },
    });
    // Si Postgres cierra el pool después del arranque, una query muerta deja
    // todo el proceso en 500 hasta el próximo deploy. Un reconnect alcanza.
    this.$use(async (_params, next) => {
      try {
        return await next(_params);
      } catch (err) {
        if (!isPostgresStarting(errorText(err))) throw err;
        await this.reconnect();
        return await next(_params);
      }
    });
  }

  private reconnect(): Promise<void> {
    if (!this.reconnecting) {
      this.reconnecting = this.$disconnect()
        .catch(() => undefined)
        .then(() => this.$connect())
        .finally(() => {
          this.reconnecting = null;
        });
    }
    return this.reconnecting;
  }

  async onModuleInit() {
    const result = await waitUntil(
      async () => {
        try {
          await this.$connect();
          return null;
        } catch (err) {
          return err;
        }
      },
      (err) => err == null,
      {
        retry: (err) => err != null && isPostgresStarting(errorText(err)),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onWait: (attempt, seconds) => {
          this.logger.warn(`Postgres todavía no acepta conexiones. Reintento ${attempt} en ${seconds}s.`);
        },
      }
    );
    if (result) throw result;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
