/**
 * API de catálogo: tipos y valores compartidos entre la API y la web.
 * Diseño completo en docs/PLAN_API_CATALOGO.md.
 */

/** Módulo extra en Base y Pro. Incluido en Custom. */
export const CATALOG_API_ADDON_PRICE_USD = 10;

export const CATALOG_API_SCOPES = [
  "catalog:read",
  "changes:read",
  "export:read",
  "feeds:read",
  "webhooks:manage",
] as const;
export type CatalogApiScope = (typeof CATALOG_API_SCOPES)[number];

export const CATALOG_API_SCOPE_LABELS: Record<CatalogApiScope, string> = {
  "catalog:read": "Leer productos, ofertas y taxonomía",
  "changes:read": "Leer cambios incrementales",
  "export:read": "Exportar el catálogo (CSV, XLSX, JSON)",
  "feeds:read": "Feeds de Google Merchant y Meta",
  "webhooks:manage": "Administrar webhooks por API",
};

export const CATALOG_API_WEBHOOK_EVENTS = [
  "offer.created",
  "offer.updated",
  "offer.removed",
  "price.changed",
  "stock.changed",
  "provider.sync_paused",
  "provider.sync_resumed",
] as const;
export type CatalogApiWebhookEvent = (typeof CATALOG_API_WEBHOOK_EVENTS)[number];

export const CATALOG_API_WEBHOOK_EVENT_LABELS: Record<CatalogApiWebhookEvent, string> = {
  "offer.created": "Entra un producto",
  "offer.updated": "Cambia un producto (cualquier dato)",
  "offer.removed": "Sale un producto",
  "price.changed": "Cambia un precio",
  "stock.changed": "Cambia el stock",
  "provider.sync_paused": "Un distribuidor pausó su sincronización",
  "provider.sync_resumed": "Un distribuidor volvió a sincronizar",
};

export type CatalogApiView = "offers" | "products";
export type CatalogApiRounding = "none" | "0.01" | "1" | "10" | "99";
export type CatalogApiCurrency = "USD" | "ARS";
export type CatalogApiFxRate = "oficial" | "blue" | "mep" | "tarjeta" | "fixed";

export interface ApiClientConfig {
  defaultView: CatalogApiView;
  providers: { mode: "all" | "only"; keys: string[] };
  /** hidden = alias "Proveedor N" con id estable; visible = nombre real. */
  providerIdentity: "hidden" | "visible";
  includeOutOfStock: boolean;
  minStock: number;
  price: {
    includeCost: boolean;
    includeTaxes: boolean;
    includeSalePrice: boolean;
    /** provider = el margen que el comercio ya usa en NODO por distribuidor. */
    markup: { mode: "provider" | "fixed"; percent?: number };
    rounding: CatalogApiRounding;
    currency: CatalogApiCurrency;
    fxRate: CatalogApiFxRate;
    fxFixed?: number;
  };
  fields: { raw: boolean; priceHistory: boolean };
  feed: {
    /** Link de cada producto en la tienda: {id}, {sku}, {ean}, {partNumber}, {slug}. */
    productUrlTemplate?: string;
  };
}

export const DEFAULT_API_CLIENT_CONFIG: ApiClientConfig = {
  defaultView: "products",
  providers: { mode: "all", keys: [] },
  providerIdentity: "hidden",
  includeOutOfStock: false,
  minStock: 0,
  price: {
    includeCost: true,
    includeTaxes: true,
    includeSalePrice: true,
    markup: { mode: "provider" },
    rounding: "none",
    currency: "USD",
    fxRate: "oficial",
  },
  fields: { raw: false, priceHistory: false },
  feed: {},
};

/** Config guardada (puede ser vieja o parcial) completada con los defaults. */
export function resolveApiClientConfig(stored: unknown): ApiClientConfig {
  const s = stored && typeof stored === "object" ? (stored as Partial<ApiClientConfig>) : {};
  const d = DEFAULT_API_CLIENT_CONFIG;
  return {
    defaultView: s.defaultView === "offers" ? "offers" : d.defaultView,
    providers: {
      mode: s.providers?.mode === "only" ? "only" : "all",
      keys: Array.isArray(s.providers?.keys) ? s.providers!.keys.filter((k) => typeof k === "string") : [],
    },
    providerIdentity: s.providerIdentity === "visible" ? "visible" : "hidden",
    includeOutOfStock: typeof s.includeOutOfStock === "boolean" ? s.includeOutOfStock : d.includeOutOfStock,
    minStock: Number.isFinite(s.minStock) && (s.minStock as number) >= 0 ? Math.floor(s.minStock as number) : d.minStock,
    price: { ...d.price, ...(s.price ?? {}), markup: { ...d.price.markup, ...(s.price?.markup ?? {}) } },
    fields: { ...d.fields, ...(s.fields ?? {}) },
    feed: { ...d.feed, ...(s.feed ?? {}) },
  };
}

export type ApiClientStatus = "ACTIVE" | "REVOKED";

export interface ApiClientView {
  id: string;
  name: string;
  publicKey: string;
  secretLast4: string;
  feedToken: string;
  status: ApiClientStatus;
  scopes: CatalogApiScope[];
  config: ApiClientConfig;
  ipAllowlist: string[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  feeds: { google: string; meta: string };
}

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export interface DeliveryView {
  id: string;
  eventId: string;
  type: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
}

export interface WebhookView {
  id: string;
  url: string;
  events: CatalogApiWebhookEvent[];
  active: boolean;
  consecutiveFailures: number;
  disabledAt: string | null;
  disabledReason: string | null;
  createdAt: string;
  lastDelivery: DeliveryView | null;
}

export interface CatalogApiAddonState {
  enabled: boolean;
  /** Custom lo trae incluido. */
  includedInPlan: boolean;
  priceUsd: number;
  since: string | null;
}

export interface CatalogApiOverview {
  addon: CatalogApiAddonState;
  canManage: boolean;
  clients: ApiClientView[];
  providers: { key: string; label: string }[];
  docsUrl: string;
  baseUrl: string;
}
