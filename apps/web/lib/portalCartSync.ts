"use client";

import { useCallback, useRef, useState } from "react";
import { catalogApi, type PortalCartSync, type Provider } from "@/lib/api";
import { useCart, type CartItem } from "@/lib/cart";

export type PortalSyncNotice = {
  /** Frases ya armadas para mostrar: "Se quitó X", "Y ahora 3 u." */
  lines: string[];
  /** Productos que el portal tiene pero NODO no encontró en el catálogo. */
  missing: { code: string; name?: string }[];
};

function describe(code: string, name?: string) {
  return name ? `${name} (${code})` : code;
}

/**
 * Aplica al carrito de NODO lo que cambió en el portal del distribuidor.
 *
 * El carrito es el mismo de los dos lados: lo que borraron o cambiaron en el
 * portal se borra o cambia acá, y lo que agregaron allá se trae buscando el
 * producto por código en el catálogo sincronizado. Cada cotización se aplica
 * una sola vez (la misma respuesta puede llegar más de una vez desde el cache
 * del warm-up), y `add` sobre un producto que ya está sumaría cantidades, así
 * que para esos se usa `setQty`.
 */
export function usePortalCartSync(provider: Provider) {
  const { items, remove, setQty, add, has } = useCart();
  const [notice, setNotice] = useState<PortalSyncNotice | null>(null);
  const applied = useRef<string | null>(null);

  const apply = useCallback(
    async (sync: PortalCartSync | undefined, scope: CartItem[]) => {
      if (!sync) return;
      const hasChanges =
        sync.removedInPortal.length > 0 || sync.addedInPortal.length > 0 || sync.qtyChangedInPortal.length > 0;
      if (!hasChanges) return;
      const key = JSON.stringify(sync);
      if (applied.current === key) return;
      applied.current = key;

      const lines: string[] = [];
      const missing: PortalSyncNotice["missing"] = [];
      const inScope = (code: string) => scope.filter((it) => it.provider === provider && it.externalId === code);

      for (const code of sync.removedInPortal) {
        for (const it of inScope(code)) {
          remove({ provider, externalId: code, channel: it.channel, schemeId: it.schemeId });
          lines.push(`Se quitó ${describe(code, it.name)} (lo borraron en el portal)`);
        }
      }
      for (const change of sync.qtyChangedInPortal) {
        for (const it of inScope(change.code)) {
          setQty({ provider, externalId: change.code, channel: it.channel, schemeId: it.schemeId }, change.qty);
          lines.push(`${describe(change.code, it.name)} ahora ${change.qty} u. (cambiado en el portal)`);
        }
      }
      for (const added of sync.addedInPortal) {
        const ref = { provider, externalId: added.code, channel: "online" as const, schemeId: null };
        if (has(ref)) {
          setQty(ref, added.qty);
          continue;
        }
        try {
          const { data: product } = await catalogApi.getProduct(provider, added.code);
          if (product?.externalId) {
            add(product, added.qty, { channel: "online" });
            lines.push(`Se agregó ${describe(added.code, product.name)} × ${added.qty} (cargado en el portal)`);
            continue;
          }
        } catch {
          // sin producto en el catálogo: se informa abajo
        }
        missing.push({ code: added.code, name: added.name });
      }
      if (lines.length > 0 || missing.length > 0) setNotice({ lines, missing });
    },
    [provider, remove, setQty, add, has]
  );

  return { apply, notice, dismiss: () => setNotice(null), cartItems: items };
}
