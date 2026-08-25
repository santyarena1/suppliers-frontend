import { Injectable } from "@nestjs/common";

type Entry = { at: number; data: unknown };

/** Cache en memoria de lecturas al portal (cta cte / pedidos). TTL corto. */
@Injectable()
export class AccountPortalCache {
  private readonly ttlMs = 5 * 60 * 1000;
  private readonly store = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.data as T;
  }

  set(key: string, data: unknown) {
    this.store.set(key, { at: Date.now(), data });
  }

  /** Invalida una clave o todas las de un prefijo `tenant:PROVIDER:`. */
  invalidate(keyOrPrefix: string) {
    if (this.store.has(keyOrPrefix)) {
      this.store.delete(keyOrPrefix);
      return;
    }
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(keyOrPrefix)) this.store.delete(k);
    }
  }

  async wrap<T>(key: string, refresh: boolean, loader: () => Promise<T>): Promise<T> {
    if (!refresh) {
      const hit = this.get<T>(key);
      if (hit !== undefined) return hit;
    }
    const data = await loader();
    this.set(key, data);
    return data;
  }
}

export function wantsRefresh(refresh?: string | string[]): boolean {
  const v = Array.isArray(refresh) ? refresh[0] : refresh;
  return v === "1" || v === "true";
}
