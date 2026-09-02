import type { AccountDetailDoc, AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import {
  addIva,
  emptyIvaAcc,
  lineVatAmount,
  mergeSplit,
  round2,
  taxBreakdownLines,
} from "@/components/account/accountTaxBreakdown";
import type { ElitSaleNote } from "@/lib/api";

type ElitItem = NonNullable<ElitSaleNote["items"]>[number];

const EPS = 0.005;

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

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function blob(it: ElitItem): string {
  return fold(`${it.name || ""} ${it.code || ""} ${it.alfaCode || ""}`);
}

function hasInvoice(o: ElitSaleNote): boolean {
  return Boolean(o.invoiceNumber?.trim());
}

function isElitKitCode(code: string | undefined): boolean {
  return /ESFABRIC|^ES[A-Z]+_/.test((code || "").toUpperCase());
}

function isShippingLine(it: ElitItem): boolean {
  return /transporte|flete|\benvio\b/.test(blob(it));
}

function looksLikeKitLine(it: ElitItem): boolean {
  if (it.kit) return true;
  if (isElitKitCode(it.code) || isElitKitCode(it.alfaCode)) return true;
  return /pc elit|esquema de armado|kit de fabric/.test(blob(it));
}

function looksLikeKitInternal(it: ElitItem): boolean {
  if (looksLikeKitLine(it) || isShippingLine(it)) return false;
  if (it.parentCode) return true;
  const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
  if (q > 1.001) return false;
  return /procesador|\bryzen\b|intel\s*core|\bcpu\b|fuente|power supply|\bpsu\b|gabinete|placa de video|geforce|radeon/.test(
    blob(it),
  );
}

/** Neto sin impuestos de la línea. Nunca `total`: en Elit trae IVA/IIBB y no cierra con el pie. */
function elitLineNet(it: ElitItem): number {
  if (looksLikeKitLine(it)) {
    if ((it.net ?? 0) > EPS) return it.net as number;
    const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
    if ((it.price ?? 0) > EPS) return round2((it.price as number) * q);
    return 0;
  }
  const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
  const unit = it.price ?? it.net ?? 0;
  if (unit > EPS) return round2(unit * q);
  return 0;
}

function kitUnit(it: ElitItem): number | null {
  const line = elitLineNet(it);
  const priced = it.price ?? 0;
  if (line <= EPS) return priced > EPS ? priced : 0;
  if (priced > EPS) return priced;
  const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
  return round2(line / q);
}

function vatPoints(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace("%", "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 0;
  const p = n > 0 && n <= 1 ? n * 100 : n;
  if (Math.abs(p - 10.5) <= 0.15) return 10.5;
  if (Math.abs(p - 21) <= 0.15) return 21;
  if (p > 0 && p <= 27) return p;
  return null;
}

function lineVatPercent(it: ElitItem, lineNet: number): number | null {
  const fromField = vatPoints(it.vatPercent);
  if (fromField != null) return fromField;
  const vat = it.vat ?? 0;
  if (!(vat > EPS) || !(lineNet > EPS)) return null;
  const r = vat / lineNet;
  if (Math.abs(r - 0.105) <= 0.008) return 10.5;
  if (Math.abs(r - 0.21) <= 0.015) return 21;
  return null;
}

function formatIvaPercent(p: number | null): string {
  if (p == null) return "";
  if (Math.abs(p) < 0.05) return "0%";
  return `${p.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function lineVat(it: ElitItem, lineNet: number, q: number): number {
  const pct = lineVatPercent(it, lineNet);
  if (pct != null) return round2(lineNet * (pct / 100));
  return lineVatAmount(it.vat ?? 0, q, lineNet);
}

/**
 * Si Elit mandó el esquema como SKU numérico (800420) y las piezas con precio
 * de lista, las anidamos y le asignamos al kit el resto del neto de la nota.
 */
function groupedElitItems(o: ElitSaleNote): ElitItem[] {
  const src = [...(o.items ?? [])];
  const kitIdx = src.findIndex(looksLikeKitLine);
  if (kitIdx < 0) return src;
  let items = src.map((it) => ({ ...it, children: it.children ? [...it.children] : it.children }));
  const kit = items[kitIdx];
  const internals = items.filter((it, i) => i !== kitIdx && looksLikeKitInternal(it) && !(kit.children ?? []).some((c) => c.code && c.code === it.code));
  if (internals.length > 0) {
    kit.children = [...(kit.children ?? []), ...internals.map((it) => ({ ...it, kit: undefined }))];
    items = items.filter((it, i) => i === kitIdx || !looksLikeKitInternal(it));
  }
  if (elitLineNet(kit) <= EPS) {
    const summaryNet = o.summary?.net ?? o.summary?.subtotal;
    if (summaryNet != null && summaryNet > EPS) {
      const paid = items.reduce((sum, it) => (it === kit ? sum : sum + elitLineNet(it)), 0);
      const remaining = round2(summaryNet - paid);
      if (remaining > EPS) kit.net = remaining;
    }
  }
  return items;
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
  for (const it of groupedElitItems(o)) {
    const kit = looksLikeKitLine(it);
    const lineNet = elitLineNet(it);
    const unit = kit ? kitUnit(it) : (it.price ?? it.net ?? null);
    const iva = formatIvaPercent(lineVatPercent(it, lineNet));
    rows.push({
      code: it.code,
      name: it.name || it.code || "Ítem",
      qty: kit && (it.quantity == null || it.quantity <= 0) ? "" : qty(it.quantity ?? null),
      price: unit != null && unit > EPS ? money(unit, o.currency) : money(unit === 0 ? 0 : null, o.currency),
      total: money(lineNet, o.currency),
      iva,
      badge: kit ? "Esquema" : undefined,
    });
    for (const child of it.children ?? []) {
      const childNet = elitLineNet(child);
      const childQty = child.quantity != null && child.quantity > 0 ? child.quantity : 1;
      const childUnit = child.price != null && child.price > EPS ? child.price : round2(childNet / childQty);
      rows.push({
        code: child.code,
        name: child.name || child.code || "Componente",
        qty: qty(child.quantity ?? null),
        price: childUnit > EPS ? money(childUnit, o.currency) : money(childNet > EPS ? childNet : null, o.currency),
        total: money(childNet > EPS ? childNet : null, o.currency),
        iva: formatIvaPercent(lineVatPercent(child, childNet)),
        indent: true,
      });
    }
  }
  return rows;
}

export function elitSaleNoteNote(o: ElitSaleNote): string | undefined {
  if (!groupedElitItems(o).some(looksLikeKitLine)) return undefined;
  return "El esquema se cobra en la línea del kit (precio final sin impuestos). Las piezas de abajo muestran el precio de lista; no se suman al total de la nota.";
}

/** Suma de la columna Total (líneas padre, sin piezas del esquema). */
export function elitSaleNoteDisplayedNet(o: ElitSaleNote): number {
  return round2(groupedElitItems(o).reduce((sum, it) => sum + elitLineNet(it), 0));
}

export function elitSaleNoteNetMismatch(o: ElitSaleNote): { lineSum: number; expected: number } | null {
  const expected = o.summary?.net ?? o.summary?.subtotal;
  if (expected == null || !Number.isFinite(expected)) return null;
  const lineSum = elitSaleNoteDisplayedNet(o);
  if (Math.abs(lineSum - expected) <= 0.05) return null;
  return { lineSum, expected };
}

export function elitSaleNoteTotals(o: ElitSaleNote): AccountDetailLine[] {
  const s = o.summary;
  const acc = emptyIvaAcc();
  let itemNet = 0;
  let itemPerc = 0;
  let itemIntern = 0;
  for (const it of groupedElitItems(o)) {
    const lineNet = elitLineNet(it);
    const q = it.quantity != null && it.quantity > 0 ? it.quantity : 1;
    itemNet += lineNet;
    addIva(acc, lineNet, lineVat(it, lineNet, q), lineVatPercent(it, lineNet));
    itemPerc += it.perceptions ?? 0;
    itemIntern += it.internalTax ?? 0;
  }
  const net = s?.net ?? s?.subtotal ?? itemNet;
  const split = mergeSplit(acc, net, s?.vat ?? null);
  const got = split.iva105 + split.iva21 + split.ivaOther;
  if (s?.vat != null && s.vat > got + 0.05) {
    split.ivaOther += s.vat - got;
  }
  return taxBreakdownLines({
    net,
    ...split,
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
