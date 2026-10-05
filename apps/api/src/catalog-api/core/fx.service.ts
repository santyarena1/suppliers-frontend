import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import type { CatalogApiFxRate } from "@nodo/shared";

export const FX_SOURCE_URL = "https://dolarapi.com/v1/dolares";
const CACHE_MS = 10 * 60_000;
/** Tras un error, cuánto esperar antes de volver a pedir (no golpear un servicio caído). */
const RETRY_AFTER_ERROR_MS = 60_000;

export type MarketRate = Exclude<CatalogApiFxRate, "fixed">;

/** dolarapi.com llama "bolsa" al MEP. */
const CASA_BY_RATE: Record<MarketRate, string> = {
  oficial: "oficial",
  blue: "blue",
  mep: "bolsa",
  tarjeta: "tarjeta",
};

export interface FxSnapshot {
  /** Pesos por dólar (precio de venta) de cada cotización disponible. */
  rates: Partial<Record<MarketRate, number>>;
  /** Cuándo se obtuvo. */
  at: Date | null;
  /** `true` si es la última buena y la fuente no responde. */
  stale: boolean;
}

export interface FxForKey {
  source: CatalogApiFxRate;
  rate: number | null;
  at: string | null;
  stale: boolean;
}

/** Interpreta la respuesta de dolarapi.com. Ignora lo que no tenga un número válido. */
export function parseDolarApi(body: unknown): Partial<Record<MarketRate, number>> {
  const rows = Array.isArray(body) ? body : [];
  const out: Partial<Record<MarketRate, number>> = {};
  for (const [rate, casa] of Object.entries(CASA_BY_RATE) as [MarketRate, string][]) {
    const row = rows.find((r) => r && typeof r === "object" && (r as { casa?: string }).casa === casa) as
      | { venta?: unknown }
      | undefined;
    const venta = Number(row?.venta);
    if (Number.isFinite(venta) && venta > 0) out[rate] = venta;
  }
  return out;
}

/**
 * Cotización del dólar para las keys que publican en pesos. Se cachea 10 min y
 * se guarda la última buena: si la fuente se cae, la API sigue respondiendo con
 * esa y lo avisa (`meta.fx.stale`).
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private last: FxSnapshot = { rates: {}, at: null, stale: false };
  private fetchedAt = 0;
  private failedAt = 0;
  private inflight: Promise<void> | null = null;

  async snapshot(now = Date.now()): Promise<FxSnapshot> {
    const fresh = this.last.at && now - this.fetchedAt < CACHE_MS;
    const cooling = now - this.failedAt < RETRY_AFTER_ERROR_MS;
    if (!fresh && !cooling) {
      this.inflight ??= this.refresh().finally(() => {
        this.inflight = null;
      });
      await this.inflight;
    }
    return this.last;
  }

  async forKey(source: CatalogApiFxRate, fixed?: number): Promise<FxForKey> {
    if (source === "fixed") {
      const rate = Number(fixed);
      return { source, rate: Number.isFinite(rate) && rate > 0 ? rate : null, at: null, stale: false };
    }
    const snap = await this.snapshot();
    return { source, rate: snap.rates[source] ?? null, at: snap.at?.toISOString() ?? null, stale: snap.stale };
  }

  private async refresh() {
    try {
      const res = await axios.get(FX_SOURCE_URL, { timeout: 5_000 });
      const rates = parseDolarApi(res.data);
      if (Object.keys(rates).length === 0) throw new Error("respuesta sin cotizaciones");
      this.last = { rates, at: new Date(), stale: false };
      this.fetchedAt = Date.now();
    } catch (err) {
      this.failedAt = Date.now();
      this.last = { ...this.last, stale: this.last.at != null };
      this.logger.warn(`No se pudo actualizar la cotización: ${(err as Error).message}`);
    }
  }
}
