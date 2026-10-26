"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api, { uploadAuthedFile } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getArsPerUsd, isArsCurrency } from "@/lib/fx";
import { formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { useSellerSession } from "@/lib/sale-price";

/**
 * Presupuestos de venta (modo vendedor, docs/PLAN_MODO_VENDEDOR.md §8): los
 * "carritos" del vendedor para sus clientes. Los precios son de venta y los
 * calcula y congela el servidor; acá solo se muestran y se mandan.
 */

/** De dónde sale el margen de una línea (para quien ve costos; al vendedor le llega `null`, `none` o `manual`). */
export type QuoteMarginSource =
  | "product"
  | "condition"
  | "subcategory"
  | "category"
  | "provider"
  | "store"
  | "none"
  | "line"
  | "quote"
  | "manual";

export interface QuoteItem {
  /** `custom` = línea libre con precio a mano (armado, envío…). */
  kind: "product" | "custom";
  provider: string;
  externalId: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  sku: string | null;
  qty: number;
  /** Venta neta por unidad. */
  unitPrice: number | null;
  /** Venta final por unidad (con impuestos): la que se cotiza. */
  unitFinalPrice: number | null;
  /** Moneda en que lo publica el distribuidor. */
  currency: string;
  pricedAt: string;
  /** Margen propio de la línea (solo para quien ve costos). */
  marginPercent: number | null;
  marginSource: QuoteMarginSource | null;
}

/** `EXPIRED`: venció sin que el cliente decidiera. */
export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface Quote {
  id: string;
  number: number;
  initials: string | null;
  /** Nombre de referencia ("Oficina Pérez, 3 PCs"). */
  title: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  notes: string | null;
  /** Condiciones de este presupuesto; `null` = las de la plantilla. */
  terms: string | null;
  items: QuoteItem[];
  /** Total con descuento, por moneda. */
  totals: Record<string, number>;
  subtotals: Record<string, number>;
  discounts: Record<string, number>;
  itemCount: number;
  status: QuoteStatus;
  validUntil: string | null;
  /** Margen de todo el presupuesto (solo para quien ve costos). */
  marginPercent: number | null;
  discountPercent: number | null;
  /** Moneda para el cliente; `null` = la que elija quien lo mira. */
  currency: "ARS" | "USD" | null;
  /** Líneas que van al costo: sin margen configurado. */
  atCostLines: number;
  /** Quien mira ve costos: puede cambiar márgenes. */
  canEditMargins: boolean;
  sentAt: string | null;
  decidedAt: string | null;
  createdById: string;
  createdByName: string | null;
  mine: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotePriceChange {
  index: number;
  provider: string;
  externalId: string;
  name: string;
  currency: string;
  before: number | null;
  /** `null` = ya no tiene precio de venta (quedó el anterior). */
  after: number | null;
}

export type QuoteClientPatch = Partial<
  Pick<Quote, "title" | "clientName" | "clientPhone" | "clientEmail" | "notes" | "terms" | "currency" | "validUntil" | "marginPercent" | "discountPercent">
> & { status?: Exclude<QuoteStatus, "EXPIRED"> };

export interface QuoteItemPatch {
  qty?: number;
  marginPercent?: number | null;
  name?: string;
  unitFinalPrice?: number;
  currency?: "ARS" | "USD";
  ivaPercent?: number;
}

export interface QuoteCustomInput {
  name: string;
  unitFinalPrice: number;
  currency: "ARS" | "USD";
  qty?: number;
  ivaPercent?: number;
}

export type QuoteTheme = "modern" | "classic" | "minimal" | "bold";
export type QuoteFont = "sans" | "serif" | "mono";

/** Plantilla del PDF y valores por defecto de los presupuestos del comercio. */
export interface QuoteSettings {
  theme: QuoteTheme;
  accentColor: string;
  font: QuoteFont;
  logoUrl: string | null;
  businessName: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  intro: string | null;
  terms: string | null;
  footer: string | null;
  validityDays: number;
  numberPrefix: string;
  showImages: boolean;
  showSku: boolean;
  showBrand: boolean;
  priceDisplay: "FINAL" | "NET";
  maxSellerDiscount: number | null;
  updatedAt: string | null;
}

export type QuoteSettingsPatch = Partial<Omit<QuoteSettings, "logoUrl" | "updatedAt">>;

export type QuoteSort = "updated" | "created" | "number" | "validUntil";

export interface QuoteListParams {
  archived?: boolean;
  q?: string;
  createdById?: string;
  status?: QuoteStatus;
  /** Creados desde/hasta (YYYY-MM-DD). */
  from?: string;
  to?: string;
  sort?: QuoteSort;
  page?: number;
  pageSize?: number;
}

export interface QuoteListPage {
  items: Quote[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<QuoteStatus | "ALL", number>;
}

export const quotesApi = {
  list: (params: QuoteListParams = {}) =>
    api.get<QuoteListPage>("/my/quotes", {
      params: Object.fromEntries(
        Object.entries({ ...params, archived: params.archived ? "true" : undefined }).filter(([, v]) => v !== undefined && v !== "")
      ),
    }),
  get: (id: string) => api.get<Quote>(`/my/quotes/${id}`),
  create: (data: QuoteClientPatch = {}) => api.post<Quote>("/my/quotes", data),
  update: (id: string, data: QuoteClientPatch) => api.patch<Quote>(`/my/quotes/${id}`, data),
  remove: (id: string) => api.delete<{ id: string }>(`/my/quotes/${id}`),
  addItem: (id: string, data: { provider: string; externalId: string; qty?: number }) =>
    api.post<Quote>(`/my/quotes/${id}/items`, data),
  setQty: (id: string, index: number, qty: number) => api.patch<Quote>(`/my/quotes/${id}/items/${index}`, { qty }),
  updateItem: (id: string, index: number, data: QuoteItemPatch) => api.patch<Quote>(`/my/quotes/${id}/items/${index}`, data),
  moveItem: (id: string, index: number, to: number) => api.post<Quote>(`/my/quotes/${id}/items/${index}/move`, { to }),
  addCustom: (id: string, data: QuoteCustomInput) => api.post<Quote>(`/my/quotes/${id}/items/custom`, data),
  duplicate: (id: string) => api.post<Quote>(`/my/quotes/${id}/duplicate`, {}),
  markSent: (id: string) => api.post<Quote>(`/my/quotes/${id}/sent`, {}),
  settings: () => api.get<QuoteSettings>("/my/quote-settings"),
  saveSettings: (data: QuoteSettingsPatch) => api.put<QuoteSettings>("/my/quote-settings", data),
  uploadLogo: (file: File) => uploadAuthedFile("/my/quote-settings/logo", file) as Promise<QuoteSettings>,
  removeLogo: () => api.delete<QuoteSettings>("/my/quote-settings/logo"),
  removeItem: (id: string, index: number) => api.delete<Quote>(`/my/quotes/${id}/items/${index}`),
  refreshPrices: (id: string) => api.post<{ quote: Quote; changes: QuotePriceChange[] }>(`/my/quotes/${id}/refresh-prices`, {}),
  archive: (id: string) => api.post<Quote>(`/my/quotes/${id}/archive`, {}),
  unarchive: (id: string) => api.post<Quote>(`/my/quotes/${id}/unarchive`, {}),
};

/** Ficha flotante: iniciales del cliente o el número. */
export function quoteBadge(q: Pick<Quote, "initials" | "number">): string {
  return q.initials ?? `#${q.number}`;
}

export function quoteTitle(q: Pick<Quote, "number" | "clientName" | "title">): string {
  const name = q.title || q.clientName;
  return name ? `#${q.number} · ${name}` : `Presupuesto #${q.number}`;
}

/** Mensaje de error legible de una respuesta de la API. */
export function quoteError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  const msg = data?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0];
  return fallback;
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Borrador",
  SENT: "Enviado",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  DRAFT: "bg-surface-800 text-surface-300 border-surface-700",
  SENT: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  ACCEPTED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-red-500/10 text-red-300 border-red-500/30",
  EXPIRED: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

/** Número para el cliente: "P-0012" (el prefijo lo elige el comercio). */
export function quoteCode(prefix: string | null | undefined, number: number): string {
  return `${prefix ?? ""}${String(number).padStart(4, "0")}`;
}

/** Fecha corta argentina ("15/10/2026"). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Importe como se muestra: pesos sin centavos, dólares con centavos. */
export function shownAmount(n: number, currency: "ARS" | "USD"): number {
  return currency === "ARS" ? Math.round(n) : Math.round(n * 100) / 100;
}

export interface QuoteLineAmounts {
  unitFinal: number;
  unitNet: number;
  totalFinal: number;
  totalNet: number;
}

/**
 * Las cuentas del presupuesto en la moneda en que se muestra. Cada precio por
 * unidad se redondea a lo que se ve (pesos enteros, centavos de dólar) y de ahí
 * sale todo lo demás, así las líneas suman exacto el subtotal y el subtotal
 * menos el descuento da el total: en la pantalla, el PDF, WhatsApp y la lista.
 * `missingRate`: hay precios que no se pudieron pasar (falta la cotización).
 */
export function quoteAmounts(
  items: Pick<QuoteItem, "unitFinalPrice" | "unitPrice" | "currency" | "qty">[],
  discountPercent: number | null | undefined,
  currency: "ARS" | "USD",
  convert: (amount: number | null, source: string) => number | null
): { lines: (QuoteLineAmounts | null)[]; subtotalFinal: number; subtotalNet: number; discount: number; total: number; missingRate: boolean } {
  const shown = (n: number) => shownAmount(n, currency);
  let subtotalFinal = 0;
  let subtotalNet = 0;
  let missingRate = false;
  const lines = items.map((it) => {
    if (it.unitFinalPrice == null) return null;
    const final = convert(it.unitFinalPrice, it.currency);
    const net = convert(it.unitPrice ?? it.unitFinalPrice, it.currency);
    if (final == null || net == null) {
      missingRate = true;
      return null;
    }
    const unitFinal = shown(final);
    const unitNet = shown(net);
    const line = { unitFinal, unitNet, totalFinal: shown(unitFinal * it.qty), totalNet: shown(unitNet * it.qty) };
    subtotalFinal += line.totalFinal;
    subtotalNet += line.totalNet;
    return line;
  });
  subtotalFinal = shown(subtotalFinal);
  subtotalNet = shown(subtotalNet);
  const rate = discountPercent && discountPercent > 0 ? Math.min(100, discountPercent) / 100 : 0;
  const discount = shown(subtotalFinal * rate);
  return { lines, subtotalFinal, subtotalNet, discount, total: shown(subtotalFinal - discount), missingRate };
}

/**
 * Pasa importes a la moneda del presupuesto (o la que eligió quien mira) con la
 * cotización del día. Devuelve números para el PDF y el texto, y el formato.
 */
export function useQuoteConverter(target: "ARS" | "USD" | null | undefined) {
  const { currency: pref, currentRate } = usePrefs();
  const currency: "ARS" | "USD" = target ?? (pref === "ARS" ? "ARS" : "USD");
  const rate = currentRate?.venta ?? getArsPerUsd() ?? null;
  const convert = useCallback(
    (amount: number | null, source: string): number | null => {
      if (amount == null) return null;
      const fromArs = isArsCurrency(source);
      if (currency === "ARS") return fromArs ? amount : rate ? amount * rate : null;
      return fromArs ? (rate ? amount / rate : null) : amount;
    },
    [currency, rate]
  );
  const format = useCallback((n: number | null) => (n == null ? "—" : currency === "ARS" ? formatARS(n) : formatUSD(n)), [currency]);
  return { currency, rate, convert, format };
}

/**
 * Importes en la moneda que eligió el usuario. Un precio publicado en pesos se
 * muestra exacto en pesos y en dólares se pasa con la cotización del día.
 */
export function useQuoteMoney() {
  const { currency, currentRate } = usePrefs();
  return useCallback(
    (amount: number | null, sourceCurrency: string): string => {
      if (amount == null) return "—";
      const fromArs = isArsCurrency(sourceCurrency);
      if (currency === "ARS") {
        if (fromArs) return formatARS(amount);
        const rate = currentRate?.venta ?? getArsPerUsd();
        return rate ? formatARS(amount * rate) : formatUSD(amount);
      }
      if (!fromArs) return formatUSD(amount);
      const rate = getArsPerUsd() ?? currentRate?.venta ?? null;
      return rate ? formatUSD(amount / rate) : formatARS(amount);
    },
    [currency, currentRate]
  );
}

/**
 * Total del presupuesto en la moneda elegida (puede mezclar USD y pesos). Mismo
 * cálculo que el PDF: convierte cada línea, suma y recién ahí aplica el
 * descuento, así la lista muestra el mismo número que ve el cliente.
 */
export function useQuoteTotal() {
  const { currency, currentRate } = usePrefs();
  return useCallback(
    (q: Pick<Quote, "items"> & Partial<Pick<Quote, "currency" | "discountPercent">>): string => {
      // Las mismas cuentas que el PDF (quoteAmounts), para que la lista diga lo mismo.
      const rate = currentRate?.venta ?? getArsPerUsd();
      const target: "ARS" | "USD" = q.currency ?? (currency === "ARS" ? "ARS" : "USD");
      const convert = (amount: number | null, source: string): number | null => {
        if (amount == null) return null;
        const ars = isArsCurrency(source);
        if (target === "ARS") return ars ? amount : rate ? amount * rate : null;
        return ars ? (rate ? amount / rate : null) : amount;
      };
      const { total } = quoteAmounts(q.items, q.discountPercent, target, convert);
      return target === "ARS" ? formatARS(total) : formatUSD(total);
    },
    [currency, currentRate]
  );
}

interface QuotesContextValue {
  /** El plan tiene modo vendedor: hay presupuestos. */
  enabled: boolean;
  loaded: boolean;
  /** Presupuestos activos (no archivados) de quien está logueado. */
  mine: Quote[];
  /**
   * Presupuesto al que va lo que se agrega. Para el vendedor es la ficha
   * resaltada de la burbuja; para el resto, el que eligió seguir armando.
   */
  active: Quote | null;
  setActive: (id: string | null) => void;
  /** Último producto agregado (para el aviso en la ficha flotante). */
  lastAdded: { quoteId: string; name: string; at: number } | null;
  create: (data?: QuoteClientPatch) => Promise<Quote>;
  /** Agrega al presupuesto `quoteId` (y lo deja activo), al activo, o crea uno nuevo. */
  add: (product: { provider: string; externalId: string; name?: string }, qty?: number, quoteId?: string) => Promise<Quote>;
  setQty: (id: string, index: number, qty: number) => Promise<void>;
  removeItem: (id: string, index: number) => Promise<void>;
  updateClient: (id: string, data: QuoteClientPatch) => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refreshPrices: (id: string) => Promise<QuotePriceChange[]>;
  /** Vuelve a pedir la lista (p. ej. al volver a la pestaña). */
  reload: () => Promise<void>;
  /** Reemplaza un presupuesto que cambió en otra pantalla. */
  upsert: (q: Quote) => void;
}

const QuotesContext = createContext<QuotesContextValue | null>(null);

/**
 * El vendedor guarda la ficha activa de la burbuja; quien compra, el presupuesto
 * que eligió seguir armando. Son claves distintas: al dejar de ver la app como
 * vendedor no aparece una barra de "armando" que nadie pidió.
 */
const activeKey = (userId: string, seller: boolean) =>
  seller ? `nodo.quote.active:${userId}` : `nodo.quote.building:${userId}`;

function readActive(userId: string | undefined, seller: boolean): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(activeKey(userId, seller));
  } catch {
    return null;
  }
}

