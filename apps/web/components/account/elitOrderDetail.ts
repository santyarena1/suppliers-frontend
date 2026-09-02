import type { AccountDetailDoc, AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import type { ElitSaleNote } from "@/lib/api";

function money(n: number | null | undefined, currency?: string): string {
  if (n == null || !Number.isFinite(n)) return "";
  const code = currency === "ARS" ? "ARS" : "USD";
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function hasInvoice(o: ElitSaleNote): boolean {
  return Boolean(o.invoiceNumber?.trim());
}

export function elitSaleNoteHeaderLines(o: ElitSaleNote): AccountDetailLine[] {
  const tracking = [o.trackingSupplier, o.tracking, o.trackingStatus].filter(Boolean).join(" · ");
  const status = o.status?.trim() || "";
  const detail = o.statusDescription?.trim() || "";
  return [
    { label: "N°", value: o.orderNumber || "" },
    { label: "Fecha", value: o.date || "" },
    { label: "Estado", value: status },
    { label: "Detalle", value: detail && detail !== status ? detail : "" },
    { label: "Factura", value: hasInvoice(o) ? o.invoiceNumber.trim() : "Pendiente", tone: hasInvoice(o) ? undefined : "warn" },
    { label: "Depósito", value: o.warehouseName || "" },
    { label: "Condición", value: o.saleCondition || "" },
    { label: "Envío", value: o.shippingMethod || "" },
    { label: "Tracking", value: tracking },
  ];
}

export function elitSaleNoteItems(o: ElitSaleNote): AccountDetailItem[] {
  return (o.items ?? []).map((it) => ({
    code: it.code,
    name: it.name || it.code || "Ítem",
    qty: qty(it.quantity ?? null),
    price: money(it.price, o.currency),
    total: money(it.total, o.currency),
  }));
}

export function elitSaleNoteTotals(o: ElitSaleNote): AccountDetailLine[] {
  const s = o.summary;
  const cur = o.currency;
  const lines: AccountDetailLine[] = [];
  const net = s?.net ?? s?.subtotal;
  if (net != null) lines.push({ label: "Neto", value: money(net, cur) });
  if (s?.vat != null) lines.push({ label: "IVA", value: money(s.vat, cur) });
  if (s?.internalTaxes != null) lines.push({ label: "Imp. internos", value: money(s.internalTaxes, cur) });
  if (s?.perceptions != null) lines.push({ label: "Percepciones", value: money(s.perceptions, cur) });
  if (s?.shipping != null) lines.push({ label: "Envío", value: money(s.shipping, cur) });
  const total = s?.total ?? o.amount;
  if (total != null) lines.push({ label: "Total", value: money(total, cur) });
  return lines;
}

export function elitSaleNoteDocs(o: ElitSaleNote): AccountDetailDoc[] {
  const form = o.form || "NOTA DE VENTA";
  const docs: AccountDetailDoc[] = [];
  if (o.pdfUrl || o.orderNumber) {
    docs.push({
      label: "Descargar nota de venta",
      href: `/providers/ELIT/documents?form=${encodeURIComponent(form)}&number=${encodeURIComponent(o.orderNumber)}&kind=salenote`,
      filename: `nv-${o.orderNumber}.pdf`,
    });
  }
  if (o.dispatchNotePdfUrl) {
    docs.push({
      label: "Descargar remito",
      href: `/providers/ELIT/documents?form=${encodeURIComponent(form)}&number=${encodeURIComponent(o.orderNumber)}&kind=dispatch`,
      filename: `remito-${o.orderNumber}.pdf`,
    });
  }
  if (hasInvoice(o)) {
    docs.push({
      label: "Descargar factura",
      href: `/providers/ELIT/documents?form=${encodeURIComponent("FACTURA A")}&number=${encodeURIComponent(o.invoiceNumber.trim())}`,
      filename: `factura-${o.invoiceNumber.trim()}.pdf`,
    });
  } else {
    docs.push({ label: "Factura pendiente", pending: true });
  }
  return docs;
}
