/**
 * Límite de pedidos por key: ventana fija de 60 s, en memoria (la API corre en
 * una sola instancia). Devuelve lo necesario para los headers X-RateLimit-*.
 */
export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta que se renueva la ventana. */
  resetSeconds: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly windowMs = 60_000, private readonly maxKeys = 50_000) {}

  hit(key: string, limit: number, now = Date.now()): RateDecision {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      if (this.windows.size >= this.maxKeys) this.prune(now);
      this.windows.set(key, w);
    }
    w.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000));
    return { allowed: w.count <= limit, limit, remaining: Math.max(0, limit - w.count), resetSeconds };
  }

  private prune(now: number) {
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
