/**
 * Precios en pesos dentro del catálogo.
 *
 * Toda la web calcula en dólares: el precio de una oferta se toma como USD y se
 * pasa a pesos con la cotización elegida. Algunos proveedores (Solution Box,
 * New Tree) cotizan productos en pesos; sin esto se veían en "USD" y, al pasar
 * a pesos, ~1.400 veces más caros.
 *
 * Al recibir el catálogo, un precio en ARS se divide por la cotización elegida y
 * queda marcado (`sourceCurrency`, `fxRate`), así ordenar, comparar, sumar el
 * carrito y armar pedidos siguen en una sola moneda. Mostrado en pesos vuelve a
 * ser exactamente el precio original del proveedor.
 */

const CACHE_KEY = "fx_ars_per_usd";
const MONEY_FIELDS = ["price", "finalPrice", "previousPrice", "previousFinalPrice"] as const;

let arsPerUsd: number | null = readCache();
let waiters: ((rate: number | null) => void)[] = [];
const listeners = new Set<() => void>();

function readCache(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const n = Number(localStorage.getItem(CACHE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** La cotización de venta del dólar elegido. La setea PrefsProvider. */
export function setArsPerUsd(rate: number | null | undefined): void {
  if (!rate || !Number.isFinite(rate) || rate <= 0) return;
  if (rate === arsPerUsd) return;
  arsPerUsd = rate;
  try {
    localStorage.setItem(CACHE_KEY, String(rate));
  } catch {
    /* sin storage: solo memoria */
  }
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve(rate));
  listeners.forEach((fn) => fn());
}

export function getArsPerUsd(): number | null {
  return arsPerUsd;
}

export function onArsPerUsd(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Espera la cotización (la primera carga la trae de dolarapi). `null` si no llega a tiempo. */
export function waitArsPerUsd(timeoutMs = 5000): Promise<number | null> {
  if (arsPerUsd) return Promise.resolve(arsPerUsd);
  return new Promise((resolve) => {
    const done = (rate: number | null) => {
      clearTimeout(timer);
      resolve(rate);
    };
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== done);
      resolve(arsPerUsd);
    }, timeoutMs);
    waiters.push(done);
  });
}

export function isArsCurrency(currency: unknown): boolean {
  if (typeof currency !== "string") return false;
  const c = currency.trim().toUpperCase();
  return c === "ARS" || c === "$" || c === "AR$" || c === "PESOS" || c === "PESO";
}

export interface FxMarked {
  currency?: string | null;
  /** Moneda en la que cotizó el proveedor, cuando no era USD. */
  sourceCurrency?: "ARS" | null;
  /** Pesos por dólar usados para pasar el precio a USD. */
  fxRate?: number | null;
  /** Precio en pesos sin cotización disponible: no se muestra para no mostrar algo falso. */
  fxPending?: boolean;
}

/** Un producto con precio en pesos y todavía sin pasar a USD. */
export function needsFx(product: unknown): boolean {
  if (!product || typeof product !== "object") return false;
  const p = product as FxMarked;
  return isArsCurrency(p.currency) && !p.sourceCurrency;
}

function toUsd(value: unknown, rate: number): unknown {
  if (value == null || value === "") return value;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return value;
  return Math.round((n / rate) * 10000) / 10000;
}

/**
 * Pasa a USD un producto cotizado en pesos. Sin cotización, saca el precio y lo
 * marca `fxPending`: mejor "sin precio" que un importe 1.400 veces más alto.
 */
export function normalizeProductFx<T extends object>(product: T, rate: number | null = arsPerUsd): T {
  if (!needsFx(product)) return product;
  const p = product as T & Record<string, unknown> & { taxes?: { unitAmount: number }[] };
  if (!rate) {
    const blank: Record<string, unknown> = { ...p, fxPending: true };
    for (const field of MONEY_FIELDS) if (field in p) blank[field] = null;
    return blank as T;
  }
  const out: Record<string, unknown> = { ...p, currency: "USD", sourceCurrency: "ARS", fxRate: rate, fxPending: false };
  for (const field of MONEY_FIELDS) if (field in p) out[field] = toUsd(p[field], rate);
  if (Array.isArray(p.taxes)) {
    out.taxes = p.taxes.map((t) => ({ ...t, unitAmount: Number(toUsd(t.unitAmount, rate)) }));
  }
  return out as T;
}

/** Recorre una respuesta del catálogo (lista, `{ items }` o producto suelto). */
export function normalizeCatalogPayload<T>(data: T, rate: number | null = arsPerUsd): T {
  if (Array.isArray(data)) return data.map((item) => normalizeProductFx(item as object, rate)) as T;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return { ...obj, items: obj.items.map((item) => normalizeProductFx(item as object, rate)) } as T;
    return normalizeProductFx(obj, rate) as T;
  }
  return data;
}

/** ¿Hay algún producto en pesos en esta respuesta? */
export function payloadNeedsFx(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(needsFx);
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items.some(needsFx);
    return needsFx(obj);
  }
  return false;
}

/** Endpoints que devuelven productos del catálogo con oferta. */
const CATALOG_URL = /^\/(search\/provider\/[^/]+|catalog\/(featured|by-provider|by-category|by-brand)|providers\/[^/]+\/(catalog|products\/[^/]+))(\?|$)/;

export function isCatalogUrl(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.replace(/^https?:\/\/[^/]+/, "");
  return CATALOG_URL.test(path);
}

/**
 * Importe a mostrar en la moneda elegida. Para un precio que el proveedor dio en
 * pesos, en pesos se muestra el original exacto aunque después cambie el dólar elegido.
 */
export function displayAmount(usd: number, display: "USD" | "ARS", currentRate: number | null, source?: FxMarked | null): number {
  if (display === "USD") return usd;
  if (source?.sourceCurrency === "ARS" && source.fxRate) return usd * source.fxRate;
  return usd * (currentRate ?? 0);
}
