/**
 * «¿Cuándo lo compré?»: busca en los pedidos ya hechos por el comercio.
 *
 * Trabaja sobre pedidos que ya vienen filtrados por `tenantId`; acá no se
 * cruza nada entre locales.
 */

import { extractOrderLines, providerLabel, type OrderForAnalytics, type PurchaseChannel } from "./purchase-analytics";

export const MAX_HISTORY_LINES = 60;
export const MIN_HISTORY_QUERY = 2;

export type PurchaseHistoryLine = {
  orderId: string;
  provider: string;
  providerName: string;
  channel: PurchaseChannel;
  createdAt: string;
  sku: string;
  name: string;
  qty: number;
  unitUsd: number;
};

export type PurchaseHistoryResult = {
  query: string;
  /** Compras que coinciden, de la más nueva a la más vieja (hasta MAX_HISTORY_LINES). */
  lines: PurchaseHistoryLine[];
  /** Cuántas coincidencias hubo en total, aunque no entren todas en `lines`. */
  total: number;
  /** La última compra con cada proveedor, para el resumen de arriba. */
  lastByProvider: { provider: string; providerName: string; createdAt: string; name: string; qty: number }[];
};

export type LastPurchase = { at: string; qty: number; provider: string; name: string };

export type LastPurchaseIndex = {
  /** Clave `PROVEEDOR::sku`: el mismo producto, con el mismo proveedor. */
  bySku: Record<string, LastPurchase>;
  /** Nombre normalizado: el mismo producto comprado con otro proveedor que lo nombra igual. */
  byName: Record<string, LastPurchase>;
};

/** Minúsculas, sin acentos y sin signos: «Ryzen 5 5600G» y «RYZEN-5 5600g» quedan iguales. */
export function normalizeProductText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalizeProductText(query).split(" ").filter(Boolean);
}

/** Todas las palabras de la búsqueda tienen que estar en el nombre o en el código. */
function matches(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  // Sin espacios también: «5600 g» encuentra «5600G».
  const compact = haystack.replace(/ /g, "");
  return tokens.every((t) => haystack.includes(t) || compact.includes(t));
}

export function searchPurchaseHistory(orders: OrderForAnalytics[], rawQuery: string): PurchaseHistoryResult {
  const query = (rawQuery ?? "").trim().slice(0, 120);
  const tokens = queryTokens(query);
  if (normalizeProductText(query).replace(/ /g, "").length < MIN_HISTORY_QUERY) {
    return { query, lines: [], total: 0, lastByProvider: [] };
  }

  const found: PurchaseHistoryLine[] = [];
  for (const order of orders) {
    for (const line of extractOrderLines(order)) {
      if (!matches(normalizeProductText(`${line.name} ${line.sku}`), tokens)) continue;
      found.push({
        orderId: line.orderId,
        provider: line.provider,
        providerName: providerLabel(line.provider),
        channel: line.channel,
        createdAt: line.createdAt,
        sku: line.sku,
        name: line.name,
        qty: line.qty,
        unitUsd: line.unitUsd,
      });
    }
  }
  found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const lastByProvider: PurchaseHistoryResult["lastByProvider"] = [];
  const seen = new Set<string>();
  for (const line of found) {
    if (seen.has(line.provider)) continue;
    seen.add(line.provider);
    lastByProvider.push({
      provider: line.provider,
      providerName: line.providerName,
      createdAt: line.createdAt,
      name: line.name,
      qty: line.qty,
    });
  }

  return { query, lines: found.slice(0, MAX_HISTORY_LINES), total: found.length, lastByProvider };
}

/** La última compra de cada producto, para marcarla en el buscador. Sin precios. */
export function buildLastPurchaseIndex(orders: OrderForAnalytics[]): LastPurchaseIndex {
  const bySku: Record<string, LastPurchase> = {};
  const byName: Record<string, LastPurchase> = {};
  for (const order of orders) {
    for (const line of extractOrderLines(order)) {
      const entry: LastPurchase = { at: line.createdAt, qty: line.qty, provider: line.provider, name: line.name };
      const skuKey = `${line.provider}::${line.sku}`;
      if (!bySku[skuKey] || bySku[skuKey].at < entry.at) bySku[skuKey] = entry;
      const nameKey = normalizeProductText(line.name);
      // Un nombre muy corto («Mouse») juntaría productos distintos.
      if (nameKey.length >= 12 && (!byName[nameKey] || byName[nameKey].at < entry.at)) byName[nameKey] = entry;
    }
  }
  return { bySku, byName };
}
