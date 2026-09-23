import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { errorText, isPostgresStarting, waitUntil } from "./postgres-starting";
import { withPrismaPool } from "./prisma-url";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: { url: withPrismaPool(process.env.DATABASE_URL ?? "") },
      },
    });
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
