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
  const rows: AccountDetailItem[] = [];
  for (const it of o.items ?? []) {
    const kit = Boolean(it.kit) || looksLikeKitLine(it);
    const lineTotal = it.total ?? it.net ?? 0;
    const unit = schemeDisplayUnit(it);
    rows.push({
      code: it.code,
      name: it.name || it.code || "Ítem",
      qty: kit && (it.quantity == null || it.quantity <= 0) ? "" : qty(it.quantity ?? null),
      price: unit != null ? money(unit, o.currency) : "",
      total: lineTotal > 0.005 ? money(lineTotal, o.currency) : money(it.total, o.currency),
      badge: kit ? "Esquema" : undefined,
    });
    for (const child of it.children ?? []) {
      rows.push({
        code: child.code,
        name: child.name || child.code || "Componente",
        qty: qty(child.quantity ?? null),
        price: "",
        total: "",
        indent: true,
      });
    }
  }
  return rows;
}

function looksLikeKitLine(it: NonNullable<ElitSaleNote["items"]>[number]): boolean {
  const code = (it.code || "").toUpperCase();
  if (/ESFABRIC|^ES[A-Z]*_/.test(code)) return true;
  return (it.price ?? 0) <= 0.005 && (it.total ?? it.net ?? 0) > 0.005;
}

/** Si Elit manda unitario 0 y el total del kit, el total es el precio final del esquema. */
function schemeDisplayUnit(it: NonNullable<ElitSaleNote["items"]>[number]): number | null {
  if ((it.price ?? 0) > 0.005) return it.price ?? null;
  const total = it.total ?? it.net ?? 0;
  if (total <= 0.005) return it.price ?? null;
  const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
  return total / q;
}

function elitLineNet(it: NonNullable<ElitSaleNote["items"]>[number]): number {
  const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
  const fromUnit = (it.net ?? it.price ?? 0) * q;
  const total = it.total ?? 0;
  if (fromUnit < 0.005 && total > 0.005) return total;
  if (looksLikeKitLine(it) && total > 0.005) return total;
  return fromUnit;
}

export function elitSaleNoteNote(o: ElitSaleNote): string | undefined {
  if (!(o.items ?? []).some((it) => it.kit || looksLikeKitLine(it))) return undefined;
  return "Elit armó el esquema como un kit: el importe de esa línea es el precio final real, no el de lista. Las piezas van debajo, sin precio.";
}

export function elitSaleNoteTotals(o: ElitSaleNote): AccountDetailLine[] {
  const s = o.summary;
  const acc = emptyIvaAcc();
  let itemNet = 0;
  let itemPerc = 0;
  let itemIntern = 0;
  for (const it of o.items ?? []) {
    const lineNet = elitLineNet(it);
    const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
    itemNet += lineNet;
    addIva(acc, lineNet, lineVatAmount(it.vat ?? 0, q, lineNet));
    itemPerc += (it.perceptions ?? 0) * (looksLikeKitLine(it) ? 1 : q);
    itemIntern += (it.internalTax ?? 0) * (looksLikeKitLine(it) ? 1 : q);
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
