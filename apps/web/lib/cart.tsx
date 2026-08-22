"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { ProductDTO } from "@/lib/api";
import { extractTaxLines } from "@/lib/tax";

export interface CartItem extends ProductDTO {
  qty: number;
  addedAt: number;
}

interface CartContextValue {
  items: CartItem[];
  totalCount: number;
  hydrated: boolean;
  add: (product: ProductDTO, qty?: number) => void;
  remove: (provider: string, externalId: string) => void;
  setQty: (provider: string, externalId: string, qty: number) => void;
  patchItem: (provider: string, externalId: string, data: Partial<Pick<CartItem, "taxes" | "finalPrice">>) => void;
  clear: () => void;
  clearProvider: (provider: string) => void;
  has: (provider: string, externalId: string) => boolean;
  byProvider: Record<string, CartItem[]>;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "tgs_cart_v1";

function key(provider: string, externalId: string) {
  return `${provider}::${externalId}`;
}

function compactProduct(product: ProductDTO): ProductDTO {
  const { raw: _raw, ...rest } = product;
  return { ...rest, taxes: extractTaxLines(product) };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[];
        setItems(parsed.map((it) => {
          const compacted = compactProduct(it);
          return { ...compacted, qty: it.qty, addedAt: it.addedAt };
        }));
      }
    } catch { /**/ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const add = useCallback((product: ProductDTO, qty = 1) => {
    setItems((prev) => {
      const k = key(product.provider, product.externalId);
      const idx = prev.findIndex((it) => key(it.provider, it.externalId) === k);
      const compact = compactProduct(product);
      if (idx >= 0) {
        const next = [...prev];
        const current = next[idx];
        next[idx] = {
          ...current,
          ...(current.taxes?.length ? {} : compact),
          qty: current.qty + qty,
        };
        return next;
      }
      return [...prev, { ...compact, qty, addedAt: Date.now() }];
    });
  }, []);

  const remove = useCallback((provider: string, externalId: string) => {
    const k = key(provider, externalId);
    setItems((prev) => prev.filter((it) => key(it.provider, it.externalId) !== k));
  }, []);

  const setQty = useCallback((provider: string, externalId: string, qty: number) => {
    const k = key(provider, externalId);
    setItems((prev) => prev.map((it) => key(it.provider, it.externalId) === k ? { ...it, qty: Math.max(1, qty) } : it));
  }, []);

  const patchItem = useCallback((
    provider: string,
    externalId: string,
    data: Partial<Pick<CartItem, "taxes" | "finalPrice">>
  ) => {
    const k = key(provider, externalId);
    setItems((prev) => prev.map((it) => (
      key(it.provider, it.externalId) === k ? { ...it, ...data } : it
    )));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const clearProvider = useCallback((provider: string) => {
    setItems((prev) => prev.filter((it) => it.provider !== provider));
  }, []);

  const has = useCallback((provider: string, externalId: string) => {
    const k = key(provider, externalId);
    return items.some((it) => key(it.provider, it.externalId) === k);
  }, [items]);

  const totalCount = items.reduce((sum, it) => sum + it.qty, 0);

  const byProvider = useMemo(() => {
    const map: Record<string, CartItem[]> = {};
    for (const it of items) {
      if (!map[it.provider]) map[it.provider] = [];
      map[it.provider].push(it);
    }
    return map;
  }, [items]);

  return (
    <CartContext.Provider value={{ items, totalCount, hydrated, add, remove, setQty, patchItem, clear, clearProvider, has, byProvider }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
