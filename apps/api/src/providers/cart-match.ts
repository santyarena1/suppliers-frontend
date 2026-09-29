import { BadRequestException } from "@nestjs/common";

export interface CartLine {
  code: string;
  qty: number;
  name?: string;
}

export interface CartDifference {
  code: string;
  name?: string;
  requested: number;
  loaded: number;
}

function normCode(code: string): string {
  const trimmed = String(code).trim();
  // "00123" y "123" son el mismo código en portales que lo guardan como número.
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed.toUpperCase();
}

function totals(lines: CartLine[]): Map<string, { qty: number; name?: string }> {
  const out = new Map<string, { qty: number; name?: string }>();
  for (const line of lines) {
    const key = normCode(line.code);
    const prev = out.get(key);
    out.set(key, { qty: (prev?.qty ?? 0) + line.qty, name: prev?.name ?? line.name });
  }
  return out;
}

/** Qué no coincide entre lo pedido desde NODO y lo que quedó cargado en el portal. */
export function portalCartDifferences(requested: CartLine[], loaded: CartLine[]): CartDifference[] {
  const want = totals(requested);
  const got = totals(loaded);
  const diffs: CartDifference[] = [];
  for (const [code, { qty, name }] of want) {
    const have = got.get(code)?.qty ?? 0;
    if (have !== qty) diffs.push({ code, ...(name ? { name } : {}), requested: qty, loaded: have });
  }
  for (const [code, { qty, name }] of got) {
    if (!want.has(code)) diffs.push({ code, ...(name ? { name } : {}), requested: 0, loaded: qty });
  }
  return diffs;
}

/**
 * Antes de confirmar: el portal tiene que tener exactamente el carrito de NODO.
 * Si el distribuidor rechazó algo (sin stock, código dado de baja) o quedó algo
 * de más, no se manda un pedido distinto del que armó el comercio.
 */
export function assertPortalCartMatches(
  providerName: string,
  requested: CartLine[],
  loaded: CartLine[],
  opts: { ignoreExtras?: boolean } = {}
): void {
  // `ignoreExtras`: portales que pueden sumar renglones que no son productos
  // (flete, descuento). Ahí solo se exige que cada producto pedido esté exacto.
  const diffs = portalCartDifferences(requested, loaded).filter((d) => !(opts.ignoreExtras && d.requested === 0));
  if (diffs.length === 0) return;
  const detail = diffs
    .map((d) => {
      const label = d.name ?? d.code;
      if (d.requested === 0) return `${label}: estaba de más en el carrito de ${providerName}`;
      if (d.loaded === 0) return `${label}: ${providerName} no lo aceptó`;
      return `${label}: pediste ${d.requested}, ${providerName} aceptó ${d.loaded}`;
    })
    .join(" · ");
  throw new BadRequestException(
    `No se envió el pedido: el carrito de ${providerName} no quedó igual al tuyo. ${detail}. Revisá stock y volvé a cotizar.`
  );
}
