import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import { mergeSplit, taxBreakdownLines } from "@/components/account/accountTaxBreakdown";
import type { InvidOrder } from "@/lib/api";
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";

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

  const net = t?.net ?? 0;
  const split = t?.iva105 != null || t?.iva21 != null
    ? { iva105: t.iva105 ?? 0, iva21: t.iva21 ?? 0, ivaOther: 0 }
    : mergeSplit({ iva105: 0, iva21: 0, ivaOther: 0 }, net, t?.iva ?? t?.taxes ?? null);

  const lines: AccountDetailLine[] = [
    ...taxBreakdownLines({
      net,
      ...split,
      perceptions: t?.percepciones ?? 0,
      internalTaxes: t?.internos,
      shipping: t?.shipping,
      total: t?.total ?? usd,
      currency: "USD",
    }),
  ];
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
  if (t?.taxes != null && t.iva == null && t.iva105 == null && t.iva21 == null) {
    notes.push("Invid no discriminó IVA, internos ni percepciones en este pedido. Impuestos es el resto entre el neto de las líneas y el total.");
  }

  return { lines, notes };
}
