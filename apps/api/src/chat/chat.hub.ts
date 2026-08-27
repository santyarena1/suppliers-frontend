import { Injectable } from "@nestjs/common";

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

/**
 * Abanico en memoria hacia las sesiones SSE. Si hay más de una instancia de API,
 * el cliente reconecta y pide el hilo por REST: no se pierde historia.
 */
@Injectable()
export class ChatHub {
  private readonly connections = new Set<Connection>();
  private readonly typing = new Map<string, { userId: string; username: string; at: number }[]>();

  subscribe(
    userId: string,
    tenantId: string,
    username: string,
    write: (event: ChatEvent) => void
  ): () => void {
    const wasOnline = this.isOnline(userId);
    const conn: Connection = { userId, tenantId, username, write };
    this.connections.add(conn);
    if (!wasOnline) {
      this.emitToAll({ type: "presence", data: { userId, username, online: true } });
    }
    return () => {
      this.connections.delete(conn);
      if (!this.isOnline(userId)) {
        this.emitToAll({ type: "presence", data: { userId, username, online: false } });
      }
    };
  }

  isOnline(userId: string) {
    for (const conn of this.connections) {
      if (conn.userId === userId) return true;
    }
    return false;
  }

  onlineUserIds() {
    return [...new Set([...this.connections].map((conn) => conn.userId))];
  }

  emitToUsers(userIds: string[], event: ChatEvent) {
    const wanted = new Set(userIds);
    for (const conn of this.connections) {
      if (wanted.has(conn.userId)) conn.write(event);
    }
  }

  emitToAll(event: ChatEvent) {
    for (const conn of this.connections) conn.write(event);
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
}
