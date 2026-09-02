import type { AccountDetailDoc, AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import {
  addIva,
  emptyIvaAcc,
  lineVatAmount,
  mergeSplit,
  taxBreakdownLines,
} from "@/components/account/accountTaxBreakdown";
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
  const acc = emptyIvaAcc();
  let itemNet = 0;
  let itemPerc = 0;
  let itemIntern = 0;
  for (const it of o.items ?? []) {
    const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
    const unitNet = it.net ?? it.price ?? 0;
    const lineNet = unitNet * q;
    itemNet += lineNet;
    addIva(acc, lineNet, lineVatAmount(it.vat ?? 0, q, lineNet));
    itemPerc += (it.perceptions ?? 0) * q;
    itemIntern += (it.internalTax ?? 0) * q;
  }
  const net = s?.net ?? s?.subtotal ?? itemNet;
  return taxBreakdownLines({
    net,
    ...mergeSplit(acc, net, s?.vat ?? null),
    perceptions: s?.perceptions ?? itemPerc,
    internalTaxes: s?.internalTaxes ?? itemIntern,
    shipping: s?.shipping,
    total: s?.total ?? o.amount,
    currency: o.currency === "ARS" ? "ARS" : "USD",
  });
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
