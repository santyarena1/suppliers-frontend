import type { Prisma } from "@prisma/client";

/**
 * Un producto está "en catálogo" si tiene stock vendible. Stock `null` es
 * "el proveedor no informa cantidad": no es lo mismo que 0, así que se muestra.
 * El umbral del comercio convierte cantidades chicas en 0 al leer.
 */
export function displayedStock(
  rawStock: number | null | undefined,
  minStockThreshold: number
): number | null {
  if (rawStock == null) return null;
  if (minStockThreshold > 0 && rawStock <= minStockThreshold) return 0;
  return rawStock;
}

export function isDisplayedInStock(
  rawStock: number | null | undefined,
  minStockThreshold: number
): boolean {
  const stock = displayedStock(rawStock, minStockThreshold);
  return stock == null || stock > 0;
}

/** Si la config del distribuidor no es «Mostrar igual», el catálogo oculta stock 0. */
export function hidesZeroStockFromCatalog(zeroStockAction?: string | null): boolean {
  return Boolean(zeroStockAction) && zeroStockAction !== "KEEP";
}

/** Filtro Prisma: respeta zeroStockAction y el pedido explícito de ver sin stock. */
export function catalogStockWhere(
  includeOutOfStock: boolean,
  minStockThreshold: number,
  zeroStockAction?: string | null
): Prisma.TenantProductOfferWhereInput {
  if (includeOutOfStock || !hidesZeroStockFromCatalog(zeroStockAction)) return {};
  const min = Math.max(minStockThreshold, 0);
  return {
    OR: [{ stock: null }, { stock: { gt: min } }],
  };
}

export function parseIncludeOutOfStock(value?: string | string[]): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}
