import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const FLUSH_MS = 10_000;
const LAST_USED_EVERY_MS = 60_000;

/**
 * Uso de cada key: pedidos y errores por día, y último uso. Se junta en memoria
 * y se guarda cada 10 s, así un integrador que pide mucho no suma una escritura
 * por pedido.
 */
@Injectable()
export class ApiUsageService implements OnModuleDestroy {
  private readonly logger = new Logger(ApiUsageService.name);
  private pending = new Map<string, { day: string; requests: number; errors: number }>();
  private lastUsed = new Map<string, { at: number; ip: string; savedAt: number }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  record(clientId: string, ok: boolean, ip: string, now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    const key = `${clientId}|${day}`;
    const row = this.pending.get(key) ?? { day, requests: 0, errors: 0 };
    row.requests += 1;
    if (!ok) row.errors += 1;
    this.pending.set(key, row);
    const seen = this.lastUsed.get(clientId);
    this.lastUsed.set(clientId, { at: now.getTime(), ip, savedAt: seen?.savedAt ?? 0 });
    this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_MS);
    this.timer.unref?.();
  }

  async flush() {
    const batch = this.pending;
    this.pending = new Map();
    for (const [key, row] of batch) {
      const clientId = key.split("|")[0];
      try {
        await this.prisma.apiUsageDaily.upsert({
          where: { apiClientId_day: { apiClientId: clientId, day: new Date(`${row.day}T00:00:00Z`) } },
          create: { apiClientId: clientId, day: new Date(`${row.day}T00:00:00Z`), requests: row.requests, errors: row.errors },
          update: { requests: { increment: row.requests }, errors: { increment: row.errors } },
        });
      } catch (err) {
        // La key pudo borrarse entre medio: el uso de una key que no existe no importa.
        this.logger.debug(`Uso de la key ${clientId} no guardado: ${(err as Error).message}`);
      }
    }
    const now = Date.now();
    for (const [clientId, seen] of this.lastUsed) {
      if (now - seen.savedAt < LAST_USED_EVERY_MS) continue;
      seen.savedAt = now;
      await this.prisma.apiClient
        .update({ where: { id: clientId }, data: { lastUsedAt: new Date(seen.at), lastUsedIp: seen.ip } })
        .catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    await this.flush().catch(() => undefined);
  }
}
