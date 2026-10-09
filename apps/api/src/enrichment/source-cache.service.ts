import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { httpGet } from "./sources/http";
import { FetchedBody, SourceFetcher } from "./sources/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TTL_DAYS = 30;
/** Un 404/403 se reintenta antes que una respuesta buena. */
const ERROR_TTL_DAYS = 3;
/** HTML guardado como mucho (las fichas traen ld+json y og: arriba). */
const MAX_CACHED_HTML_CHARS = 600_000;

/** Pausa mínima entre llamadas a una misma fuente. */
const MIN_INTERVAL_MS: Record<string, number> = {
  icecat: 400,
  default: 1200,
};

/**
 * Todo lo que se baja de afuera pasa por acá: se guarda la respuesta cruda con
 * su fecha (no se repiten llamadas) y se respeta un ritmo por fuente.
 */
@Injectable()
export class SourceCacheService {
  private readonly logger = new Logger(SourceCacheService.name);
  private readonly queues = new Map<string, Promise<void>>();
  private readonly lastCall = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /** El fetcher que reciben los conectores. */
  readonly fetcher: SourceFetcher = (source, url, opts) => this.get(source, url, opts);

  async get(source: string, url: string, opts: { json?: boolean; headers?: Record<string, string>; ttlDays?: number } = {}): Promise<FetchedBody> {
    const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;
    const cached = await this.prisma.enrichmentSourceCache.findUnique({ where: { source_key: { source, key: url } } });
    if (cached) {
      const ageDays = (Date.now() - cached.fetchedAt.getTime()) / DAY_MS;
      const ttl = cached.status >= 200 && cached.status < 300 ? ttlDays : ERROR_TTL_DAYS;
      if (ageDays < ttl) return { status: cached.status, body: unwrap(cached.body), url };
    }

    const fresh = await this.throttled(source, () => this.download(url, opts));
    const stored = wrap(fresh.body);
    await this.prisma.enrichmentSourceCache.upsert({
      where: { source_key: { source, key: url } },
      create: { source, key: url, status: fresh.status, body: stored },
      update: { status: fresh.status, body: stored, fetchedAt: new Date() },
    });
    return fresh;
  }

  private async download(url: string, opts: { json?: boolean; headers?: Record<string, string> }): Promise<FetchedBody> {
    const res = await httpGet(url, { headers: opts.headers });
    const text = res.buffer.toString("utf8");
    if (opts.json) {
      try {
        return { status: res.status, body: JSON.parse(text), url: res.url };
      } catch {
        return { status: res.status >= 400 ? res.status : 502, body: null, url: res.url };
      }
    }
    return { status: res.status, body: text.slice(0, MAX_CACHED_HTML_CHARS), url: res.url };
  }

  /** Encola la llamada para respetar la pausa mínima de la fuente. */
  private throttled<T>(source: string, task: () => Promise<T>): Promise<T> {
    const gap = MIN_INTERVAL_MS[source] ?? MIN_INTERVAL_MS.default;
    const prev = this.queues.get(source) ?? Promise.resolve();
    const run = prev.then(async () => {
      const wait = (this.lastCall.get(source) ?? 0) + gap - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall.set(source, Date.now());
    });
    this.queues.set(source, run.catch(() => undefined));
    return run.then(task).catch((err: unknown) => {
      this.logger.warn(`[${source}] ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    });
  }
}

function wrap(body: unknown): Prisma.InputJsonValue {
  if (typeof body === "string") return { html: body };
  return { json: (body ?? null) as Prisma.InputJsonValue };
}

function unwrap(stored: Prisma.JsonValue): unknown {
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    if ("html" in stored) return stored.html;
    if ("json" in stored) return stored.json;
  }
  return stored;
}
