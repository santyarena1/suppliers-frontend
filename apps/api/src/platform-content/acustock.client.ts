import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Producto de la exportación de AcuStock, ya validado y recortado. */
export interface AcuStockProduct {
  id: string;
  updatedAt: Date | null;
  sku: string | null;
  ean: string | null;
  partNumber: string | null;
  supplierCodes: { supplier: string; code: string }[];
  brand: string | null;
  name: string;
  category: string[];
  shortDescription: string | null;
  description: string | null;
  /** `estimated`: lo completó la IA y nadie lo revisó (en la ficha no se muestra; el armador lo usa marcado). */
  specs: { group: string | null; name: string; value: string; estimated?: boolean }[];
  images: { url: string; alt: string | null }[];
  warrantyMonths: number | null;
}

const PAGE_SIZE = 500;
const MAX_IMAGES = 12;
const MAX_SPECS = 120;
const MAX_DESCRIPTION = 60_000;
const REQUEST_TIMEOUT_MS = 60_000;
const PAGE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2_000;

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Valida un producto crudo de la exportación; null si no sirve (sin id o sin nombre). */
export function parseAcuStockProduct(raw: unknown): AcuStockProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 100);
  const name = str(r.name, 300);
  if (!id || !name) return null;

  const supplierCodes = (Array.isArray(r.supplierCodes) ? r.supplierCodes : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => ({ supplier: str(s.supplier, 60)?.toUpperCase() ?? "", code: str(s.code, 120) ?? "" }))
    .filter((s) => s.supplier && s.code);

  const seen = new Set<string>();
  const images = (Array.isArray(r.images) ? r.images : [])
    .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>) : {}))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((i) => ({ url: str(i.url, 1000) ?? "", alt: str(i.alt, 200) }))
    .filter((i) => isHttpUrl(i.url) && !seen.has(i.url) && seen.add(i.url))
    .slice(0, MAX_IMAGES);

  const specs = (Array.isArray(r.specs) ? r.specs : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => ({
      group: str(s.group, 80),
      name: str(s.name, 120) ?? "",
      value: str(s.value, 500) ?? "",
      ...(s.estimated === true ? { estimated: true } : {}),
    }))
    .filter((s) => s.name && s.value)
    .slice(0, MAX_SPECS);

  const updated = str(r.updatedAt, 40);
  const updatedAt = updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated) : null;
  const warranty = Number(r.warrantyMonths);

  return {
    id,
    updatedAt,
    sku: str(r.sku, 120),
    ean: str(r.ean, 40),
    partNumber: str(r.partNumber, 120),
    supplierCodes,
    brand: str(r.brand, 120),
    name,
    category: (Array.isArray(r.category) ? r.category : []).map((c) => str(c, 120)).filter((c): c is string => !!c),
    shortDescription: str(r.shortDescription, 1000),
    description: str(r.description, MAX_DESCRIPTION),
    specs,
    images,
    warrantyMonths: Number.isInteger(warranty) && warranty > 0 && warranty < 600 ? warranty : null,
  };
}

/** Lee la exportación de catálogo de AcuStock (solo lectura, paginada). */
@Injectable()
export class AcuStockClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>("ACUSTOCK_EXPORT_URL") && this.config.get<string>("ACUSTOCK_EXPORT_TOKEN"));
  }

  /** Recorre todas las páginas. `onPage` recibe el avance para el latido de la corrida. */
  async fetchAll(onPage?: (page: number, totalPages: number) => Promise<void>): Promise<AcuStockProduct[]> {
    const base = this.config.get<string>("ACUSTOCK_EXPORT_URL");
    const token = this.config.get<string>("ACUSTOCK_EXPORT_TOKEN");
    if (!base || !token) throw new Error("Falta configurar ACUSTOCK_EXPORT_URL y ACUSTOCK_EXPORT_TOKEN");

    const out: AcuStockProduct[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const body = await this.fetchPage(`${base}?page=${page}&pageSize=${PAGE_SIZE}`, token, page);
      const items = body.data?.items;
      if (!Array.isArray(items)) throw new Error(`Respuesta de AcuStock sin items en la página ${page}`);
      for (const raw of items) {
        const product = parseAcuStockProduct(raw);
        if (product) out.push(product);
      }
      totalPages = Math.max(1, Number(body.data?.totalPages) || 1);
      await onPage?.(page, totalPages);
      page++;
    } while (page <= totalPages);
    return out;
  }

  /** Cuántos productos cambiaron en AcuStock (ficha, fotos o datos) desde esa fecha. */
  async countUpdatedSince(since: Date): Promise<number> {
    const base = this.config.get<string>("ACUSTOCK_EXPORT_URL");
    const token = this.config.get<string>("ACUSTOCK_EXPORT_TOKEN");
    if (!base || !token) throw new Error("Falta configurar ACUSTOCK_EXPORT_URL y ACUSTOCK_EXPORT_TOKEN");
    const body = await this.fetchPage(`${base}?page=1&pageSize=1&updatedSince=${encodeURIComponent(since.toISOString())}`, token, 1);
    return Math.max(0, Number(body.data?.total) || 0);
  }

  /** Una página, con reintentos ante cortes o errores del servidor (un 4xx no se reintenta). */
  private async fetchPage(url: string, token: string, page: number): Promise<ExportPage> {
    let last: Error | null = null;
    for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        last = err as Error;
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      if (res.status >= 400 && res.status < 500) throw new Error(`AcuStock respondió ${res.status} en la página ${page}`);
      if (res.ok) return (await res.json()) as ExportPage;
      last = new Error(`AcuStock respondió ${res.status} en la página ${page}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
    throw last ?? new Error(`No se pudo leer la página ${page} de AcuStock`);
  }
}

interface ExportPage {
  data?: { items?: unknown[]; totalPages?: number; total?: number };
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
