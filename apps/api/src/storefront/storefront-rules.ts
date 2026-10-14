/**
 * Reglas de Vender en NODO que no tocan la base (docs/PLAN_VENDER_EN_NODO.md).
 * Viven aparte para testearlas sin Prisma.
 */

export const STOREFRONT_DEFAULT_STOCK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Se avisa al dueño cuando falta menos que esto para que venza el stock. */
export const STOREFRONT_WARN_BEFORE_MS = DAY_MS;

export type StorefrontStatusValue = "ACTIVE" | "PAUSED" | "SUSPENDED";

export interface StorefrontFreshnessInput {
  status: StorefrontStatusValue;
  stockConfirmedAt: Date | null;
  stockValidDays: number;
}

/** Hasta cuándo vale el stock confirmado. `null` = nunca se confirmó. */
export function stockExpiresAt(sf: Pick<StorefrontFreshnessInput, "stockConfirmedAt" | "stockValidDays">): Date | null {
  if (!sf.stockConfirmedAt) return null;
  const days = sf.stockValidDays > 0 ? sf.stockValidDays : STOREFRONT_DEFAULT_STOCK_DAYS;
  return new Date(sf.stockConfirmedAt.getTime() + days * DAY_MS);
}

/** El stock sigue vigente. Sin confirmar nunca, no lo está. */
export function isStockFresh(sf: Pick<StorefrontFreshnessInput, "stockConfirmedAt" | "stockValidDays">, now: Date): boolean {
  const until = stockExpiresAt(sf);
  return until != null && until.getTime() > now.getTime();
}

/** Por qué una tienda no se ve en el buscador, o `null` si se ve. */
export type StorefrontHiddenReason = "PAUSED" | "SUSPENDED" | "STOCK_EXPIRED" | "NO_STOCK_CONFIRMED" | "OWNER_INACTIVE";

export function storefrontHiddenReason(
  sf: StorefrontFreshnessInput & { ownerActive: boolean },
  now: Date
): StorefrontHiddenReason | null {
  if (!sf.ownerActive) return "OWNER_INACTIVE";
  if (sf.status === "SUSPENDED") return "SUSPENDED";
  if (sf.status === "PAUSED") return "PAUSED";
  if (!sf.stockConfirmedAt) return "NO_STOCK_CONFIRMED";
  if (!isStockFresh(sf, now)) return "STOCK_EXPIRED";
  return null;
}

/** Hay que avisar que el stock está por vencer: entra en la ventana y no se avisó desde la última confirmación. */
export function shouldWarnStale(
  sf: StorefrontFreshnessInput & { staleWarnedAt: Date | null },
  now: Date
): boolean {
  if (sf.status !== "ACTIVE") return false;
  const until = stockExpiresAt(sf);
  if (!until) return false;
  if (until.getTime() - now.getTime() > STOREFRONT_WARN_BEFORE_MS) return false;
  return !sf.staleWarnedAt || (sf.stockConfirmedAt != null && sf.staleWarnedAt < sf.stockConfirmedAt);
}

/**
 * Nombre de la organización proveedora de la tienda. `Tenant.name` es único, así
 * que no puede llamarse igual que el comercio; en el buscador se muestra el
 * nombre del comercio, esto queda para Administración.
 */
export function storefrontSupplierName(retailerName: string, attempt = 1): string {
  const base = `${retailerName.trim()} (local)`;
  return attempt <= 1 ? base : `${retailerName.trim()} (local ${attempt})`;
}

export interface StockLine {
  externalId: string;
  qty: number;
}

/**
 * Cuánto queda de cada producto después de confirmar un pedido. Un stock `null`
 * (la tienda no informa cantidad) no se toca; nunca baja de 0.
 */
export function stockAfterOrder(current: Map<string, number | null>, lines: StockLine[]): Map<string, number> {
  const wanted = new Map<string, number>();
  for (const line of lines) {
    if (!line.externalId || !(line.qty > 0)) continue;
    wanted.set(line.externalId, (wanted.get(line.externalId) ?? 0) + Math.round(line.qty));
  }
  const next = new Map<string, number>();
  for (const [id, qty] of wanted) {
    const stock = current.get(id);
    if (stock == null) continue;
    next.set(id, Math.max(0, stock - qty));
  }
  return next;
}

/** Líneas del pedido que piden más de lo publicado (solo donde la tienda informa cantidad). */
export function linesOverStock(
  current: Map<string, number | null>,
  lines: (StockLine & { name?: string })[]
): { externalId: string; name: string; asked: number; available: number }[] {
  const asked = new Map<string, { qty: number; name: string }>();
  for (const line of lines) {
    if (!line.externalId || !(line.qty > 0)) continue;
    const prev = asked.get(line.externalId);
    asked.set(line.externalId, { qty: (prev?.qty ?? 0) + Math.round(line.qty), name: prev?.name ?? line.name ?? line.externalId });
  }
  const over: { externalId: string; name: string; asked: number; available: number }[] = [];
  for (const [id, { qty, name }] of asked) {
    const stock = current.get(id);
    if (stock == null) continue;
    if (qty > stock) over.push({ externalId: id, name, asked: qty, available: Math.max(0, stock) });
  }
  return over;
}

/** Precio final con IVA a partir del neto, como lo hace el importador de listas. */
export function finalFromNet(net: number, ivaPercent: number): number {
  return Math.round(net * (1 + ivaPercent / 100) * 10000) / 10000;
}
