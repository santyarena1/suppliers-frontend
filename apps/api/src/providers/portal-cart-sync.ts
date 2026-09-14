/**
 * Conciliación del carrito de NODO con el carrito del portal de un
 * distribuidor. El carrito es uno solo, se toque donde se toque; estas
 * funciones son puras y las usa cada servicio de pedidos.
 */

export interface CartSyncItem {
  code: string;
  qty: number;
  name?: string;
}

/** Lo que cambió del lado del portal y NODO tiene que reflejar. */
export interface CartSyncChanges {
  removedInPortal: string[];
  addedInPortal: CartSyncItem[];
  qtyChangedInPortal: CartSyncItem[];
}

/**
 * Concilia el carrito de NODO con el del portal. El carrito es uno solo, se
 * toque donde se toque: la foto (`snapshot`, `{ codigo: cantidad }`) es lo
 * que NODO dejó cargado en el portal la última vez, y contra eso se sabe qué
 * cambió de cada lado.
 *
 * - Estaba en la foto y ya no está en el portal → lo borraron en el portal →
 *   se saca de NODO.
 * - Estaba en la foto y ya no está en NODO → lo borraron en NODO → se saca
 *   del portal.
 * - Está en el portal y no en la foto → lo agregaron en el portal → se trae
 *   a NODO.
 * - Está en NODO y no en la foto → lo agregaron en NODO → se carga al portal.
 * - Cantidades: si el portal difiere de la foto, cambió ahí y gana el portal;
 *   si no, vale la de NODO.
 *
 * Sin foto (primera verificación o después de un pedido) manda NODO, igual
 * que antes: no hay forma de saber qué se borró dónde. Desde ahí es recíproco.
 */
export function reconcilePortalCart(
  nodo: CartSyncItem[],
  portal: CartSyncItem[],
  snapshot: Record<string, number> | null,
  opts: { sessionScoped?: boolean } = {}
): { merged: CartSyncItem[]; changes: CartSyncChanges } {
  const changes: CartSyncChanges = { removedInPortal: [], addedInPortal: [], qtyChangedInPortal: [] };
  const asIs = () => ({ merged: nodo.map((i) => ({ code: i.code, qty: i.qty, name: i.name })), changes });
  if (!snapshot) return asIs();
  // Portales con carrito por sesión de login (Invid): un login nuevo suele
  // arrancar vacío y solo a veces hereda el carrito de una sesión anterior.
  // Ahí un portal vacío no dice "borraron todo", dice "sesión nueva": se toma
  // el carrito de NODO tal cual y solo se concilia cuando el portal trae algo
  // de lo que NODO dejó (señal de que es el mismo carrito). Con carrito por
  // cuenta (Elit, New Bytes) vacío sí significa vacío.
  const sharesSnapshot = !opts.sessionScoped || portal.some((p) => p.code in snapshot);
  if (!sharesSnapshot) {
    for (const item of portal) {
      if (nodo.some((n) => n.code === item.code)) continue;
      changes.addedInPortal.push({ code: item.code, qty: item.qty, name: item.name });
    }
    return { merged: [...asIs().merged, ...changes.addedInPortal], changes };
  }

  const byNodo = new Map(nodo.map((i) => [i.code, i]));
  const byPortal = new Map(portal.map((i) => [i.code, i]));
  const merged: CartSyncItem[] = [];

  for (const item of nodo) {
    const inPortal = byPortal.get(item.code);
    const wasSynced = item.code in snapshot;
    if (wasSynced && !inPortal) {
      changes.removedInPortal.push(item.code);
      continue;
    }
    let qty = item.qty;
    if (inPortal && wasSynced && inPortal.qty !== snapshot[item.code] && inPortal.qty !== item.qty) {
      qty = inPortal.qty;
      changes.qtyChangedInPortal.push({ code: item.code, qty, name: item.name });
    } else if (inPortal && !wasSynced && inPortal.qty !== item.qty) {
      // Agregado en los dos lados con distinta cantidad: la del portal es la última que se vio.
      qty = inPortal.qty;
      changes.qtyChangedInPortal.push({ code: item.code, qty, name: item.name });
    }
    merged.push({ code: item.code, qty, name: item.name });
  }

  for (const item of portal) {
    if (byNodo.has(item.code)) continue;
    // Estaba en la foto y NODO ya no lo tiene: lo borraron en NODO. Se cae del portal.
    if (item.code in snapshot) continue;
    changes.addedInPortal.push({ code: item.code, qty: item.qty, name: item.name });
    merged.push({ code: item.code, qty: item.qty, name: item.name });
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
 * Es lo que quedó en el portal, salvo lo que cambió allá y NODO todavía no
 * reflejó: eso conserva el valor viejo. Si la foto avanzara de una, y NODO no
 * llegara a aplicar el cambio (la cotización también corre en segundo plano),
 * en la verificación siguiente el producto borrado en el portal parecería
 * "agregado en NODO" y volvería a cargarse. Con el valor viejo se detecta el
 * mismo cambio otra vez, hasta que NODO lo aplique y los dos lados coincidan.
 */
export function nextCartSnapshot(
  loaded: CartSyncItem[],
  changes: CartSyncChanges,
  previous: Record<string, number> | null
): Record<string, number> {
  const next = cartSnapshotOf(loaded);
  if (!previous) return next;
  for (const code of changes.removedInPortal) {
    if (code in previous) next[code] = previous[code];
  }
  for (const { code } of changes.qtyChangedInPortal) {
    if (code in previous) next[code] = previous[code];
  }
  return next;
}

