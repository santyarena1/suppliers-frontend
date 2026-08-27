import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { randomUUID } from "crypto";

export type ChatEvent = {
  type: string;
  threadId?: string;
  data: unknown;
};

type Connection = {
  userId: string;
  tenantId: string;
  username: string;
  write: (event: ChatEvent) => void;
};

type BusMessage = {
  instanceId: string;
  userIds?: string[] | null;
  all?: boolean;
  event: ChatEvent;
};

const CHANNEL = "nodo:chat:events";
const ONLINE_KEY = "nodo:chat:online";

/**
 * Abanico hacia las sesiones SSE. En una sola instancia alcanza la memoria.
 * Si hay REDIS_URL (Railway), publica el evento para que las otras réplicas
 * lo entreguen a sus conexiones.
 */
@Injectable()
export class ChatHub implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChatHub.name);
  private readonly connections = new Set<Connection>();
  private readonly typing = new Map<string, { userId: string; username: string; at: number }[]>();
  private readonly instanceId = randomUUID();
  private pub: Redis | null = null;
  private sub: Redis | null = null;

  constructor(@Optional() private readonly config?: ConfigService) {}

  async onModuleInit() {
    const url = this.config?.get<string>("REDIS_URL")?.trim();
    if (!url) return;
    try {
      this.pub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
      this.sub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
      await this.pub.connect();
      await this.sub.connect();
      await this.sub.subscribe(CHANNEL);
      this.sub.on("message", (_channel, raw) => this.onBus(raw));
      this.log.log("Chat en Redis: las réplicas se pasan los mensajes");
    } catch (err) {
      this.log.warn(`No se pudo usar Redis para el chat (${(err as Error).message}). Sigo en memoria.`);
      await this.disconnectRedis();
    }
  }

  async onModuleDestroy() {
    await this.disconnectRedis();
  }

  subscribe(
    userId: string,
    tenantId: string,
    username: string,
    write: (event: ChatEvent) => void
  ): () => void {
    const wasOnline = this.isOnlineLocal(userId);
    const conn: Connection = { userId, tenantId, username, write };
    this.connections.add(conn);
    if (!wasOnline) {
      void this.markOnline(userId, true);
      this.emitToAll({ type: "presence", data: { userId, username, online: true } });
    }
    return () => {
      this.connections.delete(conn);
      if (!this.isOnlineLocal(userId)) {
        void this.markOnline(userId, false);
        this.emitToAll({ type: "presence", data: { userId, username, online: false } });
      }
    };
  }

  isOnline(userId: string) {
    return this.isOnlineLocal(userId);
  }

  onlineUserIds() {
    return [...new Set([...this.connections].map((row) => row.userId))];
  }

  emitToUsers(userIds: string[], event: ChatEvent) {
    this.writeLocal(new Set(userIds), event);
    this.publish({ instanceId: this.instanceId, userIds, event });
  }

  emitToAll(event: ChatEvent) {
    this.writeLocal(null, event);
    this.publish({ instanceId: this.instanceId, all: true, event });
  }

  emitToTenant(tenantId: string, event: ChatEvent) {
    const ids = [...this.connections].filter((row) => row.tenantId === tenantId).map((row) => row.userId);
    this.emitToUsers(ids, event);
  }

  setTyping(threadId: string, userId: string, username: string) {
    const now = Date.now();
    const current = (this.typing.get(threadId) ?? []).filter((row) => now - row.at < 4000 && row.userId !== userId);
    current.push({ userId, username, at: now });
    this.typing.set(threadId, current);
    return current.map((row) => ({ userId: row.userId, username: row.username }));
  }

  typingOf(threadId: string) {
    const now = Date.now();
    const current = (this.typing.get(threadId) ?? []).filter((row) => now - row.at < 4000);
    this.typing.set(threadId, current);
    return current.map((row) => ({ userId: row.userId, username: row.username }));
  }

  private isOnlineLocal(userId: string) {
    for (const conn of this.connections) {
      if (conn.userId === userId) return true;
    }
    return false;
  }

  private writeLocal(userIds: Set<string> | null, event: ChatEvent) {
    for (const conn of this.connections) {
      if (userIds && !userIds.has(conn.userId)) continue;
      conn.write(event);
    }
  }

  private publish(message: BusMessage) {
    if (!this.pub) return;
    void this.pub.publish(CHANNEL, JSON.stringify(message)).catch((err) => {
      this.log.warn(`Redis publish falló: ${(err as Error).message}`);
    });
  }

  private onBus(raw: string) {
    try {
      const message = JSON.parse(raw) as BusMessage;
      if (!message?.event || message.instanceId === this.instanceId) return;
      this.writeLocal(message.all ? null : new Set(message.userIds ?? []), message.event);
    } catch {
      /* payload ajeno */
    }
  }

  private async markOnline(userId: string, online: boolean) {
    if (!this.pub) return;
    try {
      if (online) await this.pub.sadd(ONLINE_KEY, userId);
      else await this.pub.srem(ONLINE_KEY, userId);
    } catch {
      /* presencia local alcanza */
    }
  }

  private async disconnectRedis() {
    try {
      await this.sub?.quit();
    } catch {
      this.sub?.disconnect();
    }
    try {
      await this.pub?.quit();
    } catch {
      this.pub?.disconnect();
    }
    this.sub = null;
    this.pub = null;
  }
}
