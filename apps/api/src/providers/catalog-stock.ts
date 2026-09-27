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

/**
 * Con «Ocultar productos sin precio», el distribuidor puede haber mandado la
 * oferta igual: sin importe, o sin stock. Esas no se listan. Stock null no es
 * “no informa”: en este modo es sin stock.
 */
export function catalogHideEmptyOfferWhere(
  minStockThreshold: number,
  includeOutOfStock: boolean
): Prisma.TenantProductOfferWhereInput {
  const withPrice: Prisma.TenantProductOfferWhereInput = {
    OR: [{ price: { not: null } }, { finalPrice: { not: null } }],
  };
  if (includeOutOfStock) return withPrice;
  return { AND: [withPrice, { stock: { gt: Math.max(minStockThreshold, 0) } }] };
}

/**
 * Un comercio que ya tiene precios de un proveedor (sincronizó su cuenta o cargó
 * su lista) solo ve lo que su cuenta le vende. Lo que no tiene precio de su lado
 * —una ficha que trajo la cuenta de otro local, un producto que su propia sync
 * borró, el lugar que deja la lista de otro comercio— no se puede comprar, y
 * listarlo "sin precio" hace dudar de todo el resultado.
 *
 * Vacío si ningún proveedor está en ese caso: ahí se sigue viendo la ficha
 * universal como vista previa.
 */
export function catalogPricedOnlyWhere(pricedProviders: Iterable<string>): Prisma.TenantProductOfferWhereInput[] {
  const priced = [...pricedProviders];
  if (priced.length === 0) return [];
  return [
    {
      OR: [
        { provider: { notIn: priced } },
        { price: { not: null } },
        { finalPrice: { not: null } },
      ],
    },
  ];
}

export function parseIncludeOutOfStock(value?: string | string[]): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}
