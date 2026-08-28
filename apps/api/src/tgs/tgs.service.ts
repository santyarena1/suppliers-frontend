import { Injectable } from "@nestjs/common";
import type { TgsList, TgsPageMeta, TgsProductoVendido, TgsProductosVendidosResult, TgsSoldSort, TgsVenta } from "@nodo/shared";
import { TgsClient } from "./tgs.client";
import { filterSoldProducts, flattenVentaItems, mapPool, paginateSoldProducts, sortSoldProducts } from "./tgs.sold-products";

const MAX_VENTAS = 250;
const DETAIL_CONCURRENCY = 8;
const CACHE_MS = 45_000;

@Injectable()
export class TgsService {
  private soldCache = new Map<string, { rows: TgsProductoVendido[]; ventas: number; truncated: boolean; expires: number }>();

  constructor(private readonly client: TgsClient) {}

  async list<T>(path: string, params?: Record<string, unknown>): Promise<TgsList<T>> {
    const res = await this.client.get<T[]>(path, params);
    const items = Array.isArray(res.data) ? res.data : [];
    return { items, meta: toMeta(res.meta, items.length) };
  }

  async detail<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.client.get<T>(path, params);
    return res.data;
  }

  async detailWithMeta<T extends object>(path: string, params?: Record<string, unknown>): Promise<T & { meta?: TgsPageMeta }> {
    const res = await this.client.get<T>(path, params);
    const data = res.data && typeof res.data === "object" ? res.data : ({} as T);
    return { ...data, meta: toMeta(res.meta, 0) };
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await this.client.patch<T>(path, body);
    return res.data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.client.post<T>(path, body);
    return res.data;
  }

  async productosVendidos(query: {
    desde?: string;
    hasta?: string;
    estado?: string;
    local_id?: number;
    q?: string;
    sort?: TgsSoldSort;
    dir?: "asc" | "desc";
    page?: number;
    per_page?: number;
  }): Promise<TgsProductosVendidosResult> {
    const loaded = await this.loadSoldRows({
      desde: query.desde,
      hasta: query.hasta,
      estado: query.estado,
      local_id: query.local_id,
    });
    const filtered = filterSoldProducts(loaded.rows, query.q);
    const sorted = sortSoldProducts(filtered, query.sort ?? "fecha", query.dir ?? "desc");
    const page = paginateSoldProducts(sorted, query.page ?? 1, query.per_page ?? 50);
    return { ...page, ventas: loaded.ventas, truncated: loaded.truncated };
  }

  private async loadSoldRows(params: {
    desde?: string;
    hasta?: string;
    estado?: string;
    local_id?: number;
  }): Promise<{ rows: TgsProductoVendido[]; ventas: number; truncated: boolean }> {
    const key = JSON.stringify(params);
    const hit = this.soldCache.get(key);
    if (hit && hit.expires > Date.now()) return hit;

    const headers = await this.listAllVentas(params);
    const details = await mapPool(headers.items, DETAIL_CONCURRENCY, async (venta) => {
      try {
        return await this.detail<TgsVenta>(`/ventas/${venta.id}`);
      } catch {
        return venta;
      }
    });
    const rows = flattenVentaItems(details);
    const packed = {
      rows,
      ventas: headers.items.length,
      truncated: headers.truncated,
      expires: Date.now() + CACHE_MS,
    };
    this.soldCache.set(key, packed);
    return packed;
  }

  private async listAllVentas(params: {
    desde?: string;
    hasta?: string;
    estado?: string;
    local_id?: number;
  }): Promise<{ items: TgsVenta[]; truncated: boolean }> {
    const first = await this.list<TgsVenta>("/ventas", { ...params, page: 1, per_page: 100 });
    const items = [...first.items];
    const maxPages = Math.ceil(MAX_VENTAS / 100);
    const last = Math.min(first.meta.total_pages, maxPages);
    for (let page = 2; page <= last; page++) {
      const next = await this.list<TgsVenta>("/ventas", { ...params, page, per_page: 100 });
      items.push(...next.items);
    }
    const sliced = items.slice(0, MAX_VENTAS);
    return { items: sliced, truncated: first.meta.total > sliced.length };
  }
}

function toMeta(raw: Record<string, unknown> | undefined, fallbackTotal: number): TgsPageMeta {
  const num = (key: string, fallback: number) => {
    const value = raw?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  return {
    page: num("page", 1),
    per_page: num("per_page", 50),
    total: num("total", fallbackTotal),
    total_pages: num("total_pages", 1),
    ...(typeof raw?.local_id === "number" ? { local_id: raw.local_id } : {}),
  };
}
