"use client";

import { useCallback, useRef, useState } from "react";
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
  resyncRef.current = resync;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const applyRef = useRef<(sync: PortalCartSync | undefined, scope: CartItem[]) => Promise<void>>(async () => undefined);

  const apply = useCallback(
    async (sync: PortalCartSync | undefined, scope: CartItem[]) => {
      if (!sync) return;
      const removed = sync.removedInPortal ?? [];
      const added = sync.addedInPortal ?? [];
      const qtyChanges = sync.qtyChangedInPortal ?? [];
      const summed = sync.summedInBoth ?? [];
      const hasChanges = removed.length > 0 || added.length > 0 || qtyChanges.length > 0 || summed.length > 0;
      if (!hasChanges) {
        retainPortalDrops(provider, []);
        setNotice((prev) => {
          if (!prev || prev.pending.length === 0) return prev;
          if (prev.lines.length === 0) return null;
          return { ...prev, pending: [] };
        });
        return;
      }

      const key = JSON.stringify({ removed, added, qtyChanges, summed });
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

      const pending: PortalPendingLine[] = added.map((item) => ({
        code: item.code,
        name: item.name,
        qty: item.qty,
      }));
      if (lines.length > 0 || pending.length > 0) setNotice({ lines, pending });
    },
    [provider, remove, setQty]
  );
  applyRef.current = apply;

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

  const pending = notice?.pending ?? [];

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
