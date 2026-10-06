/**
 * Qué productos del carrito no entran en la cotización del distribuidor.
 *
 * Cada portal cotiza solo lo que puede vender: lo que no tiene stock no aparece
 * (o aparece con stock 0 / con error). Antes NODO lo sumaba igual y la resta
 * se mostraba como "diferencia con el portal", que no se entendía. Ahora se
 * marca el producto: sin stock (sacarlo) o con menos stock del pedido.
 */
import type { CartItem } from "@/lib/cart";

export type StockIssue =
  | { kind: "out"; code: string; message?: string }
  /** El distribuidor cotiza menos unidades de las que hay en el carrito. */
  | { kind: "partial"; code: string; available: number };

type QuotedItem = { code: string; qty: number; stock?: number | null; error?: string | null };

export type QuoteForStock = {
  items?: QuotedItem[] | null;
  /** Lo que el portal rechazó explícitamente por stock (Elit). */
  unavailable?: { code: string }[] | null;
};

/**
 * Problemas de stock de un distribuidor, por código de producto.
 * Si la cotización no comparte ningún código con el carrito (otro formato de
 * código), no se marca nada: mejor no avisar que avisar mal.
 */
export function stockIssuesFor(cartItems: CartItem[], quote: QuoteForStock | null | undefined): Map<string, StockIssue> {
  const issues = new Map<string, StockIssue>();
  if (!quote) return issues;
  const online = cartItems.filter((it) => it.channel !== "offline");
  if (online.length === 0) return issues;

  const wanted = new Map<string, number>();
  for (const it of online) wanted.set(it.externalId, (wanted.get(it.externalId) ?? 0) + it.qty);

  for (const line of quote.unavailable ?? []) {
    if (wanted.has(line.code)) issues.set(line.code, { kind: "out", code: line.code });
  }

  const quoted = quote.items ?? [];
  const quotedQty = new Map<string, number>();
  for (const q of quoted) {
    const code = String(q.code);
    if (q.error) {
      if (wanted.has(code)) issues.set(code, { kind: "out", code, message: q.error });
      continue;
    }
    if (q.stock === 0) {
      if (wanted.has(code)) issues.set(code, { kind: "out", code });
      continue;
    }
    quotedQty.set(code, (quotedQty.get(code) ?? 0) + (Number(q.qty) || 0));
  }

  const sharesCodes = [...wanted.keys()].some((code) => quotedQty.has(code) || issues.has(code));
  if (!sharesCodes && quoted.length > 0) return issues;
  // Sin ítems cotizados y sin rechazos explícitos no hay de dónde sacar conclusiones.
  if (quoted.length === 0 && issues.size === 0) return issues;

  for (const [code, qty] of wanted) {
    if (issues.has(code)) continue;
    const got = quotedQty.get(code) ?? 0;
    if (got <= 0) issues.set(code, { kind: "out", code });
    else if (got < qty) issues.set(code, { kind: "partial", code, available: got });
  }
  return issues;
}

/**
 * Las líneas tal como entran en el pedido: sin las que no tienen stock y con
 * las parciales recortadas a lo que cotizó el distribuidor (repartiendo entre
 * líneas del mismo producto en orden).
 */
export function orderableItems(items: CartItem[], issues: Map<string, StockIssue>): CartItem[] {
  if (issues.size === 0) return items;
  const left = new Map<string, number>();
  for (const issue of issues.values()) if (issue.kind === "partial") left.set(issue.code, issue.available);
  const out: CartItem[] = [];
  for (const it of items) {
    const issue = it.channel === "offline" ? undefined : issues.get(it.externalId);
    if (!issue) {
      out.push(it);
      continue;
    }
    if (issue.kind === "out") continue;
    const remaining = left.get(it.externalId) ?? 0;
    const qty = Math.min(it.qty, remaining);
    left.set(it.externalId, remaining - qty);
    if (qty > 0) out.push({ ...it, qty });
  }
  return out;
}
