/**
 * Cursores opacos de la API. Por dentro son JSON en base64url con una versión,
 * así se pueden cambiar sin romper a nadie (un cursor de otra versión es 400).
 */

export class InvalidCursorError extends Error {
  constructor() {
    super("El cursor no es válido para esta consulta. Pedí la primera página sin cursor.");
  }
}

/** Posición en un listado: valor de orden del último item + su id (desempata). */
export interface PageCursor {
  /** Orden con el que se armó (un cursor de otro orden no sirve). */
  sort: string;
  /** Hash de los filtros: un cursor de otra búsqueda no sirve. */
  filter: string;
  value: string | number | null;
  id: string;
}

export function encodeCursor(payload: object): string {
  return Buffer.from(JSON.stringify({ v: 1, ...payload })).toString("base64url");
}

export function decodeCursor<T extends object>(raw: string): T & { v: number } {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T & { v: number };
    if (!parsed || typeof parsed !== "object" || parsed.v !== 1) throw new InvalidCursorError();
    return parsed;
  } catch {
    throw new InvalidCursorError();
  }
}

export function decodePageCursor(raw: string, sort: string, filter: string): PageCursor {
  const c = decodeCursor<PageCursor>(raw);
  if (c.sort !== sort || c.filter !== filter || typeof c.id !== "string") throw new InvalidCursorError();
  return c;
}

/** Cursor del feed de cambios: id del último evento entregado. */
export function encodeChangesCursor(eventId: bigint): string {
  return encodeCursor({ e: eventId.toString() });
}

export function decodeChangesCursor(raw: string): bigint {
  const c = decodeCursor<{ e?: unknown }>(raw);
  if (typeof c.e !== "string" || !/^\d+$/.test(c.e)) throw new InvalidCursorError();
  return BigInt(c.e);
}

type Comparable = string | number | null;

/** Orden total y estable: valores nulos al final, empate por id. */
export function compareSortKeys(a: Comparable, aId: string, b: Comparable, bId: string, desc: boolean): number {
  if (a !== b) {
    if (a == null) return 1;
    if (b == null) return -1;
    const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");
    if (cmp !== 0) return desc ? -cmp : cmp;
  }
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/**
 * Página de un listado ya ordenado. Con cursor arranca en el primer item que va
 * después del último entregado, aunque el catálogo haya cambiado entre medio.
 */
export function pageAfter<T>(
  sorted: T[],
  key: (item: T) => { value: Comparable; id: string },
  desc: boolean,
  cursor: PageCursor | null,
  limit: number
): { items: T[]; hasMore: boolean } {
  let start = 0;
  if (cursor) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const k = key(sorted[mid]);
      if (compareSortKeys(k.value, k.id, cursor.value, cursor.id, desc) <= 0) lo = mid + 1;
      else hi = mid;
    }
    start = lo;
  }
  const items = sorted.slice(start, start + limit);
  return { items, hasMore: start + limit < sorted.length };
}
