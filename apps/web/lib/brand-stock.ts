import type { BrandAvailabilityItem, BrandSemaphoreStatus, BrandStockLevel } from "@/lib/api";

/** Semáforo de stock por distribuidor. Diseño: docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md */
export const STOCK_STATUS_LABEL: Record<BrandSemaphoreStatus, string> = {
  HIGH: "Alto",
  MEDIUM: "Medio",
  LOW: "Bajo",
  NONE: "Sin stock",
  INCOMING: "Próximo ingreso",
  DISCONTINUED: "Discontinuado",
  UNKNOWN: "Sin dato",
};

export const STOCK_STATUS_DOT: Record<BrandSemaphoreStatus, string> = {
  HIGH: "bg-emerald-400",
  MEDIUM: "bg-lime-300",
  LOW: "bg-amber-400",
  NONE: "bg-red-500",
  INCOMING: "bg-sky-400",
  DISCONTINUED: "bg-slate-500",
  UNKNOWN: "bg-slate-600",
};

export const STOCK_STATUS_CHIP: Record<BrandSemaphoreStatus, string> = {
  HIGH: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  MEDIUM: "border-lime-400/40 bg-lime-400/10 text-lime-100",
  LOW: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  NONE: "border-red-500/40 bg-red-500/10 text-red-200",
  INCOMING: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  DISCONTINUED: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  UNKNOWN: "border-surface-700 bg-surface-900 text-surface-400",
};

export const STOCK_LEVELS: BrandStockLevel[] = ["HIGH", "MEDIUM", "LOW", "NONE"];

const RANK: Record<BrandSemaphoreStatus, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  INCOMING: 3,
  NONE: 4,
  UNKNOWN: 5,
  DISCONTINUED: 6,
};

/** El mejor estado del producto entre todos los distribuidores (para el resumen). */
export function bestStatus(item: BrandAvailabilityItem): BrandSemaphoreStatus {
  if (item.state) return item.state;
  return item.distributors.reduce<BrandSemaphoreStatus>(
    (best, d) => (RANK[d.status] < RANK[best] ? d.status : best),
    "UNKNOWN"
  );
}

export function isAvailabilityList(rows: unknown[]): rows is BrandAvailabilityItem[] {
  const first = rows[0] as { distributors?: unknown } | undefined;
  return Array.isArray(first?.distributors);
}
