import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import {
  addIva,
  emptyIvaAcc,
  mergeSplit,
  taxBreakdownLines,
} from "@/components/account/accountTaxBreakdown";
import type { NewBytesOrder } from "@/lib/api";
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";

function fmtUsd(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function nbOrderHeaderLines(row: NewBytesOrder): AccountDetailLine[] {
  return [
    { label: "N°", value: String(row.orderNumber || row.albNumber || "") },
    { label: "Pedido web", value: row.webOrderNumber || "" },
    { label: "Sucursal", value: row.branch != null ? String(row.branch) : "" },
    { label: "Estado", value: row.status || nbStatusLabel(row.statusColor) },
    { label: "Detalle estado", value: row.statusDescription && row.statusDescription !== row.status ? row.statusDescription : "" },
    { label: "Fecha", value: row.date || "" },
    { label: "Cliente", value: row.clientName || "" },
    { label: "Cargada por", value: row.userName || "" },
    { label: "Pago", value: row.payment || "" },
    { label: "Entrega", value: row.delivery || "" },
    { label: "Dirección", value: row.address || "" },
    { label: "Número de envío", value: row.trackingNumber || "" },
    { label: "Comprobante de pago", value: row.hasPaymentVoucher ? "Cargado en New Bytes" : "" },
    { label: "Factura", value: row.invoice || "" },
    { label: "Dropshipping", value: row.dropShipping === true ? "Sí" : "" },
    { label: "Notas", value: row.notes || "" },
  ];
}

export function nbOrderItems(row: NewBytesOrder): AccountDetailItem[] {
  return (row.items ?? []).map((it) => ({
    code: it.code,
    name: it.name || it.code || "Ítem",
    qty: it.qty,
    price: it.price != null ? fmtUsd(it.price) : "",
    total: it.total != null ? fmtUsd(it.total) : "",
    iva: it.ivaPercent != null ? `${it.ivaPercent.toLocaleString("es-AR")}%` : undefined,
    badge: it.internalTaxPercent ? `Internos ${it.internalTaxPercent.toLocaleString("es-AR")}%` : undefined,
  }));
}

/** New Bytes no pone texto en el estado de una orden de compra: solo el color. */
export function nbStatusLabel(color: NewBytesOrder["statusColor"]): string {
  if (color === "green") return "Verde (así la marca New Bytes)";
  if (color === "yellow") return "Amarilla (así la marca New Bytes)";
  if (color === "red") return "Roja (así la marca New Bytes)";
  return "";
}

/** Seguimiento del envío, del más reciente al más viejo. */
export function nbTrackingLines(row: NewBytesOrder): AccountDetailLine[] {
  return [...(row.tracking ?? [])].reverse().map((step) => ({
    label: step.date || "Sin fecha",
    value: [step.state, step.branch, step.address].filter(Boolean).join(" · "),
  }));
}

function ivaFromNbItems(row: NewBytesOrder) {
  const acc = emptyIvaAcc();
  let perc = 0;
  for (const it of row.items ?? []) {
    const qty = it.qty != null && it.qty > 0 ? it.qty : 1;
    const lineNet = it.total ?? (it.price != null ? it.price * qty : 0);
    const vat = it.iva != null
      ? it.iva
      : it.ivaPercent != null && lineNet > 0
        ? lineNet * ((it.ivaPercent > 1 ? it.ivaPercent : it.ivaPercent * 100) / 100)
        : 0;
    addIva(acc, lineNet, vat, it.ivaPercent);
    perc += it.perception ?? 0;
  }
  return { acc, perc };
}

export function nbOrderAmountLines(row: NewBytesOrder): { lines: AccountDetailLine[]; notes: string[] } {
  const fromItems = ivaFromNbItems(row);
  const net = row.subtotalUsd ?? 0;
  const split = mergeSplit(fromItems.acc, net, row.iva ?? null);

  const lines: AccountDetailLine[] = [
    ...taxBreakdownLines({
      net,
      ...split,
      perceptions: row.perceptions ?? fromItems.perc,
      perceptionLabel: row.perceptionLabel,
      total: row.totalUsd ?? parseAccountAmount(row.amount),
      currency: "USD",
    }),
  ];
  if (row.exchangeRate != null) {
    lines.push({
      label: "Tipo de cambio",
      value: row.exchangeRate.toLocaleString("es-AR", { maximumFractionDigits: 4 }),
    });
  }
  if (row.totalArs != null) lines.push({ label: "Total pesos", value: formatAccountSum(row.totalArs, "ARS") });

  const notes: string[] = [];
  if (row.exchangeRate != null && row.totalArs != null) {
    notes.push("El TC es el que New Bytes informó en el pedido, no una cotización de Nodo.");
  }
  return { lines, notes };
}

export function mergeNbOrder(list: NewBytesOrder, detail: Partial<NewBytesOrder> & { found?: boolean }): NewBytesOrder {
  const merged: NewBytesOrder = { ...list };
  for (const [key, value] of Object.entries(detail)) {
    if (key === "found") continue;
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  return merged;
}
