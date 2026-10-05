"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
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

export interface QuoteItem {
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
}

export interface Quote {
  id: string;
  number: number;
  initials: string | null;
  clientName: string | null;
  clientPhone: string | null;
  notes: string | null;
  items: QuoteItem[];
  totals: Record<string, number>;
  itemCount: number;
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

export type QuoteClientPatch = Partial<Pick<Quote, "clientName" | "clientPhone" | "notes">>;

export const quotesApi = {
  list: (params: { archived?: boolean; q?: string; createdById?: string } = {}) =>
    api.get<Quote[]>("/my/quotes", {
      params: {
        ...(params.archived ? { archived: "true" } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.createdById ? { createdById: params.createdById } : {}),
      },
    }),
  create: (data: QuoteClientPatch = {}) => api.post<Quote>("/my/quotes", data),
  update: (id: string, data: QuoteClientPatch) => api.patch<Quote>(`/my/quotes/${id}`, data),
  remove: (id: string) => api.delete<{ id: string }>(`/my/quotes/${id}`),
  addItem: (id: string, data: { provider: string; externalId: string; qty?: number }) =>
    api.post<Quote>(`/my/quotes/${id}/items`, data),
  setQty: (id: string, index: number, qty: number) => api.patch<Quote>(`/my/quotes/${id}/items/${index}`, { qty }),
  removeItem: (id: string, index: number) => api.delete<Quote>(`/my/quotes/${id}/items/${index}`),
  refreshPrices: (id: string) => api.post<{ quote: Quote; changes: QuotePriceChange[] }>(`/my/quotes/${id}/refresh-prices`, {}),
  archive: (id: string) => api.post<Quote>(`/my/quotes/${id}/archive`, {}),
  unarchive: (id: string) => api.post<Quote>(`/my/quotes/${id}/unarchive`, {}),
};

/** Ficha flotante: iniciales del cliente o el número. */
export function quoteBadge(q: Pick<Quote, "initials" | "number">): string {
  return q.initials ?? `#${q.number}`;
}

export function quoteTitle(q: Pick<Quote, "number" | "clientName">): string {
  return q.clientName ? `#${q.number} · ${q.clientName}` : `Presupuesto #${q.number}`;
}

/** Mensaje de error legible de una respuesta de la API. */
export function quoteError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: unknown } } })?.response?.data;
  const msg = data?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0];
  return fallback;
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

/** Total del presupuesto en la moneda elegida (puede mezclar USD y pesos). */
export function useQuoteTotal() {
  const { currency, currentRate } = usePrefs();
  return useCallback(
    (q: Pick<Quote, "items">): string => {
      const rate = currentRate?.venta ?? getArsPerUsd();
      let total = 0;
      for (const it of q.items) {
        if (it.unitFinalPrice == null) continue;
        const line = it.unitFinalPrice * it.qty;
        const ars = isArsCurrency(it.currency);
        if (currency === "ARS") total += ars ? line : rate ? line * rate : 0;
        else total += ars ? (rate ? line / rate : 0) : line;
      }
      return currency === "ARS" ? formatARS(total) : formatUSD(total);
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
  active: Quote | null;
  setActive: (id: string | null) => void;
  /** Último producto agregado (para el aviso en la ficha flotante). */
  lastAdded: { quoteId: string; name: string; at: number } | null;
  create: (data?: QuoteClientPatch) => Promise<Quote>;
  add: (product: { provider: string; externalId: string; name?: string }, qty?: number) => Promise<Quote>;
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

const activeKey = (userId: string) => `nodo.quote.active:${userId}`;

function readActive(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(activeKey(userId));
  } catch {
    return null;
  }
}

function writeActive(userId: string | undefined, id: string | null) {
  if (!userId) return;
  try {
    if (id) localStorage.setItem(activeKey(userId), id);
    else localStorage.removeItem(activeKey(userId));
  } catch {
    /* sin storage: el activo vive en memoria */
  }
}

export function QuotesProvider({ children }: { children: React.ReactNode }) {
  const { sellerMode } = useSellerSession();
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
      const { data } = await quotesApi.list();
      setQuotes(data);
    } finally {
      setLoaded(true);
    }
  }, [sellerMode]);

  useEffect(() => {
    setQuotes([]);
    setLoaded(false);
    setActiveId(readActive(userId));
    if (sellerMode) void reload().catch(() => undefined);
  }, [sellerMode, userId, reload]);

  const mine = useMemo(() => quotes.filter((q) => q.mine && !q.archivedAt), [quotes]);
  const active = useMemo(() => mine.find((q) => q.id === activeId) ?? null, [mine, activeId]);

  const setActive = useCallback(
    (id: string | null) => {
      setActiveId(id);
      writeActive(userId, id);
    },
    [userId]
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
    async (product: { provider: string; externalId: string; name?: string }, qty = 1) => {
      let target = active;
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
    [active, create, upsert]
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
