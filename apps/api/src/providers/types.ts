import type { Provider } from "@nodo/shared";

/**
 * Producto normalizado para guardar en ProviderSyncCache. `raw` conserva la
 * respuesta original completa del proveedor — nada se descarta.
 *
 * Los campos son un superset: cada proveedor completa los que su API
 * realmente trae. Si dos proveedores exponen el mismo concepto con nombres
 * distintos (ej. "garantia" en ELIT vs "GARANTIA" en NewBytes), ambos
 * escriben al mismo campo acá. Si un proveedor no trae ese dato, el campo
 * queda `undefined` para él — no se inventa.
 */
export interface NormalizedProduct {
  externalId: string;
  sku?: string;
  partNumber?: string;
  ean?: string;
  name: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  longDescription?: string;
  price?: number;
  finalPrice?: number;
  currency?: string;
  ivaPercent?: number;
  stock?: number;
  stockStatus?: string;
  imageUrl?: string;
  productUrl?: string;
  locationAir?: string;
  warranty?: string;
  weight?: number;
  weightUnit?: string;
  height?: number;
  width?: number;
  length?: number;
  dimensionsUnit?: string;
  volume?: number;
  tags?: string;
  raw: unknown;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  /** Recorre el catálogo completo del proveedor, invocando onPage por cada
   * tanda para que el caller la persista sin acumular todo en memoria. */
  syncAll(credentials: Record<string, string>, onPage: (items: NormalizedProduct[]) => Promise<void>): Promise<void>;
}
