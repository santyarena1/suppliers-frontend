/**
 * Unir una factura a un pedido de NODO por productos y cantidades, para los
 * portales que no dicen de qué pedido es cada factura (New Bytes, Air).
 *
 * Regla (aprobada por el dueño 18/11): se une solo si la factura tiene
 * exactamente los mismos códigos y cantidades que un pedido de NODO hecho
 * entre 30 días antes y 1 día después de la factura, y ese pedido es el único
 * que calza. Con dos candidatos no se une ninguno; sin candidato, tampoco.
 */

export type Lines = Map<string, number>;

export interface OrderLines {
  id: string;
  createdAt: Date;
  lines: Lines;
}

const DAY = 86_400_000;

export const normCode = (code: unknown) => String(code ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");

export function addLine(m: Lines, code: unknown, qty: unknown) {
  const c = normCode(code);
  const q = Number(String(qty ?? "").replace(",", "."));
  if (!c || !Number.isFinite(q) || q <= 0) return;
  m.set(c, (m.get(c) ?? 0) + q);
}

export function sameLines(a: Lines, b: Lines): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** Renglones de un pedido de NODO (`ProviderOrder.items`). */
export function orderLines(items: unknown): Lines {
  const lines: Lines = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const it = (raw ?? {}) as Record<string, unknown>;
    addLine(lines, it.externalId ?? it.code ?? it.codigo ?? it.sku, it.qty ?? it.quantity ?? it.cantidad);
  }
  return lines;
}

/** dd-mm-aaaa, dd/mm/aaaa o aaaa-mm-dd → mediodía de Argentina. */
export function parseDay(raw: unknown): Date | null {
  const s = String(raw ?? "");
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00-03:00`);
  m = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T12:00:00-03:00`);
  return null;
}

export function matchByLines(invoice: { lines: Lines; date: Date | null }, orders: OrderLines[]): { orderId: string | null; candidates: number } {
  const cands = orders.filter((o) => {
    if (!sameLines(invoice.lines, o.lines)) return false;
    if (!invoice.date) return true;
    const diff = invoice.date.getTime() - o.createdAt.getTime();
    return diff >= -DAY && diff <= 30 * DAY;
  });
  return { orderId: cands.length === 1 ? cands[0].id : null, candidates: cands.length };
}

/**
 * Renglones de un comprobante de Air (`comprobantes.php?q=r`), del texto de la
 * página: «54211 UPS HIKVISION DS 3000VA 1 0 311,471.04 311,471.04 SUC06»
 * (código, descripción, cantidad, pendiente, precio, total, sucursal).
 */
export function parseAirItems(text: string): { code: string; qty: number }[] {
  const t = text.replace(/\s+/g, " ");
  const out: { code: string; qty: number }[] = [];
  for (const m of t.matchAll(/(?:^|\s)(\d{2,7}) (.+?) (\d+) \d+ [\d.,]+ [\d.,]+ SUC\d+/g)) out.push({ code: m[1], qty: Number(m[3]) });
  return out;
}
