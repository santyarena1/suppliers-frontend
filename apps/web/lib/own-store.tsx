"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ownStoreApi, type OwnRetailStoreOption, type OwnStoreQuote } from "@/lib/api";
import { useIsRetailer } from "@/lib/purchase";

type Snapshot = {
  retailer: boolean;
  loaded: boolean;
  canEdit: boolean;
  store: OwnRetailStoreOption | null;
};

const EMPTY: Snapshot = { retailer: false, loaded: false, canEdit: false, store: null };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const quoteCache = new Map<string, OwnStoreQuote | null>();
type Waiter = { storeId: string; name: string; resolve: (quote: OwnStoreQuote | null) => void };
const pending = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Snapshot) {
  if (
    snapshot.retailer === next.retailer &&
    snapshot.loaded === next.loaded &&
    snapshot.canEdit === next.canEdit &&
    snapshot.store?.id === next.store?.id &&
    snapshot.store?.name === next.store?.name
  ) {
    return;
  }
  snapshot = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearOwnStoreQuoteCache() {
  quoteCache.clear();
}

/** Avisa a las cards y a la ficha que la tienda propia cambió. */
export function publishOwnStore(data: { canEdit: boolean; store: OwnRetailStoreOption | null }) {
  if (snapshot.store?.id !== data.store?.id) clearOwnStoreQuoteCache();
  setSnapshot({ retailer: true, loaded: true, canEdit: data.canEdit, store: data.store });
}

function ensure(retailer: boolean) {
  if (!retailer) {
    if (snapshot.retailer || !snapshot.loaded) {
      clearOwnStoreQuoteCache();
      setSnapshot({ retailer: false, loaded: true, canEdit: false, store: null });
    }
    return;
  }
  if (snapshot.loaded && snapshot.retailer) return;
  if (inflight) return;
  inflight = ownStoreApi
    .get()
    .then((res) => {
      setSnapshot({
        retailer: true,
        loaded: true,
        canEdit: res.data.canEdit,
        store: res.data.store,
      });
    })
    .catch(() => {
      setSnapshot({ retailer: true, loaded: true, canEdit: false, store: null });
    })
    .finally(() => {
      inflight = null;
    });
}

function cacheKey(storeId: string, name: string) {
  return `${storeId}\u0000${name.trim().toLowerCase()}`;
}

function scheduleFlush() {
  if (flushTimer != null || flushing) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQuotes();
  }, 60);
}

async function flushQuotes() {
  if (flushing) return;
  flushing = true;
  try {
    while (pending.size > 0) {
      const groups = new Map<string, [string, Waiter[]][]>();
      for (const entry of pending.entries()) {
        const storeId = entry[1][0]?.storeId;
        if (!storeId) continue;
        const list = groups.get(storeId) ?? [];
        list.push(entry);
        groups.set(storeId, list);
      }
      pending.clear();
      for (const [, entries] of groups) {
        for (let offset = 0; offset < entries.length; offset += 40) {
          await sendQuoteBatch(entries.slice(offset, offset + 40));
        }
      }
    }
  } finally {
    flushing = false;
    if (pending.size > 0) scheduleFlush();
  }
}

async function sendQuoteBatch(entries: [string, Waiter[]][]) {
  const items = entries.map(([key, waiters], index) => ({
    key: String(index),
    name: waiters[0].name.slice(0, 500),
    cacheKey: key,
    waiters,
  }));
  try {
    const res = await ownStoreApi.quotes(items.map(({ key, name }) => ({ key, name })));
    const byKey = new Map(res.data.quotes.map((quote) => [quote.key, quote]));
    items.forEach((item, index) => {
      const quote = byKey.get(String(index)) ?? null;
      quoteCache.set(item.cacheKey, quote);
      item.waiters.forEach((waiter) => waiter.resolve(quote));
    });
  } catch {
    items.forEach((item) => item.waiters.forEach((waiter) => waiter.resolve(null)));
  }
}

export function requestOwnStoreQuote(storeId: string, name: string): Promise<OwnStoreQuote | null> {
  const trimmed = name.trim();
  if (!storeId || trimmed.length < 2) return Promise.resolve(null);
  const key = cacheKey(storeId, trimmed);
  if (quoteCache.has(key)) return Promise.resolve(quoteCache.get(key) ?? null);
  return new Promise((resolve) => {
    const list = pending.get(key) ?? [];
    list.push({ storeId, name: trimmed, resolve });
    pending.set(key, list);
    scheduleFlush();
  });
}

export function useOwnStore() {
  const retailer = useIsRetailer();
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  useEffect(() => {
    ensure(retailer);
  }, [retailer]);
  return state;
}
