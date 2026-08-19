import type { Provider } from "@nodo/shared";

/** Producto normalizado para guardar en ProviderSyncCache. `raw` conserva la
 * respuesta original completa del proveedor — nada se descarta. */
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
  price?: number;
  currency?: string;
  stock?: number;
  imageUrl?: string;
  locationAir?: string;
  raw: unknown;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  /** Recorre el catálogo completo del proveedor, invocando onPage por cada
   * tanda para que el caller la persista sin acumular todo en memoria. */
  syncAll(credentials: Record<string, string>, onPage: (items: NormalizedProduct[]) => Promise<void>): Promise<void>;
}
