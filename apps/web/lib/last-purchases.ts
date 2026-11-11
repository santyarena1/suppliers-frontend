"use client";

import { useEffect, useState } from "react";
import { ordersApi, type LastPurchase, type LastPurchaseIndex } from "@/lib/api";

/**
 * Última compra de cada producto, para marcarla en el buscador.
 * Se pide una sola vez para toda la página (y se renueva cada 5 minutos).
 */
const TTL_MS = 5 * 60_000;
let cache: { at: number; data: LastPurchaseIndex } | null = null;
let inflight: Promise<LastPurchaseIndex | null> | null = null;
const listeners = new Set<(d: LastPurchaseIndex) => void>();

function load(): Promise<LastPurchaseIndex | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.data);
  if (!inflight) {
    inflight = ordersApi
      .lastPurchases()
      .then((res) => {
        cache = { at: Date.now(), data: res.data };
        listeners.forEach((fn) => fn(res.data));
        return res.data;
      })
      // Sin permiso o sin pedidos: el buscador sigue igual, sin la marca.
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Igual que en el servidor: minúsculas, sin acentos ni signos. */
export function normalizeProductText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function useLastPurchaseIndex(): LastPurchaseIndex | null {
  const [data, setData] = useState<LastPurchaseIndex | null>(cache?.data ?? null);
  useEffect(() => {
    listeners.add(setData);
    void load().then((d) => d && setData(d));
    return () => {
      listeners.delete(setData);
    };
  }, []);
  return data;
}

/** La última compra de este producto: con el mismo proveedor, o con otro que lo llama igual. */
export function findLastPurchase(
  index: LastPurchaseIndex | null,
  product: { provider: string; externalId: string; name?: string | null }
): (LastPurchase & { sameProvider: boolean }) | null {
  if (!index) return null;
  const exact = index.bySku[`${product.provider}::${product.externalId}`];
  if (exact) return { ...exact, sameProvider: true };
  const byName = product.name ? index.byName[normalizeProductText(product.name)] : undefined;
  return byName ? { ...byName, sameProvider: byName.provider === product.provider } : null;
}

export function formatPurchaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}
