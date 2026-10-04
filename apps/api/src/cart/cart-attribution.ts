import type { Prisma } from "@prisma/client";

/**
 * Quién puso cada unidad del carrito del comercio. Cada línea lleva
 * `by: { [userId]: unidades }` y la suma es igual a `qty`.
 *
 * Lo resuelve el servidor, no se le cree al navegador: cada uno solo puede
 * sumar a su nombre. A otro integrante se le puede bajar o mover lo suyo
 * (cambiar de esquema o de canal), nunca agrandarlo. Por producto, lo de cada
 * integrante no supera lo que ya tenía antes del cambio.
 */
export type CartShares = Record<string, number>;

/** Unidades de antes del registro de autor (o sin dato): se muestran como "sin registrar". */
export const UNKNOWN_AUTHOR = "_";

type JsonObject = Record<string, unknown>;

function asObject(entry: Prisma.JsonValue | unknown): JsonObject | null {
  return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as JsonObject) : null;
}

function qtyOf(item: JsonObject): number {
  const n = Math.floor(Number(item.qty));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Misma clave que `cartItemKey` de la web: canal, proveedor, esquema y producto. */
function lineKey(item: JsonObject): string {
  const channel = item.channel === "offline" ? "offline" : "online";
  return `${channel}::${str(item.provider)}::${str(item.schemeId)}::${str(item.externalId)}`;
}

function productKey(item: JsonObject): string {
  return `${str(item.provider)}::${str(item.externalId)}`;
}

/** `by` tal como vino: solo enteros positivos. `null` si no vino el campo. */
function readShares(item: JsonObject): CartShares | null {
  const by = asObject(item.by);
  if (!by) return null;
  const out: CartShares = {};
  for (const [userId, raw] of Object.entries(by)) {
    const n = Math.floor(Number(raw));
    if (userId && Number.isFinite(n) && n > 0) out[userId] = n;
  }
  return out;
}

/** Reparto confiable de una línea ya guardada: si no cierra con la cantidad, queda sin registrar. */
export function sharesOf(item: JsonObject): CartShares {
  const qty = qtyOf(item);
  const by = readShares(item) ?? {};
  const total = Object.values(by).reduce((s, n) => s + n, 0);
  if (total === qty) return by;
  if (total > qty || total === 0) return { [UNKNOWN_AUTHOR]: qty };
  return { ...by, [UNKNOWN_AUTHOR]: (by[UNKNOWN_AUTHOR] ?? 0) + qty - total };
}

/**
 * Devuelve las líneas nuevas con `by` resuelto. `prevItems` es el carrito
 * guardado antes del cambio y `actorId` quien lo guarda.
 */
export function attributeCartItems(
  prevItems: Prisma.JsonValue[],
  nextItems: unknown[],
  actorId: string
): Prisma.JsonValue[] {
  const prevByLine = new Map<string, JsonObject>();
  const remaining = new Map<string, CartShares>();
  for (const entry of prevItems) {
    const item = asObject(entry);
    if (!item) continue;
    prevByLine.set(lineKey(item), item);
    const pool = remaining.get(productKey(item)) ?? {};
    for (const [userId, n] of Object.entries(sharesOf(item))) pool[userId] = (pool[userId] ?? 0) + n;
    remaining.set(productKey(item), pool);
  }

  return nextItems.map((entry) => {
    const item = asObject(entry);
    if (!item) return entry as Prisma.JsonValue;
    const qty = qtyOf(item);
    // Una versión vieja de la web no manda `by`: se toma el reparto que tenía esa línea.
    const prevLine = prevByLine.get(lineKey(item));
    const claimed = readShares(item) ?? (prevLine ? sharesOf(prevLine) : {});
    const pool = remaining.get(productKey(item)) ?? {};

    const by: CartShares = {};
    let assigned = 0;
    for (const [userId, wanted] of Object.entries(claimed)) {
      if (userId === actorId) continue;
      const allowed = Math.min(wanted, pool[userId] ?? 0, qty - assigned);
      if (allowed <= 0) continue;
      by[userId] = allowed;
      pool[userId] = (pool[userId] ?? 0) - allowed;
      assigned += allowed;
    }
    if (qty > assigned) by[actorId] = qty - assigned;
    remaining.set(productKey(item), pool);
    return { ...item, qty, by } as Prisma.JsonValue;
  });
}
