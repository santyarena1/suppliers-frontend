/**
 * Diff de una ficha+oferta entre lo que ya había y lo que trae el proveedor.
 * Sirve para contar creados/actualizados de verdad (no “todo lo que vino”)
 * y para armar el historial de “qué cambió” en la UI de sincronización.
 */

export const SYNC_DIFF_FIELDS = [
  "name",
  "brand",
  "category",
  "subcategory",
  "sku",
  "price",
  "finalPrice",
  "currency",
  "ivaPercent",
  "stock",
  "stockStatus",
] as const;

export type SyncDiffField = (typeof SYNC_DIFF_FIELDS)[number];

export type CatalogSyncSnapshot = {
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  sku: string | null;
  price: number | null;
  finalPrice: number | null;
  currency: string | null;
  ivaPercent: number | null;
  stock: number | null;
  stockStatus: string | null;
};

export type CatalogSyncAction = "created" | "updated" | "unchanged";

export type CatalogSyncDiff = {
  externalId: string;
  action: CatalogSyncAction;
  changedFields: SyncDiffField[];
  before: CatalogSyncSnapshot | null;
  after: CatalogSyncSnapshot;
};

export type CatalogSyncIncoming = {
  externalId: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  sku?: string | null;
  price?: unknown;
  finalPrice?: unknown;
  currency?: string | null;
  ivaPercent?: unknown;
  stock?: unknown;
  stockStatus?: string | null;
};

export type CatalogSyncPrevious = {
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  sku?: string | null;
  price?: unknown;
  finalPrice?: unknown;
  currency?: string | null;
  ivaPercent?: unknown;
  stock?: unknown;
  stockStatus?: string | null;
};

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const toNumber = (value as { toNumber?: () => number }).toNumber;
    if (typeof toNumber === "function") {
      const n = toNumber.call(value);
      return Number.isFinite(n) ? roundMoney(n) : null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

function roundMoney(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function snapshotFromIncoming(item: CatalogSyncIncoming): CatalogSyncSnapshot {
  const stock = num(item.stock);
  return {
    name: item.name?.trim() || "",
    brand: str(item.brand),
    category: str(item.category),
    subcategory: str(item.subcategory),
    sku: str(item.sku),
    price: num(item.price),
    finalPrice: num(item.finalPrice),
    currency: str(item.currency),
    ivaPercent: num(item.ivaPercent),
    stock: stock == null ? null : Math.trunc(stock),
    stockStatus: str(item.stockStatus),
  };
}

export function snapshotFromPrevious(row: CatalogSyncPrevious, fallbackName: string): CatalogSyncSnapshot {
  return snapshotFromIncoming({
    externalId: "",
    name: str(row.name) || fallbackName,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    sku: row.sku,
    price: row.price,
    finalPrice: row.finalPrice,
    currency: row.currency,
    ivaPercent: row.ivaPercent,
    stock: row.stock,
    stockStatus: row.stockStatus,
  });
}

export function diffCatalogItem(
  item: CatalogSyncIncoming,
  previous: CatalogSyncPrevious | null | undefined
): CatalogSyncDiff {
  const after = snapshotFromIncoming(item);
  if (!previous) {
    return {
      externalId: item.externalId,
      action: "created",
      changedFields: SYNC_DIFF_FIELDS.filter((field) => {
        const value = after[field];
        return value != null && value !== "";
      }),
      before: null,
      after,
    };
  }
  const before = snapshotFromPrevious(previous, after.name);
  const changedFields = SYNC_DIFF_FIELDS.filter((field) => before[field] !== after[field]);
  if (changedFields.length === 0) {
    return { externalId: item.externalId, action: "unchanged", changedFields: [], before, after };
  }
  return { externalId: item.externalId, action: "updated", changedFields, before, after };
}
