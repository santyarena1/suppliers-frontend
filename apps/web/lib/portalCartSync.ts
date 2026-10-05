"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { catalogApi, type PortalCartSync, type Provider } from "@/lib/api";
import { useCart, type CartItem } from "@/lib/cart";

export type PortalPendingLine = {
  code: string;
  name?: string;
  qty: number;
  error?: string;
};

export type PortalSyncNotice = {
  /** Frases ya armadas: "Se quitó X", "quedó en N (se sumaron los dos carritos)". */
  lines: string[];
  /** Estaba solo en el carrito del distribuidor. Hay que dejarlo o sacarlo. */
  pending: PortalPendingLine[];
};

/** Línea de la cotización del portal: lo que el distribuidor realmente está cobrando. */
export type QuotedLine = { code: string; qty: number; name?: string };

/**
 * Lo pendiente de cada distribuidor, a la vista de todo el carrito (no solo del
 * panel de checkout, que en la pestaña «Todos» está oculto), con sus acciones.
 */
export type PortalPendingEntry = {
  pending: PortalPendingLine[];
  busyCode: string | null;
  keep: (item: PortalPendingLine) => void;
  drop: (item: PortalPendingLine) => void;
};

let pendingStore: Record<string, PortalPendingEntry> = {};
const pendingListeners = new Set<() => void>();
const EMPTY_STORE: Record<string, PortalPendingEntry> = {};

const NO_PENDING: PortalPendingLine[] = [];

function publishPending(provider: string, entry: PortalPendingEntry | null) {
  const has = entry !== null && entry.pending.length > 0;
  if (!has && !(provider in pendingStore)) return;
  const next = { ...pendingStore };
  if (entry && entry.pending.length > 0) next[provider] = entry;
  else delete next[provider];
  pendingStore = next;
  pendingListeners.forEach((fn) => fn());
}

/** Productos que están en el carrito del portal y no en NODO, por distribuidor. */
export function usePortalPending(): Record<string, PortalPendingEntry> {
  return useSyncExternalStore(
    (fn) => {
      pendingListeners.add(fn);
      return () => pendingListeners.delete(fn);
    },
    () => pendingStore,
    () => EMPTY_STORE
  );
}

/**
 * Lo que la cotización del portal cobra y NODO no tiene. Es la fuente más
 * segura: si dos cotizaciones se cruzaron, el aviso del servidor puede venir
 * vacío, pero el portal igual lo está sumando.
 */
function extrasFromQuote(provider: string, quoted: QuotedLine[] | undefined, scope: CartItem[]): QuotedLine[] {
  if (!quoted?.length) return [];
  const inNodo = new Set(scope.filter((it) => it.provider === provider).map((it) => it.externalId));
  return quoted.filter((line) => line.code && line.qty > 0 && !inNodo.has(line.code));
}

function describe(code: string, name?: string) {
  return name ? `${name} (${code})` : code;
}

const dropKey = (provider: string) => `nodo.portalDrop.${provider}`;

function readStored(provider: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(dropKey(provider));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((code) => typeof code === "string" && code.length > 0) : [];
  } catch {
    return [];
  }
}

