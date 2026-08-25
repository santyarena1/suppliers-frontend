/**
 * Texto que se le manda al vendedor del distribuidor.
 * Parece un pedido: cantidades, IVA, internos, precios. Sin jerga interna
 * (offline, portal, “sin facturar”, condición de IVA, etc.).
 */

export type SellerOrderLine = {
  qty: number;
  description: string;
  ivaPercent: number;
  internosPercent: number;
  unitPriceUsd: number;
  lineTotalUsd: number;
};

export type SellerOrderCharge = {
  label: string;
  usd: number;
};

export type SellerOrderInput = {
  reference: string;
  providerLabel?: string | null;
  clientName?: string | null;
  sellerName?: string | null;
  /** Pesos por dólar. Si falta, el pie va solo en USD. */
  quoteRate?: number | null;
  lines: SellerOrderLine[];
  netUsd: number;
  extraCharges: SellerOrderCharge[];
  finalUsd: number;
};

export function sellerOrderReference(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function providerDisplayName(provider: string): string {
  return provider
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function n2(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function pct(n: number): string {
  const r = Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1)}%`;
}

function pair(usd: number, rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return `u$s ${n2(usd)}`;
  return `u$s ${n2(usd)} | $ ${n2(usd * rate)}`;
}

function clean(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export function formatSellerOrderText(orders: SellerOrderInput[]): string {
  return orders
    .filter((o) => o.lines.length > 0)
    .map(formatOne)
    .join("\n\n----------\n\n")
    .trim();
}

function formatOne(order: SellerOrderInput): string {
  const rate = order.quoteRate ?? null;
  const out: string[] = [];
  out.push(`Pedido ${order.reference}`);
  const provider = clean(order.providerLabel);
  if (provider) out.push(`Proveedor: ${provider}`);
  const client = clean(order.clientName);
  if (client) out.push(`Cliente: ${client}`);
  const seller = clean(order.sellerName);
  if (seller) out.push(`Vendedor: ${seller}`);
  if (rate != null && Number.isFinite(rate) && rate > 0) {
    out.push(`Cotización: $ ${n2(rate)}`);
  }
  out.push("");
  out.push("Detalle");
  out.push("Cant. | Descripción | IVA | I.Int | Precio | Importe");
  out.push("");
  for (const line of order.lines) {
    const name = line.description.replace(/\s+/g, " ").trim();
    out.push(
      `${line.qty} | ${name} | ${pct(line.ivaPercent)} | ${pct(line.internosPercent)} | $ ${n2(line.unitPriceUsd)} | ${n2(line.lineTotalUsd)}`
    );
  }
  out.push("");
  out.push(`Total sin impuestos: ${pair(order.netUsd, rate)}`);
  for (const charge of order.extraCharges) {
    if (Math.abs(charge.usd) < 0.005) continue;
    out.push(`${charge.label}: ${pair(charge.usd, rate)}`);
  }
  out.push(`Total: ${pair(order.finalUsd, rate)}`);
  return out.join("\n");
}
