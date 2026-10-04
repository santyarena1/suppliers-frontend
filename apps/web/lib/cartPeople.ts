/**
 * Quién puso cada unidad del carrito del comercio. Cada línea lleva
 * `by: { [userId]: unidades }`; el servidor lo valida al guardar
 * (apps/api/src/cart/cart-attribution.ts): cada uno suma solo a su nombre.
 *
 * El filtro de pedido arma el pedido con lo de algunas personas. Lo que queda
 * afuera sigue en el carrito.
 */

export type CartShares = Record<string, number>;

/** Unidades de antes del registro de autor. */
export const UNKNOWN_AUTHOR = "_";

export type OrderFilter =
  | { mode: "all" }
  | { mode: "only"; people: string[] }
  | { mode: "except"; people: string[] };

export const ALL_PEOPLE: OrderFilter = { mode: "all" };

type WithShares = { qty: number; by?: CartShares };

/** Reparto de la línea. Lo que no cierra con la cantidad cuenta como sin registrar. */
export function sharesOf(item: WithShares): CartShares {
  const out: CartShares = {};
  let total = 0;
  for (const [userId, raw] of Object.entries(item.by ?? {})) {
    const n = Math.floor(Number(raw));
    if (!userId || !Number.isFinite(n) || n <= 0) continue;
    out[userId] = n;
    total += n;
  }
  if (total === item.qty) return out;
  if (total > item.qty || total === 0) return { [UNKNOWN_AUTHOR]: item.qty };
  return { ...out, [UNKNOWN_AUTHOR]: (out[UNKNOWN_AUTHOR] ?? 0) + item.qty - total };
}

export function includesPerson(filter: OrderFilter, userId: string): boolean {
  if (filter.mode === "all") return true;
  const listed = filter.people.includes(userId);
  return filter.mode === "only" ? listed : !listed;
}

export function isFiltering(filter: OrderFilter): boolean {
  return filter.mode !== "all";
}

/** La línea recortada a lo de las personas del filtro. `null` si no le queda nada. */
export function pickShares<T extends WithShares>(item: T, filter: OrderFilter): T | null {
  if (filter.mode === "all") return item;
  const by: CartShares = {};
  let qty = 0;
  for (const [userId, n] of Object.entries(sharesOf(item))) {
    if (!includesPerson(filter, userId)) continue;
    by[userId] = n;
    qty += n;
  }
  return qty > 0 ? { ...item, qty, by } : null;
}

/** Suma unidades a nombre de una persona. */
export function addShares(by: CartShares, userId: string, n: number): CartShares {
  if (n <= 0) return by;
  return { ...by, [userId]: (by[userId] ?? 0) + n };
}

/** Une los repartos de dos líneas que pasan a ser una. */
export function mergeShares(a: CartShares, b: CartShares): CartShares {
  return Object.entries(b).reduce((acc, [userId, n]) => addShares(acc, userId, n), a);
}

/**
 * Baja `n` unidades del reparto entre las personas que deja pasar `canTake`:
 * primero las de `firstFrom` (quien edita), después lo sin registrar y después el resto.
 */
export function takeShares(
  by: CartShares,
  n: number,
  firstFrom: string | null,
  canTake: (userId: string) => boolean = () => true
): CartShares {
  const order = Object.keys(by).sort((x, y) => rank(x) - rank(y));
  function rank(userId: string) {
    if (userId === firstFrom) return 0;
    return userId === UNKNOWN_AUTHOR ? 1 : 2;
  }
  const next = { ...by };
  let left = n;
  for (const userId of order) {
    if (left <= 0) break;
    if (!canTake(userId)) continue;
    const taken = Math.min(next[userId], left);
    next[userId] -= taken;
    left -= taken;
    if (next[userId] <= 0) delete next[userId];
  }
  return next;
}

export function totalShares(by: CartShares): number {
  return Object.values(by).reduce((s, n) => s + n, 0);
}

/** Personas con unidades en estas líneas, de la que más puso a la que menos. */
export function authorsOf(items: WithShares[]): { userId: string; units: number }[] {
  const units = new Map<string, number>();
  for (const it of items) {
    for (const [userId, n] of Object.entries(sharesOf(it))) units.set(userId, (units.get(userId) ?? 0) + n);
  }
  return [...units.entries()].map(([userId, n]) => ({ userId, units: n })).sort((a, b) => b.units - a.units);
}

export function personLabel(userId: string, people: Record<string, string>, me: string | null): string {
  if (userId === UNKNOWN_AUTHOR) return "Sin registrar";
  if (userId === me) return "Vos";
  return people[userId] ?? "Ex integrante";
}
