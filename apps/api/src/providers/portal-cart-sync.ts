/**
 * Conciliación del carrito de NODO con el carrito del portal de un
 * distribuidor. Estas funciones son puras y las usa cada servicio de pedidos.
 *
 * No se reemplaza un carrito por el otro. Lo que está en los dos se suma una
 * sola vez; lo que solo está en el portal se deja cargado allá y queda
 * pendiente hasta que el comercio decida dejarlo o sacarlo.
 */

export interface CartSyncItem {
  code: string;
  qty: number;
  name?: string;
  /** Cantidad que tenía NODO antes de sumar. Solo en `summedInBoth`. */
  baseQty?: number;
}

/** Lo que cambió del lado del portal y NODO tiene que reflejar o preguntar. */
export interface CartSyncChanges {
  removedInPortal: string[];
  /**
   * Estaba solo en el portal. Sigue cargado allá. NODO no lo agrega solo:
   * el comercio elige dejarlo (entra a NODO) o sacarlo (`dropPortalCodes`).
   */
  addedInPortal: CartSyncItem[];
  qtyChangedInPortal: CartSyncItem[];
  /** Mismo producto en los dos carritos, con distinta cantidad: se sumaron. */
  summedInBoth: CartSyncItem[];
}

export type PortalReconcileOpts = {
  /** Invid y Air: un carrito vacío es una sesión nueva, no un borrado. */
  sessionScoped?: boolean;
  /** Códigos que el comercio decidió sacar del carrito del distribuidor. */
  dropPortalCodes?: string[];
};

export type PortalReconcileFor = {
  tenantId: string;
  dropPortalCodes?: string[];
};

function line(code: string, qty: number, name?: string, baseQty?: number): CartSyncItem {
  return {
    code,
    qty,
    ...(name ? { name } : {}),
    ...(baseQty != null ? { baseQty } : {}),
  };
}

function emptyChanges(): CartSyncChanges {
  return { removedInPortal: [], addedInPortal: [], qtyChangedInPortal: [], summedInBoth: [] };
}

/**
 * Concilia el carrito de NODO con el del portal.
 *
 * La foto (`snapshot`, `{ codigo: cantidad }`) es lo que ya se había unificado.
 * Contra eso se sabe qué cambió de cada lado:
 *
 * - Estaba en la foto y ya no está en el portal → lo borraron en el portal →
 *   se saca de NODO.
 * - Estaba en la foto y ya no está en NODO → lo borraron en NODO → se saca
 *   del portal.
 * - Está en los dos y no en la foto, con distinta cantidad → se suman. La foto
 *   guarda la cantidad de NODO de antes, así la pasada siguiente no vuelve a
 *   sumar: ve el total en el portal y lo adopta una vez.
 * - Está en los dos con la misma cantidad → se adopta esa cantidad.
 * - Está solo en el portal → se deja en el portal y se informa
 *   (`addedInPortal`). No entra a la foto hasta que NODO lo tenga: si entrara,
 *   la pasada siguiente lo leería como "borrado en NODO" y lo sacaría.
 * - `dropPortalCodes` lo saca del portal sin tocarlo en NODO.
 *
 * Con carrito por sesión (Invid, Air) un portal vacío, o uno que no comparte
 * ningún código de la foto, es una sesión nueva: no se borra lo de NODO.
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
  // Sesión nueva: el portal no trae nada de lo que NODO dejó la última vez.
  const sessionMiss = Boolean(
    opts.sessionScoped && snapshot && !portalKept.some((item) => item.code in snapshot)
  );

  const byNodo = new Map(nodo.map((item) => [item.code, item]));
  const byPortal = new Map(portalKept.map((item) => [item.code, item]));
  const merged: CartSyncItem[] = [];

  for (const item of nodo) {
    const inPortal = byPortal.get(item.code);
    const wasSynced = Boolean(snapshot && item.code in snapshot);
    if (wasSynced && !inPortal && !sessionMiss && !drop.has(item.code)) {
      changes.removedInPortal.push(item.code);
      continue;
    }
    let qty = item.qty;
    if (
      inPortal &&
      wasSynced &&
      !sessionMiss &&
      snapshot &&
      inPortal.qty !== snapshot[item.code] &&
      inPortal.qty !== item.qty
    ) {
      qty = inPortal.qty;
      changes.qtyChangedInPortal.push(line(item.code, qty, item.name ?? inPortal.name));
    } else if (inPortal && !wasSynced && inPortal.qty !== item.qty) {
      qty = item.qty + inPortal.qty;
      changes.summedInBoth.push(line(item.code, qty, item.name ?? inPortal.name, item.qty));
    }
    merged.push(line(item.code, qty, item.name));
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
 * La foto que se guarda después de conciliar y cargar el portal.
 *
 * No incluye lo que solo está en el portal (`addedInPortal`): todavía no está
 * en NODO. Una suma guarda la cantidad previa de NODO (`baseQty`), no el
 * total, para no sumar de nuevo. Lo que cambió en el portal y NODO todavía
 * no reflejó conserva el valor viejo por la misma razón.
 */
export function nextCartSnapshot(
  loaded: CartSyncItem[],
  changes: CartSyncChanges,
  previous: Record<string, number> | null
): Record<string, number> {
  const next = cartSnapshotOf(loaded);
  for (const item of changes.addedInPortal ?? []) delete next[item.code];
  for (const item of changes.summedInBoth ?? []) {
    if (typeof item.baseQty === "number") next[item.code] = item.baseQty;
  }
  if (!previous) return next;
  for (const code of changes.removedInPortal ?? []) {
    if (code in previous) next[code] = previous[code];
  }
  for (const { code } of changes.qtyChangedInPortal ?? []) {
    if (code in previous) next[code] = previous[code];
  }
  for (const item of changes.summedInBoth ?? []) {
    if (item.code in previous) next[item.code] = previous[item.code];
    else if (typeof item.baseQty === "number") next[item.code] = item.baseQty;
  }
  return next;
}
