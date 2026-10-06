import type { Prisma } from "@prisma/client";
import { sharesOf } from "./cart-attribution";

/**
 * Saca del carrito compartido lo que ya se pidió. Un pedido puede terminar en
 * segundo plano (o desde otra PC): si solo lo vaciaba la pantalla que lo
 * confirmó, en las demás seguía el carrito y era fácil pedir dos veces.
 *
 * Se descuenta la cantidad pedida de cada producto del canal online de ese
 * distribuidor (lo offline va por otro camino). Si una línea queda en 0 se va.
 */
export type OrderedLine = { code: string; qty: number };

type JsonObject = Record<string, unknown>;

function asObject(entry: unknown): JsonObject | null {
  return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as JsonObject) : null;
}

/** Ítems de `ProviderOrder.items`: `{ code, qty }` (con alias por si algún distribuidor los guarda distinto). */
export function orderedLines(items: Prisma.JsonValue): OrderedLine[] {
  if (!Array.isArray(items)) return [];
  const out: OrderedLine[] = [];
  for (const entry of items) {
    const rec = asObject(entry);
    if (!rec) continue;
    const code = String(rec.code ?? rec.externalId ?? rec.sku ?? rec.id ?? "").trim();
    const qty = Math.floor(Number(rec.qty ?? rec.quantity ?? rec.amount ?? rec.cantidad ?? 0));
    if (code && qty > 0) out.push({ code, qty });
  }
  return out;
}

/** Baja `n` unidades del reparto por persona, empezando por quien más puso. */
function takeUnits(item: JsonObject, n: number): JsonObject {
  const shares = sharesOf(item);
  const order = Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
  let left = n;
  for (const userId of order) {
    if (left <= 0) break;
    const taken = Math.min(shares[userId], left);
    shares[userId] -= taken;
    left -= taken;
    if (shares[userId] <= 0) delete shares[userId];
  }
  const qty = Object.values(shares).reduce((s, v) => s + v, 0);
  return { ...item, qty, by: shares };
}

/** Las líneas del carrito sin lo pedido. `changed` = si sacó algo. */
export function removeOrderedFromCart(
  cartItems: Prisma.JsonValue[],
  provider: string,
  ordered: OrderedLine[]
): { items: Prisma.JsonValue[]; changed: boolean } {
  const pending = new Map<string, number>();
  for (const line of ordered) pending.set(line.code, (pending.get(line.code) ?? 0) + line.qty);
  let changed = false;
  const items: Prisma.JsonValue[] = [];
  for (const entry of cartItems) {
    const item = asObject(entry);
    const code = item ? String(item.externalId ?? "") : "";
    const left = pending.get(code) ?? 0;
    const online = item?.channel !== "offline";
    if (!item || item.provider !== provider || !online || left <= 0) {
      items.push(entry);
      continue;
    }
    const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
    const taken = Math.min(qty, left);
    pending.set(code, left - taken);
    changed = true;
    if (taken < qty) items.push(takeUnits(item, taken) as Prisma.JsonValue);
  }
  return { items, changed };
}
