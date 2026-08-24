"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { ProductDTO } from "@/lib/api";
import { extractTaxLines } from "@/lib/tax";

export type CartChannel = "online" | "offline";

export interface CartScheme {
  id: string;
  name: string;
  provider: string;
}

export interface CartItem extends ProductDTO {
  qty: number;
  addedAt: number;
  channel: CartChannel;
  schemeId: string | null;
}

export type CartRef = {
  provider: string;
  externalId: string;
  channel?: CartChannel;
  schemeId?: string | null;
};

export type AddToCartOpts = {
  channel?: CartChannel;
  schemeId?: string | null;
};

interface CartContextValue {
  items: CartItem[];
  schemes: CartScheme[];
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
  hydrated: boolean;
  add: (product: ProductDTO, qty?: number, opts?: AddToCartOpts) => CartItem;
  remove: (ref: CartRef) => void;
  setQty: (ref: CartRef, qty: number) => void;
  patchItem: (ref: CartRef, data: Partial<Pick<CartItem, "taxes" | "finalPrice">>) => void;
  move: (from: CartRef, to: { channel: CartChannel; schemeId?: string | null }) => void;
  clear: (channel?: CartChannel) => void;
  clearProvider: (provider: string, channel?: CartChannel) => void;
  has: (ref: CartRef) => boolean;
  byProvider: Record<string, CartItem[]>;
  onlineByProvider: Record<string, CartItem[]>;
  offlineByProvider: Record<string, CartItem[]>;
  createScheme: (provider: string, name?: string) => CartScheme;
  renameScheme: (id: string, name: string) => void;
  deleteScheme: (id: string) => void;
  schemesFor: (provider: string) => CartScheme[];
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "tgs_cart_v2";
const LEGACY_KEY = "tgs_cart_v1";

export function cartItemKey(ref: CartRef): string {
  const channel = ref.channel ?? "online";
  const schemeId = ref.schemeId ?? "";
  return `${channel}::${ref.provider}::${schemeId}::${ref.externalId}`;
}

function normalizeRef(ref: CartRef): Required<CartRef> {
  return {
    provider: ref.provider,
    externalId: ref.externalId,
    channel: ref.channel ?? "online",
    schemeId: ref.schemeId ?? null,
  };
}

function compactProduct(product: ProductDTO): ProductDTO {
  const { raw: _raw, ...rest } = product;
  return { ...rest, taxes: extractTaxLines(product) };
}

function migrateLegacy(raw: unknown): { items: CartItem[]; schemes: CartScheme[] } {
  if (Array.isArray(raw)) {
    return {
      items: (raw as Array<CartItem & { channel?: CartChannel; schemeId?: string | null }>).map((it) => ({
        ...compactProduct(it),
        qty: it.qty,
        addedAt: it.addedAt,
        channel: it.channel === "offline" ? "offline" : "online",
        schemeId: it.schemeId ?? null,
      })),
      schemes: [],
    };
  }
  if (raw && typeof raw === "object") {
    const o = raw as { items?: CartItem[]; schemes?: CartScheme[] };
    return {
      items: (o.items ?? []).map((it) => ({
        ...compactProduct(it),
        qty: it.qty,
        addedAt: it.addedAt,
        channel: it.channel === "offline" ? "offline" : "online",
        schemeId: it.schemeId ?? null,
      })),
      schemes: Array.isArray(o.schemes) ? o.schemes : [],
    };
  }
  return { items: [], schemes: [] };
}

function groupByProvider(list: CartItem[]): Record<string, CartItem[]> {
  const map: Record<string, CartItem[]> = {};
  for (const it of list) {
    if (!map[it.provider]) map[it.provider] = [];
    map[it.provider].push(it);
  }
  return map;
}

function nextSchemeName(existing: CartScheme[], provider: string): string {
  const n = existing.filter((s) => s.provider === provider).length + 1;
  return `Esquema ${n}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [schemes, setSchemes] = useState<CartScheme[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
      if (stored) {
        const parsed = migrateLegacy(JSON.parse(stored));
        setItems(parsed.items);
        setSchemes(parsed.schemes);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, schemes }));
  }, [items, schemes, hydrated]);

  const add = useCallback((product: ProductDTO, qty = 1, opts: AddToCartOpts = {}): CartItem => {
    const ref = normalizeRef({
      provider: product.provider,
      externalId: product.externalId,
      channel: opts.channel,
      schemeId: opts.schemeId,
    });
    const k = cartItemKey(ref);
    const compact = compactProduct(product);
    let result: CartItem = { ...compact, qty, addedAt: Date.now(), channel: ref.channel, schemeId: ref.schemeId };
    setItems((prev) => {
      const idx = prev.findIndex((it) => cartItemKey(it) === k);
      if (idx >= 0) {
        const next = [...prev];
        const current = next[idx];
        result = {
          ...current,
          ...(current.taxes?.length ? {} : compact),
          qty: current.qty + qty,
          channel: ref.channel,
          schemeId: ref.schemeId,
        };
        next[idx] = result;
        return next;
      }
      return [...prev, result];
    });
    return result;
  }, []);

  const remove = useCallback((ref: CartRef) => {
    const k = cartItemKey(normalizeRef(ref));
    setItems((prev) => prev.filter((it) => cartItemKey(it) !== k));
  }, []);

  const setQty = useCallback((ref: CartRef, qty: number) => {
    const k = cartItemKey(normalizeRef(ref));
    setItems((prev) => prev.map((it) => (cartItemKey(it) === k ? { ...it, qty: Math.max(1, qty) } : it)));
  }, []);

  const patchItem = useCallback((ref: CartRef, data: Partial<Pick<CartItem, "taxes" | "finalPrice">>) => {
    const k = cartItemKey(normalizeRef(ref));
    setItems((prev) => prev.map((it) => (cartItemKey(it) === k ? { ...it, ...data } : it)));
  }, []);

  const move = useCallback((from: CartRef, to: { channel: CartChannel; schemeId?: string | null }) => {
    const src = normalizeRef(from);
    const dest = normalizeRef({
      provider: src.provider,
      externalId: src.externalId,
      channel: to.channel,
      schemeId: to.channel === "offline" ? null : (to.schemeId ?? null),
    });
    if (cartItemKey(src) === cartItemKey(dest)) return;
    setItems((prev) => {
      const srcIdx = prev.findIndex((it) => cartItemKey(it) === cartItemKey(src));
      if (srcIdx < 0) return prev;
      const moving = prev[srcIdx];
      const destKey = cartItemKey(dest);
      const destIdx = prev.findIndex((it) => cartItemKey(it) === destKey);
      const next = prev.filter((_, i) => i !== srcIdx);
      if (destIdx >= 0) {
        const adjDest = destIdx > srcIdx ? destIdx - 1 : destIdx;
        next[adjDest] = { ...next[adjDest], qty: next[adjDest].qty + moving.qty };
        return next;
      }
      return [...next, { ...moving, channel: dest.channel, schemeId: dest.schemeId }];
    });
  }, []);

  const clear = useCallback((channel?: CartChannel) => {
    if (!channel) {
      setItems([]);
      return;
    }
    setItems((prev) => prev.filter((it) => it.channel !== channel));
  }, []);

  const clearProvider = useCallback((provider: string, channel?: CartChannel) => {
    setItems((prev) => prev.filter((it) => {
      if (it.provider !== provider) return true;
      if (channel && it.channel !== channel) return true;
      return false;
    }));
  }, []);

  const has = useCallback((ref: CartRef) => {
    const k = cartItemKey(normalizeRef(ref));
    return items.some((it) => cartItemKey(it) === k);
  }, [items]);

  const createScheme = useCallback((provider: string, name?: string): CartScheme => {
    const scheme: CartScheme = {
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: (name ?? "").trim() || nextSchemeName(schemes, provider),
      provider,
    };
    setSchemes((prev) => {
      const named = { ...scheme, name: scheme.name || nextSchemeName(prev, provider) };
      return [...prev, named];
    });
    return scheme;
  }, [schemes]);

  const renameScheme = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSchemes((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
  }, []);

  const deleteScheme = useCallback((id: string) => {
    setSchemes((prev) => prev.filter((s) => s.id !== id));
    setItems((prev) => prev.map((it) => (it.schemeId === id ? { ...it, schemeId: null } : it)));
  }, []);

  const schemesFor = useCallback((provider: string) => schemes.filter((s) => s.provider === provider), [schemes]);

  const onlineItems = useMemo(() => items.filter((it) => it.channel !== "offline"), [items]);
  const offlineItems = useMemo(() => items.filter((it) => it.channel === "offline"), [items]);
  const totalCount = items.reduce((sum, it) => sum + it.qty, 0);
  const onlineCount = onlineItems.reduce((sum, it) => sum + it.qty, 0);
  const offlineCount = offlineItems.reduce((sum, it) => sum + it.qty, 0);
  const byProvider = useMemo(() => groupByProvider(items), [items]);
  const onlineByProvider = useMemo(() => groupByProvider(onlineItems), [onlineItems]);
  const offlineByProvider = useMemo(() => groupByProvider(offlineItems), [offlineItems]);

  return (
    <CartContext.Provider
      value={{
        items,
        schemes,
        totalCount,
        onlineCount,
        offlineCount,
        hydrated,
        add,
        remove,
        setQty,
        patchItem,
        move,
        clear,
        clearProvider,
        has,
        byProvider,
        onlineByProvider,
        offlineByProvider,
        createScheme,
        renameScheme,
        deleteScheme,
        schemesFor,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
