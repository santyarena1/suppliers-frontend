import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import type { NewBytesOrder } from "@/lib/api";
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";

function fmtUsd(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD" });
}

function money(value: string | number | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : parseAccountAmount(String(value));
  return n != null ? fmtUsd(n) : String(value);
}

export function nbOrderHeaderLines(row: NewBytesOrder): AccountDetailLine[] {
  return [
    { label: "N°", value: String(row.orderNumber || row.albNumber || "") },
    { label: "Pedido web", value: row.webOrderNumber || "" },
    { label: "Sucursal", value: row.branch != null ? String(row.branch) : "" },
    { label: "Estado", value: row.status || "" },
    { label: "Detalle estado", value: row.statusDescription && row.statusDescription !== row.status ? row.statusDescription : "" },
    { label: "Fecha", value: row.date || "" },
    { label: "Cliente", value: row.clientName || "" },
    { label: "Pago", value: row.payment || "" },
    { label: "Entrega", value: row.delivery || "" },
    { label: "Dirección", value: row.address || "" },
    { label: "Tracking", value: row.trackingNumber || "" },
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
  }));
}

export function nbOrderAmountLines(row: NewBytesOrder): { lines: AccountDetailLine[]; notes: string[] } {
  const lines: AccountDetailLine[] = [];
  if (row.subtotalUsd != null) lines.push({ label: "Neto", value: fmtUsd(row.subtotalUsd) });
  if (row.iva != null) lines.push({ label: "IVA", value: fmtUsd(row.iva) });
  if (row.perceptions != null) {
    lines.push({ label: row.perceptionLabel || "Percepciones", value: fmtUsd(row.perceptions) });
  }
  if (row.totalUsd != null) lines.push({ label: "Total USD", value: fmtUsd(row.totalUsd) });
  else if (row.amount != null) lines.push({ label: "Importe USD", value: money(row.amount) });
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
