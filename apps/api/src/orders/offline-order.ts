/** Pedido offline: vive en Nodo, no se manda al portal, se puede editar. */

export const ORDER_CHANNEL_ONLINE = "ONLINE";
export const ORDER_CHANNEL_OFFLINE = "OFFLINE";
export const OFFLINE_ORDER_STATUS = "OFFLINE";

export type OfflineOrderItem = {
  externalId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  internosAmount: number;
  ivaPercent: number;
  internosPercent: number;
};

export type OfflineOrderSnapshot = {
  items: OfflineOrderItem[];
  notes: string | null;
  quoteRate: number | null;
  netUsd: number;
  internosUsd: number;
  totalUsd: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function asText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function asMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

function asQty(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(9999, Math.max(0, Math.round(n)));
}

export function normalizeOfflineItems(raw: unknown): OfflineOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const items: OfflineOrderItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const qty = asQty(o.qty);
    if (qty < 1) continue;
    const name = asText(o.name, 500);
    const externalId = asText(o.externalId ?? o.code, 120);
    if (!name || !externalId) continue;
    const unitPrice = asMoney(o.unitPrice);
    const unitInternos = asMoney(o.internosAmount);
    items.push({
      externalId,
      sku: asText(o.sku, 80) || null,
      name,
      qty,
      unitPrice,
      lineTotal: round2(unitPrice * qty),
      internosAmount: unitInternos,
      ivaPercent: asMoney(o.ivaPercent),
      internosPercent: asMoney(o.internosPercent),
    });
  }
  return items;
}

export function snapshotOfflineOrder(
  items: OfflineOrderItem[],
  notes?: string | null,
  quoteRate?: number | null
): OfflineOrderSnapshot {
  const netUsd = round2(items.reduce((s, it) => s + it.lineTotal, 0));
  const internosUsd = round2(items.reduce((s, it) => s + it.internosAmount * it.qty, 0));
  const rate = quoteRate == null || !Number.isFinite(quoteRate) || quoteRate <= 0 ? null : round2(quoteRate);
  return {
    items,
    notes: notes?.trim() ? notes.trim().slice(0, 500) : null,
    quoteRate: rate,
    netUsd,
    internosUsd,
    totalUsd: round2(netUsd + internosUsd),
  };
}

export function isOfflineChannel(value: unknown): boolean {
  return value === ORDER_CHANNEL_OFFLINE;
}
