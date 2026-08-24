"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { cartApi, type CartApiItem, type ProductDTO } from "@/lib/api";
import { SESSION_EVENT, getTenant, getToken } from "@/lib/auth";
import { canMutateCart } from "@/lib/commerce";
import { extractTaxLines } from "@/lib/tax";

export interface CartItem extends ProductDTO {
  qty: number;
  addedAt: number;
  cartItemId?: string;
}

interface CartContextValue {
  items: CartItem[];
  totalCount: number;
  hydrated: boolean;
  canMutate: boolean;
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

function key(provider: string, externalId: string) {
  return `${provider}::${externalId}`;
}

function compactProduct(product: ProductDTO): ProductDTO {
  const { raw: _raw, ...rest } = product;
  return { ...rest, taxes: extractTaxLines(product) };
}

function fromApi(row: CartApiItem): CartItem {
  const snap = row.snapshot && typeof row.snapshot === "object" ? (row.snapshot as Partial<ProductDTO>) : {};
  return {
    ...snap,
    provider: row.provider,
    externalId: row.externalId,
    name: row.name || snap.name || "",
    price: row.price ?? snap.price ?? "",
    imageUrl: row.imageUrl || snap.imageUrl || "",
    qty: row.quantity,
    addedAt: new Date(row.createdAt).getTime(),
    cartItemId: row.id,
  };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [canMutate, setCanMutate] = useState(false);
  const ids = useRef<Map<string, string>>(new Map());

  const remember = useCallback((list: CartItem[]) => {
    const next = new Map<string, string>();
    for (const it of list) {
      if (it.cartItemId) next.set(key(it.provider, it.externalId), it.cartItemId);
    }
    ids.current = next;
  }, []);

  const reload = useCallback(async () => {
    if (!getToken() || !getTenant()) {
      setItems([]);
      ids.current = new Map();
      setCanMutate(false);
      setHydrated(true);
      return;
    }
    setCanMutate(canMutateCart());
    try {
      const res = await cartApi.list();
      const list = (res.data ?? []).map(fromApi);
      remember(list);
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, [remember]);

  useEffect(() => {
    void reload();
    const onSession = () => { void reload(); };
    window.addEventListener(SESSION_EVENT, onSession);
    return () => window.removeEventListener(SESSION_EVENT, onSession);
  }, [reload]);

  const add = useCallback((product: ProductDTO, qty = 1) => {
    if (!canMutateCart()) return;
    const compact = compactProduct(product);
    setItems((prev) => {
      const k = key(product.provider, product.externalId);
      const idx = prev.findIndex((it) => key(it.provider, it.externalId) === k);
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
    void cartApi
      .add({
        provider: product.provider,
        externalId: product.externalId,
        name: compact.name,
        price: String(compact.price ?? ""),
        imageUrl: compact.imageUrl ?? "",
        quantity: qty,
        snapshot: compact as unknown as Record<string, unknown>,
      })
      .then((res) => {
        if (res.data?.id) ids.current.set(key(product.provider, product.externalId), res.data.id);
      })
      .catch(() => { void reload(); });
  }, [reload]);

  const remove = useCallback((provider: string, externalId: string) => {
    if (!canMutateCart()) return;
    const id = ids.current.get(key(provider, externalId));
    setItems((prev) => prev.filter((it) => key(it.provider, it.externalId) !== key(provider, externalId)));
    if (!id) { void reload(); return; }
    void cartApi.remove(id).catch(() => { void reload(); });
    ids.current.delete(key(provider, externalId));
  }, [reload]);

  const setQty = useCallback((provider: string, externalId: string, qty: number) => {
    if (!canMutateCart()) return;
    const k = key(provider, externalId);
    if (qty < 1) {
      remove(provider, externalId);
      return;
    }
    setItems((prev) => prev.map((it) => key(it.provider, it.externalId) === k ? { ...it, qty: Math.max(1, qty) } : it));
    const id = ids.current.get(k);
    if (!id) { void reload(); return; }
    void cartApi.update(id, { quantity: Math.max(1, qty) }).catch(() => { void reload(); });
  }, [remove, reload]);

  const patchItem = useCallback((
    provider: string,
    externalId: string,
    data: Partial<Pick<CartItem, "taxes" | "finalPrice">>
  ) => {
    const k = key(provider, externalId);
    setItems((prev) => {
      const next = prev.map((it) => (
        key(it.provider, it.externalId) === k ? { ...it, ...data } : it
      ));
      const item = next.find((it) => key(it.provider, it.externalId) === k);
      const id = ids.current.get(k);
      if (item && id && canMutateCart()) {
        const { qty: _qty, addedAt: _addedAt, cartItemId: _id, ...snapshot } = item;
        void cartApi.update(id, { snapshot: snapshot as unknown as Record<string, unknown> }).catch(() => { /* local is enough */ });
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    if (!canMutateCart()) return;
    setItems([]);
    ids.current = new Map();
    void cartApi.clear().catch(() => { void reload(); });
  }, [reload]);

  const clearProvider = useCallback((provider: string) => {
    if (!canMutateCart()) return;
    setItems((prev) => prev.filter((it) => it.provider !== provider));
    for (const [k] of [...ids.current.entries()]) {
      if (k.startsWith(`${provider}::`)) ids.current.delete(k);
    }
    void cartApi.clear(provider).catch(() => { void reload(); });
  }, [reload]);

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
    <CartContext.Provider value={{ items, totalCount, hydrated, canMutate, add, remove, setQty, patchItem, clear, clearProvider, has, byProvider }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
