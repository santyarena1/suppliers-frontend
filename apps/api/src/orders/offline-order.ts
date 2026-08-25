/** Pedido offline / ajustes de ítems: vive en Nodo, se puede editar. */

export const ORDER_CHANNEL_ONLINE = "ONLINE";
export const ORDER_CHANNEL_OFFLINE = "OFFLINE";
export const OFFLINE_ORDER_STATUS = "OFFLINE";

export type OrderPricingMode = "list" | "scheme" | "offline";

export type OfflineOrderItem = {
  externalId: string;
  sku: string | null;
  name: string;
  qty: number;
  /** Neto unitario USD. */
  unitPrice: number;
  lineTotal: number;
  internosAmount: number;
  ivaPercent: number;
  internosPercent: number;
  /** Final de línea (neto+imp) si se editó o se aplicó esquema. */
  finalLineUsd?: number | null;
  pricingMode?: OrderPricingMode | null;
  /** Neto de lista original (antes de esquema / edición). */
  listUnitPrice?: number | null;
  edited?: boolean;
  editedAt?: string | null;
  originalUnitPrice?: number | null;
  originalFinalLineUsd?: number | null;
  editNote?: string | null;
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

function asOptionalMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

function asPricingMode(value: unknown): OrderPricingMode | null {
  if (value === "list" || value === "scheme" || value === "offline") return value;
  return null;
}

/** Lee el neto unitario desde las variantes que manda cada checkout. */
export function readUnitNet(o: Record<string, unknown>): number {
  return asMoney(
    o.unitPrice ?? o.price ?? o.priceUsd ?? o.unitPriceUsd ?? o.neto ?? o.net
  );
}

/** Lee el total de línea si vino explícito. */
export function readLineTotal(o: Record<string, unknown>, unitNet: number, qty: number): number {
  const explicit = asOptionalMoney(o.lineTotal ?? o.subtotal ?? o.total ?? o.finalLineUsd);
  if (explicit != null && explicit > 0) return explicit;
  return round2(unitNet * qty);
}

/**
 * Normaliza ítems de pedido (offline o ajustes sobre online).
 * Acepta `price`/`subtotal` de checkouts online además de `unitPrice`/`lineTotal`.
 */
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
    const unitPrice = readUnitNet(o);
    const unitInternos = asMoney(o.internosAmount);
    const lineTotal = readLineTotal(o, unitPrice, qty);
    const finalLineUsd = asOptionalMoney(o.finalLineUsd ?? o.finalPrice ?? o.gross);
    const listUnitPrice = asOptionalMoney(o.listUnitPrice);
    const originalUnitPrice = asOptionalMoney(o.originalUnitPrice);
    const originalFinalLineUsd = asOptionalMoney(o.originalFinalLineUsd);
    const edited = Boolean(o.edited);
    items.push({
      externalId,
      sku: asText(o.sku, 80) || null,
      name,
      qty,
      unitPrice,
      lineTotal,
      internosAmount: unitInternos,
      ivaPercent: asMoney(o.ivaPercent ?? o.iva),
      internosPercent: asMoney(o.internosPercent),
      finalLineUsd,
      pricingMode: asPricingMode(o.pricingMode),
      listUnitPrice,
      edited: edited || undefined,
      editedAt: edited && typeof o.editedAt === "string" ? o.editedAt.slice(0, 40) : null,
      originalUnitPrice,
      originalFinalLineUsd,
      editNote: typeof o.editNote === "string" ? asText(o.editNote, 200) || null : null,
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
  const ivaUsd = round2(
    items.reduce((s, it) => s + it.lineTotal * ((it.ivaPercent || 0) / 100), 0)
  );
  const fromFinal = items.reduce((s, it) => {
    if (it.finalLineUsd != null && it.finalLineUsd > 0) return s + it.finalLineUsd;
    return s + it.lineTotal + it.lineTotal * ((it.ivaPercent || 0) / 100) + it.internosAmount * it.qty;
  }, 0);
  const rate = quoteRate == null || !Number.isFinite(quoteRate) || quoteRate <= 0 ? null : round2(quoteRate);
  return {
    items,
    notes: notes?.trim() ? notes.trim().slice(0, 500) : null,
    quoteRate: rate,
    netUsd,
    internosUsd,
    totalUsd: round2(fromFinal > 0 ? fromFinal : netUsd + internosUsd + ivaUsd),
  };
}

export function isOfflineChannel(value: unknown): boolean {
  return value === ORDER_CHANNEL_OFFLINE;
}

/** Pedidos que el comercio puede ajustar en Nodo (costos / esquema post-creación). */
export function isOrderItemEditable(order: {
  channel?: string | null;
  status?: string | null;
  approvalStatus?: string | null;
}): boolean {
  if (order.approvalStatus === "REJECTED") return false;
  if (isOfflineChannel(order.channel)) return true;
  // Online ya creado en el portal (o aprobado): se pueden anotar ajustes de costo.
  return order.status === "CREATED" || order.approvalStatus === "APPROVED";
}
