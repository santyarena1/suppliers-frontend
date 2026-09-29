/**
 * Conciliación del carrito de NODO con el carrito del portal de un
 * distribuidor. Estas funciones son puras y las usa cada servicio de pedidos.
 *
 * Regla: el carrito de NODO manda. El portal se carga con lo que tiene NODO y
 * nunca le cambia el carrito al comercio sin preguntar. Lo que el portal tenía
 * distinto se informa; lo que solo está en el portal queda pendiente hasta que
 * el comercio decida dejarlo o sacarlo.
 */

export interface CartSyncItem {
  code: string;
  qty: number;
  name?: string;
  /** Cantidad que tenía NODO antes de sumar. Solo en `summedInBoth` (ya no se usa). */
  baseQty?: number;
  /** Cantidad que había en el portal, cuando difería de la de NODO. */
  portalQty?: number;
}

/** Lo que había distinto del lado del portal. */
export interface CartSyncChanges {
  /** Ya no se usa: NODO no se vacía porque el portal lo haya perdido. */
  removedInPortal: string[];
  /**
   * Estaba solo en el portal. Sigue cargado allá. NODO no lo agrega solo:
   * el comercio elige dejarlo (entra a NODO) o sacarlo (`dropPortalCodes`).
   */
  addedInPortal: CartSyncItem[];
  /** Ya no se usa: la cantidad del portal no pisa la de NODO. */
  qtyChangedInPortal: CartSyncItem[];
  /** Ya no se usa: los carritos no se suman. */
  summedInBoth: CartSyncItem[];
  /** El portal tenía otra cantidad; se dejó la de NODO (`qty`) y se informa la del portal (`portalQty`). */
  keptNodoQty: CartSyncItem[];
  /** El portal había perdido estos productos de NODO; se volvieron a cargar. */
  restoredInPortal: CartSyncItem[];
}

export type PortalReconcileOpts = {
  /** Invid y Air: un carrito vacío es una sesión nueva, no un borrado. */
  sessionScoped?: boolean;
  /** Códigos que el comercio decidió sacar del carrito del distribuidor. */
  dropPortalCodes?: string[];
  /** New Bytes abre un carrito nuevo en cada verificación: que falte algo no es una pérdida. */
  preserveNodoLines?: boolean;
};

export type PortalReconcileFor = {
  tenantId: string;
  dropPortalCodes?: string[];
};

function line(code: string, qty: number, name?: string, extra: Partial<CartSyncItem> = {}): CartSyncItem {
  return { code, qty, ...(name ? { name } : {}), ...extra };
}

function emptyChanges(): CartSyncChanges {
  return {
    removedInPortal: [],
    addedInPortal: [],
    qtyChangedInPortal: [],
    summedInBoth: [],
    keptNodoQty: [],
    restoredInPortal: [],
  };
}

/**
 * Concilia el carrito de NODO con el del portal. La foto (`snapshot`,
 * `{ codigo: cantidad }`) es lo que se cargó la última vez.
 *
 * - Cada producto de NODO va al portal con la cantidad de NODO.
 *   - Si el portal tenía otra cantidad puesta allá (distinta de la foto), se
 *     informa en `keptNodoQty`.
 *   - Si el portal lo había perdido, se vuelve a cargar y se informa en
 *     `restoredInPortal` (salvo sesión nueva o New Bytes, donde es normal).
 * - Está solo en el portal y estaba en la foto → lo borraron en NODO → se saca del portal.
 * - Está solo en el portal y no estaba en la foto → queda pendiente (`addedInPortal`).
 * - `dropPortalCodes` lo saca del portal.
 */
export function reconcilePortalCart(
  nodo: CartSyncItem[],
  portal: CartSyncItem[],
  snapshot: Record<string, number> | null,
  opts: PortalReconcileOpts = {}
): { merged: CartSyncItem[]; changes: CartSyncChanges } {
  const drop = new Set((opts.dropPortalCodes ?? []).map((code) => code.trim()).filter(Boolean));
  const portalKept = portal.filter((item) => item.code && !drop.has(item.code));
  const changes = emptyChanges();
  const sessionMiss = Boolean(
    opts.sessionScoped && snapshot && !portalKept.some((item) => item.code in snapshot)
  );

  const byNodo = new Map(nodo.map((item) => [item.code, item]));
  const byPortal = new Map(portalKept.map((item) => [item.code, item]));
  const merged: CartSyncItem[] = [];

  for (const item of nodo) {
    const inPortal = byPortal.get(item.code);
    const wasSynced = Boolean(snapshot && item.code in snapshot);
    if (inPortal) {
      const portalChangedIt = !wasSynced || inPortal.qty !== snapshot![item.code];
      if (inPortal.qty !== item.qty && portalChangedIt && !sessionMiss) {
        changes.keptNodoQty.push(line(item.code, item.qty, item.name ?? inPortal.name, { portalQty: inPortal.qty }));
      }
    } else if (wasSynced && !sessionMiss && !opts.preserveNodoLines && !drop.has(item.code)) {
      changes.restoredInPortal.push(line(item.code, item.qty, item.name));
    }
    merged.push(line(item.code, item.qty, item.name));
  }

  for (const item of portalKept) {
    if (byNodo.has(item.code)) continue;
    if (snapshot && item.code in snapshot && !sessionMiss) continue;
    changes.addedInPortal.push(line(item.code, item.qty, item.name));
    merged.push(line(item.code, item.qty, item.name));
  }

  return { merged, changes };
}

export function cartSnapshotOf(items: CartSyncItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.code] = (out[it.code] ?? 0) + it.qty;
  return out;
}

/**
 * La foto que se guarda después de conciliar y cargar el portal: lo que
 * quedó cargado menos lo pendiente (`addedInPortal`), que todavía no es de NODO.
 * Como NODO manda, es exactamente el carrito de NODO.
 */
export function nextCartSnapshot(
  loaded: CartSyncItem[],
  changes: CartSyncChanges,
  _previous?: Record<string, number> | null
): Record<string, number> {
  const next = cartSnapshotOf(loaded);
  for (const item of changes.addedInPortal ?? []) delete next[item.code];
  return next;
}