function writeStored(provider: string, codes: string[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(dropKey(provider), JSON.stringify(codes));
}

/** Códigos que el comercio decidió sacar. Se mandan en cada cotización hasta que el portal ya no los devuelve. */
export function readPortalDrops(provider: string): string[] {
  return readStored(provider);
}

export function rememberPortalDrop(provider: string, code: string) {
  const next = new Set(readStored(provider));
  next.add(code);
  writeStored(provider, [...next]);
}

/** Se olvida un código cuando el portal ya no lo tiene pendiente. */
export function retainPortalDrops(provider: string, stillThere: string[]) {
  const still = new Set(stillThere);
  writeStored(provider, readStored(provider).filter((code) => still.has(code)));
}

/**
 * Aplica al carrito de NODO lo que ya se puede aplicar, y deja en el aviso lo
 * que solo estaba en el distribuidor para que el comercio lo deje o lo saque.
 *
 * Una suma se aplica con `setQty` (no con `add`, que acumularía de nuevo).
 * Lo pendiente no se agrega solo. `resync` reescribe el carrito del portal
 * cuando se saca un código; hay que mandar los `dropPortalCodes` guardados.
 */
export function usePortalCartSync(
  provider: Provider,
  resync?: (dropCodes: string[]) => Promise<PortalCartSync | undefined>
) {
  const { items, remove, setQty, add, has } = useCart();
  const [notice, setNotice] = useState<PortalSyncNotice | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const applied = useRef<string | null>(null);
  const autoRetried = useRef<Set<string>>(new Set());
  const resyncRef = useRef(resync);
  const itemsRef = useRef(items);
  const applyRef = useRef<(sync: PortalCartSync | undefined, scope: CartItem[]) => Promise<void>>(async () => undefined);

  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const apply = useCallback(
    async (rawSync: PortalCartSync | undefined, scope: CartItem[], quoted?: QuotedLine[]) => {
      const fromQuote = extrasFromQuote(provider, quoted, scope);
      if (!rawSync && fromQuote.length === 0) return;
      const sync: PortalCartSync = rawSync ?? {
        removedInPortal: [], addedInPortal: [], qtyChangedInPortal: [], summedInBoth: [], keptNodoQty: [], restoredInPortal: [],
      };
      const removed = sync.removedInPortal ?? [];
      const reported = sync.addedInPortal ?? [];
      const added = [
        ...reported,
        ...fromQuote.filter((line) => !reported.some((r) => r.code === line.code)),
      ];
      const qtyChanges = sync.qtyChangedInPortal ?? [];
      const summed = sync.summedInBoth ?? [];
      const kept = sync.keptNodoQty ?? [];
      const restored = sync.restoredInPortal ?? [];
      const hasChanges =
        removed.length > 0 || added.length > 0 || qtyChanges.length > 0 || summed.length > 0 || kept.length > 0 || restored.length > 0;
      if (!hasChanges) {
        retainPortalDrops(provider, []);
        setNotice((prev) => {
          if (!prev || prev.pending.length === 0) return prev;
          if (prev.lines.length === 0) return null;
          return { ...prev, pending: [] };
        });
        return;
      }

      const key = JSON.stringify({ removed, added, qtyChanges, summed, kept, restored });
      const drops = readPortalDrops(provider);
      const stuck = added.filter((item) => drops.includes(item.code));
      if (stuck.length > 0 && resyncRef.current && !autoRetried.current.has(key)) {
        autoRetried.current.add(key);
        const next = await resyncRef.current(drops);
        if (next) return applyRef.current(next, scope);
      }
      retainPortalDrops(provider, added.map((item) => item.code));
      if (applied.current === key) {
        if (added.length > 0) {
          setNotice((prev) => ({
            lines: prev?.lines ?? [],
            pending: added.map((item) => ({ code: item.code, name: item.name, qty: item.qty })),
          }));
        }
        return;
      }
      applied.current = key;

      const lines: string[] = [];
      const inScope = (code: string) => scope.filter((it) => it.provider === provider && it.externalId === code);

      for (const code of removed) {
        for (const it of inScope(code)) {
          remove({ provider, externalId: code, channel: it.channel, schemeId: it.schemeId });
          lines.push(`Se quitó ${describe(code, it.name)} (lo borraron en el portal)`);
        }
      }
      for (const change of qtyChanges) {
        for (const it of inScope(change.code)) {
          setQty({ provider, externalId: change.code, channel: it.channel, schemeId: it.schemeId }, change.qty);
          lines.push(`${describe(change.code, it.name)} ahora ${change.qty} u. (cambiado en el portal)`);
        }
      }
      for (const change of summed) {
        for (const it of inScope(change.code)) {
          setQty({ provider, externalId: change.code, channel: it.channel, schemeId: it.schemeId }, change.qty);
          lines.push(`${describe(change.code, it.name)} quedó en ${change.qty} u. (se sumaron los dos carritos)`);
        }
      }
      // El carrito de NODO manda: estas diferencias solo se informan, no cambian nada.
      for (const change of kept) {
        lines.push(
          `${describe(change.code, change.name)}: en el portal había ${change.portalQty ?? "otra cantidad"} u.; se cargaron tus ${change.qty} u.`
        );
      }
      for (const change of restored) {
        lines.push(`${describe(change.code, change.name)} ya no estaba en el portal; se volvió a cargar (${change.qty} u.)`);
      }

      const pending: PortalPendingLine[] = added.map((item) => ({
        code: item.code,
        name: item.name,
        qty: item.qty,
      }));
      if (lines.length > 0 || pending.length > 0) setNotice({ lines, pending });
    },
    [provider, remove, setQty]
  );
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  const keep = useCallback(
    async (item: PortalPendingLine) => {
      setBusyCode(item.code);
      const ref = { provider, externalId: item.code, channel: "online" as const, schemeId: null };
      try {
        if (has(ref)) {
          setQty(ref, item.qty);
        } else {
          const { data: product } = await catalogApi.getProduct(provider, item.code);
          if (!product?.externalId) {
            setNotice((prev) => prev ? {
              ...prev,
              pending: prev.pending.map((line) => line.code === item.code
                ? { ...line, error: "No está en el catálogo de NODO." }
                : line),
            } : prev);
            return;
          }
          add(product, item.qty, { channel: "online" });
        }
        setNotice((prev) => {
          if (!prev) return prev;
          const pending = prev.pending.filter((line) => line.code !== item.code);
          if (pending.length === 0 && prev.lines.length === 0) return null;
          return { ...prev, pending };
        });
      } catch {
        setNotice((prev) => prev ? {
          ...prev,
          pending: prev.pending.map((line) => line.code === item.code
            ? { ...line, error: "No se pudo agregar a NODO." }
            : line),
        } : prev);
      } finally {
        setBusyCode(null);
      }
    },
    [provider, has, setQty, add]
  );

  const drop = useCallback(
    async (item: PortalPendingLine) => {
      setBusyCode(item.code);
      rememberPortalDrop(provider, item.code);
      setNotice((prev) => {
        if (!prev) return prev;
        const pending = prev.pending.filter((line) => line.code !== item.code);
        if (pending.length === 0 && prev.lines.length === 0) return null;
        return { ...prev, pending };
      });
      try {
        const next = await resyncRef.current?.(readPortalDrops(provider));
        if (next) await applyRef.current(next, itemsRef.current);
      } catch {
        setNotice((prev) => {
          const pending = prev?.pending ?? [];
          if (pending.some((line) => line.code === item.code)) return prev;
          return {
            lines: prev?.lines ?? [],
            pending: [...pending, { ...item, error: "No se pudo sacar del carrito del distribuidor. Reintentá." }],
          };
        });
      } finally {
        setBusyCode(null);
      }
    },
    [provider]
  );

  const pending = notice?.pending ?? NO_PENDING;

  useEffect(() => {
    publishPending(provider, { pending, busyCode, keep, drop });
  }, [provider, pending, busyCode, keep, drop]);
  useEffect(() => () => publishPending(provider, null), [provider]);

  return {
    apply,
    notice,
    pending,
    busyCode,
    keep,
    drop,
    dismiss: () => setNotice((prev) => (prev && prev.pending.length > 0 ? prev : null)),
    cartItems: items,
  };
}
