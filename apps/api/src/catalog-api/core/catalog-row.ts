import type { TaxLine } from "@nodo/shared";

/**
 * Una oferta del catálogo del comercio, ya resuelta (ficha canónica, costo e
 * impuestos), sin depender de ninguna key. Es lo que se guarda en la foto en
 * memoria; cada key aplica después su config (margen, moneda, stock, alias).
 */
export interface CatalogRow {
  offerId: string;
  provider: string;
  externalId: string;
  groupKey: string;
  productId: string;

  sku: string | null;
  partNumber: string | null;
  ean: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  imageAiSelected: boolean;
  productUrl: string | null;
  warranty: string | null;
  weight: number | null;
  weightUnit: string | null;
  height: number | null;
  width: number | null;
  length: number | null;
  dimensionsUnit: string | null;
  volume: number | null;
  tags: string[];

  /** Moneda de la oferta (la del distribuidor). */
  currency: string;
  /** Costo neto unitario (con el descuento pactado en listas base, sin margen). */
  costNet: number | null;
  costTaxes: TaxLine[];
  ivaPercent: number | null;
  /** Margen que el comercio usa en NODO para este distribuidor. */
  markupPercent: number;
  /** Stock como lo ve el comercio (con su umbral mínimo). `null` = el distribuidor no informa. */
  stock: number | null;
  stockStatus: string | null;
  /** Umbral mínimo del comercio para este distribuidor. */
  minStockThreshold: number;
  /** «Ocultar sin precio/stock»: sin stock informado cuenta como sin stock. */
  strictStock: boolean;
  source: string;
  syncedAt: Date;
  updatedAt: Date;
  /** Para buscar: nombre, marca, sku, part number y EAN en minúsculas y sin acentos. */
  searchText: string;
}

/** Estado de sincronización de un distribuidor del comercio. */
export interface ProviderInfo {
  key: string;
  name: string;
  aliasId: string;
  aliasName: string;
  lastSyncedAt: Date | null;
  stale: boolean;
  status: "ok" | "paused" | "error";
  pauseReason: string | null;
}

export interface CatalogSnapshot {
  tenantId: string;
  builtAt: Date;
  rows: CatalogRow[];
  providers: Map<string, ProviderInfo>;
}
