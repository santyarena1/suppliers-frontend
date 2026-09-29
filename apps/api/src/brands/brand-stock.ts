/**
 * Semáforo de stock de un producto de la marca en un distribuidor.
 * Diseño: docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md
 */

export type StockLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type BrandItemState = "INCOMING" | "DISCONTINUED";
/** Lo que se muestra: un nivel, un estado que puso la marca o "sin dato". */
export type SemaphoreStatus = StockLevel | BrandItemState | "UNKNOWN";

export interface StockSettings {
  mode: "AUTO" | "MANUAL";
  /** Por debajo de esto (y mayor a 0) es Bajo. */
  lowBelow: number;
  /** Desde esto es Alto. */
  highFrom: number;
}

export const DEFAULT_STOCK_SETTINGS: StockSettings = { mode: "AUTO", lowBelow: 5, highFrom: 20 };
/** Un distribuidor que no sincronizó en este tiempo no tiene dato confiable. */
export const STOCK_STALE_MS = 48 * 60 * 60 * 1000;

export function levelFromStock(stock: number, settings: Pick<StockSettings, "lowBelow" | "highFrom">): StockLevel {
  if (stock <= 0) return "NONE";
  if (stock >= settings.highFrom) return "HIGH";
  if (stock < settings.lowBelow) return "LOW";
  return "MEDIUM";
}

/**
 * Nivel de un producto en un distribuidor. El estado que puso la marca
 * (próximo ingreso, discontinuado) pisa todo. En automático sale del stock
 * sincronizado; sin sincronización reciente es "sin dato". En manual, la luz
 * que eligió la marca.
 */
export function semaphoreStatus(input: {
  settings: StockSettings;
  itemState?: BrandItemState | null;
  manualLevel?: StockLevel | null;
  stock?: number | null;
  syncedAt?: Date | null;
  now?: Date;
}): SemaphoreStatus {
  if (input.itemState) return input.itemState;
  if (input.settings.mode === "MANUAL") return input.manualLevel ?? "UNKNOWN";
  const now = input.now ?? new Date();
  if (input.stock == null || !input.syncedAt || now.getTime() - input.syncedAt.getTime() > STOCK_STALE_MS) {
    return "UNKNOWN";
  }
  return levelFromStock(input.stock, input.settings);
}

export function validStockSettings(settings: Pick<StockSettings, "lowBelow" | "highFrom">): boolean {
  return (
    Number.isInteger(settings.lowBelow) &&
    Number.isInteger(settings.highFrom) &&
    settings.lowBelow >= 1 &&
    settings.highFrom > settings.lowBelow
  );
}

export interface CatalogSku {
  provider: string;
  externalId: string;
  name: string;
  ean?: string | null;
  partNumber?: string | null;
  imageUrl?: string | null;
}

export interface SuggestedItem {
  name: string;
  ean: string | null;
  partNumber: string | null;
  imageUrl: string | null;
  skus: CatalogSku[];
}

function normEan(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.replace(/^0+/, "") : null;
}

function normPn(value?: string | null): string | null {
  const pn = (value ?? "").toUpperCase().replace(/[\s._/-]/g, "");
  return pn.length >= 4 ? pn : null;
}

function keysOf(sku: CatalogSku): string[] {
  const out: string[] = [];
  const ean = normEan(sku.ean);
  const pn = normPn(sku.partNumber);
  if (ean) out.push(`ean:${ean}`);
  if (pn) out.push(`pn:${pn}`);
  return out;
}

/**
 * Agrupa los códigos de la marca en todos los distribuidores como productos:
 * mismo EAN o mismo part number es el mismo producto. Un código sin EAN ni part
 * number queda como producto propio. Un grupo tiene a lo sumo un código por
 * distribuidor (el primero), para no mezclar variantes.
 */
export function groupSkusIntoItems(skus: CatalogSku[]): SuggestedItem[] {
  const groups: CatalogSku[][] = [];
  const byKey = new Map<string, number>();

  for (const sku of skus) {
    const keys = keysOf(sku);
    const found = keys.map((k) => byKey.get(k)).find((i) => i !== undefined);
    if (found === undefined) {
      const index = groups.push([sku]) - 1;
      for (const k of keys) byKey.set(k, index);
      continue;
    }
    if (groups[found].some((s) => s.provider === sku.provider)) continue;
    groups[found].push(sku);
    for (const k of keys) if (!byKey.has(k)) byKey.set(k, found);
  }

  return groups.map((members) => ({
    name: members[0].name.trim(),
    ean: members.map((s) => normEan(s.ean)).find(Boolean) ?? null,
    partNumber: members.map((s) => s.partNumber?.trim() || null).find(Boolean) ?? null,
    imageUrl: members.find((s) => s.imageUrl)?.imageUrl ?? null,
    skus: members,
  }));
}