function writeActive(userId: string | undefined, seller: boolean, id: string | null) {
  if (!userId) return;
  try {
    if (id) localStorage.setItem(activeKey(userId, seller), id);
    else localStorage.removeItem(activeKey(userId, seller));
  } catch {
    /* sin storage: el activo vive en memoria */
  }
}

export function QuotesProvider({ children }: { children: React.ReactNode }) {
  const { sellerMode, isSeller } = useSellerSession();
  const userId = getUser()?.id;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<QuotesContextValue["lastAdded"]>(null);
  // Un agregado a la vez: dos clics rápidos sin activo no crean dos presupuestos.
  const pendingCreate = useRef<Promise<Quote> | null>(null);

  const reload = useCallback(async () => {
    if (!sellerMode) return;
    try {
      // Para la burbuja y "Agregar a…": los 100 más recientes de quien mira.
      const { data } = await quotesApi.list({ createdById: userId ?? undefined, pageSize: 100 });
      setQuotes(data.items);
    } finally {
      setLoaded(true);
    }
  }, [sellerMode, userId]);

  useEffect(() => {
    setQuotes([]);
    setLoaded(false);
    if (sellerMode) void reload().catch(() => undefined);
  }, [sellerMode, userId, reload]);

  useEffect(() => {
    setActiveId(readActive(userId, isSeller));
  }, [userId, isSeller]);

  const mine = useMemo(() => quotes.filter((q) => q.mine && !q.archivedAt), [quotes]);
  const active = useMemo(() => mine.find((q) => q.id === activeId) ?? null, [mine, activeId]);

  const setActive = useCallback(
    (id: string | null) => {
      setActiveId(id);
      writeActive(userId, isSeller, id);
    },
    [userId, isSeller]
  );

  const upsert = useCallback((q: Quote) => {
    setQuotes((prev) => {
      const without = prev.filter((x) => x.id !== q.id);
      return [q, ...without].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const drop = useCallback(
    (id: string) => {
      setQuotes((prev) => prev.filter((x) => x.id !== id));
      if (activeId === id) setActive(null);
    },
    [activeId, setActive]
  );

  const create = useCallback(
    async (data: QuoteClientPatch = {}) => {
      const { data: q } = await quotesApi.create(data);
      upsert(q);
      setActive(q.id);
      return q;
    },
    [upsert, setActive]
  );

  const add = useCallback(
    async (product: { provider: string; externalId: string; name?: string }, qty = 1, quoteId?: string) => {
      let target: Pick<Quote, "id"> | null = quoteId ? { id: quoteId } : active;
      if (quoteId) setActive(quoteId);
      if (!target) {
        pendingCreate.current ??= create().finally(() => {
          pendingCreate.current = null;
        });
        target = await pendingCreate.current;
      }
      const { data: q } = await quotesApi.addItem(target.id, { provider: product.provider, externalId: product.externalId, qty });
      upsert(q);
      setLastAdded({ quoteId: q.id, name: product.name ?? "Producto", at: Date.now() });
      return q;
    },
    [active, create, upsert, setActive]
  );

  const setQty = useCallback(
    async (id: string, index: number, qty: number) => {
      upsert((await quotesApi.setQty(id, index, qty)).data);
    },
    [upsert]
  );

  const removeItem = useCallback(
    async (id: string, index: number) => {
      upsert((await quotesApi.removeItem(id, index)).data);
    },
    [upsert]
  );

  const updateClient = useCallback(
    async (id: string, data: QuoteClientPatch) => {
      upsert((await quotesApi.update(id, data)).data);
    },
    [upsert]
  );

  const archive = useCallback(
    async (id: string) => {
      await quotesApi.archive(id);
      drop(id);
    },
    [drop]
  );

  const remove = useCallback(
    async (id: string) => {
      await quotesApi.remove(id);
      drop(id);
    },
    [drop]
  );

  const refreshPrices = useCallback(
    async (id: string) => {
      const { data } = await quotesApi.refreshPrices(id);
      upsert(data.quote);
      return data.changes;
    },
    [upsert]
  );

  const value = useMemo<QuotesContextValue>(
    () => ({
      enabled: sellerMode,
      loaded,
      mine,
      active,
      setActive,
      lastAdded,
      create,
      add,
      setQty,
      removeItem,
      updateClient,
      archive,
      remove,
      refreshPrices,
      reload,
      upsert,
    }),
    [sellerMode, loaded, mine, active, setActive, lastAdded, create, add, setQty, removeItem, updateClient, archive, remove, refreshPrices, reload, upsert]
  );

  return <QuotesContext.Provider value={value}>{children}</QuotesContext.Provider>;
}

const reject = () => Promise.reject(new Error("Presupuestos no disponibles"));

/** Fuera del área de la app (o sin modo vendedor) no hay presupuestos. */
const DISABLED: QuotesContextValue = {
  enabled: false,
  loaded: true,
  mine: [],
  active: null,
  setActive: () => undefined,
  lastAdded: null,
  create: reject,
  add: reject,
  setQty: reject,
  removeItem: reject,
  updateClient: reject,
  archive: reject,
  remove: reject,
  refreshPrices: reject,
  reload: async () => undefined,
  upsert: () => undefined,
};

export function useQuotes(): QuotesContextValue {
  return useContext(QuotesContext) ?? DISABLED;
}
