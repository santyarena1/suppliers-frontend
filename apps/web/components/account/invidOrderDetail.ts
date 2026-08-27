import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import type { InvidOrder } from "@/lib/api";
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";

function formatUsd(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD" });
}

export function invidOrderHeaderLines(row: InvidOrder): AccountDetailLine[] {
  return [
    { label: "Orden", value: row.orderNumber },
    { label: "Pedido web", value: row.webOrderNumber },
    { label: "Estado", value: row.status },
    { label: "Fecha", value: row.date },
    { label: "Factura", value: row.invoice },
    { label: "Entrega", value: row.delivery || "" },
    { label: "Pago", value: row.payment || "" },
  ];
}

export function invidOrderItems(row: InvidOrder): AccountDetailItem[] {
  return (row.items ?? []).map((it) => ({
    code: it.code,
    name: it.name,
    qty: it.qty,
    price: it.price,
    total: it.total,
  }));
}

export function invidOrderAmountLines(
  row: InvidOrder,
  fallback?: { rate: number; label: string }
): { lines: AccountDetailLine[]; notes: string[] } {
  const t = row.totals;
  const invidRate = row.exchangeRate && row.exchangeRate > 0 ? row.exchangeRate : undefined;
  const rate = invidRate ?? (fallback && fallback.rate > 0 ? fallback.rate : undefined);
  const usd = parseAccountAmount(row.amount);
  const ars = row.amountArs ?? (rate && usd != null ? usd * rate : undefined);

  let tcLabel = "Tipo de cambio";
  if (row.exchangeRateSource === "order") tcLabel = "TC del pedido";
  else if (row.exchangeRateSource === "current" || (invidRate && !row.exchangeRateSource)) tcLabel = "TC actual Invid";
  else if (!invidRate && fallback) tcLabel = fallback.label;

  const lines: AccountDetailLine[] = [];
  if (t?.net != null) lines.push({ label: "Neto (s/IVA)", value: formatUsd(t.net) });
  if (t?.iva != null) lines.push({ label: "IVA", value: formatUsd(t.iva) });
  if (t?.internos != null) lines.push({ label: "Imp. internos", value: formatUsd(t.internos) });
  if (t?.percepciones != null) lines.push({ label: "Percepciones / IIBB", value: formatUsd(t.percepciones) });
  if (t?.shipping != null) lines.push({ label: "Envío", value: formatUsd(t.shipping) });
  if (t?.taxes != null) lines.push({ label: "Impuestos", value: formatUsd(t.taxes) });
  if (row.amount) lines.push({ label: "Importe USD", value: row.amount });
  if (rate) {
    lines.push({
      label: tcLabel,
      value: rate.toLocaleString("es-AR", { maximumFractionDigits: 4 }),
    });
  }
  if (ars != null) lines.push({ label: "Total pesos", value: formatAccountSum(ars, "ARS") });

  const notes: string[] = [];
  if (row.exchangeRateSource === "current") {
    notes.push("El tipo de cambio es el actual de Invid al consultar el listado, no el histórico de cuando se armó el pedido.");
  } else if (!invidRate && fallback && ars != null) {
    notes.push(`Invid no informó cotización. Se usó ${fallback.label} de Nodo para pasar a pesos.`);
  }
  if (t?.taxes != null && t.iva == null) {
    notes.push("Invid no discriminó IVA, internos ni percepciones en este pedido. Impuestos es el resto entre el neto de las líneas y el total.");
  }

  return { lines, notes };
}
