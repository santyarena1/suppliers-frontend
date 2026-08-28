import { Injectable } from "@nestjs/common";
import type { TgsList, TgsPageMeta } from "@nodo/shared";
import { TgsClient } from "./tgs.client";

const EMPTY_META: TgsPageMeta = { page: 1, per_page: 50, total: 0, total_pages: 1 };

@Injectable()
export class TgsService {
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
