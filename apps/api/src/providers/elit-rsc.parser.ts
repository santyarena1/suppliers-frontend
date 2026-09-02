import { asNumber, asRecord, asString, unwrapList } from "./json-value";

export interface ElitRscOrderItem {
  code?: string;
  alfaCode?: string;
  productCode?: string;
  name?: string;
  quantity?: number | null;
  price?: number | null;
  net?: number | null;
  vat?: number | null;
  internalTax?: number | null;
  perceptions?: number | null;
  total?: number | null;
  /** Alícuota de IVA en puntos (10.5 / 21). `vat` es el monto. */
  vatPercent?: number | null;
  parentCode?: string;
  /** Kit / fabricación / esquema: Elit pone el importe en el total, no en el unitario. */
  kit?: boolean;
  children?: ElitRscOrderItem[];
}

export interface ElitRscOrder {
  orderNumber: string;
  invoiceNumber: string;
  status: string;
  statusDescription?: string;
  date: string;
  amount: number | null;
  currency: string;
  form: string;
  warehouseName?: string;
  saleCondition?: string;
  shippingMethod?: string;
  pdfUrl?: string;
  dispatchNotePdfUrl?: string;
  dispatchNote?: string;
  tracking?: string;
  trackingSupplier?: string;
  trackingStatus?: string;
  trackingStatusDate?: string;
  items?: ElitRscOrderItem[];
  summary?: {
    subtotal?: number | null;
    net?: number | null;
    vat?: number | null;
    internalTaxes?: number | null;
    perceptions?: number | null;
    total?: number | null;
    shipping?: number | null;
  };
}

export interface ElitRscMovement {
  date: string;
  dueDate?: string;
  form: string;
  number: string;
  remito?: string;
  debit: number | null;
  credit: number | null;
  /** Importe en la moneda del comprobante (antes de pasar a pesos). */
  amount: number | null;
  total: number | null;
  balance: number | null;
  balanceUsd: number | null;
  currency: string;
  exchangeRate: number | null;
  status?: string;
  pdfUrl?: string;
}

export interface ElitCtaSummary {
  status: string;
  approved: boolean;
  creditLimit: number | null;
  currentAccount: number | null;
  checks: number | null;
  pendingOrders: number | null;
  availableCredit: number | null;
}

export interface ElitUsdVoucher {
  date: string;
  dueDate?: string;
  form: string;
  number: string;
  debit: number | null;
  credit: number | null;
  status?: string;
}

export interface ElitCtaStatement {
  balance: number | null;
  balanceUsd: number | null;
  summary: ElitCtaSummary;
  usdVouchers: ElitUsdVoucher[];
  movements: ElitRscMovement[];
}

export interface ElitPaymentRow {
  id: string;
  date: string;
  total: number | null;
  totalApproved: number | null;
  status: string;
  declinedOperations?: unknown;
}

function extractObjectsWithKey(text: string, key: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let from = 0;
  while (from < text.length) {
    const hit = text.indexOf(key, from);
    if (hit < 0) break;
    const start = text.lastIndexOf("{", hit);
    if (start < 0) {
      from = hit + key.length;
      continue;
    }
    try {
      const parsed = decodeJson(text.slice(start));
      if (parsed.ok) {
        const rec = asRecord(parsed.value);
        const id = rec ? asString(rec._id) || asString(rec.number) || `${start}` : `${start}`;
        if (rec && !seen.has(id)) {
          seen.add(id);
          out.push(rec);
        }
        from = start + parsed.end;
        continue;
      }
    } catch {
      /* fall through */
    }
    from = hit + key.length;
  }
  return out;
}

function decodeJson(slice: string): { ok: true; value: unknown; end: number } | { ok: false } {
  try {
    const { value, end } = scanJson(slice);
    return { ok: true, value, end };
  } catch {
    return { ok: false };
  }
}

/** Parsea un JSON embebido en el RSC de Next (sin eval). */
function scanJson(slice: string): { value: unknown; end: number } {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { value: JSON.parse(slice.slice(0, i + 1)), end: i + 1 };
      }
    }
  }
  throw new Error("unterminated json");
}

function currencyLabel(code: unknown): string {
  const n = asNumber(code);
  if (n === 2) return "USD";
  if (n === 1) return "ARS";
  return asString(code) || "";
}

function nestedItemList(rec: Record<string, unknown>): unknown[] {
  for (const key of [
    "children",
    "components",
    "componentes",
    "kitItems",
    "subItems",
    "parts",
    "composition",
    "articulos",
    "fabricationItems",
  ]) {
    const value = rec[key];
    if (Array.isArray(value) && value.length > 0) return value;
  }
  if (Array.isArray(rec.details) && rec.details.length > 0 && asRecord(rec.details[0])) {
    return rec.details;
  }
  if (Array.isArray(rec.items) && rec.items.length > 0 && (rec.code || rec.productCode || rec.alfaCode)) {
    return rec.items;
  }
  return [];
}

const EPS = 0.005;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function itemBlob(item: { code?: string; alfaCode?: string; name?: string }): string {
  return fold(`${item.name || ""} ${item.code || ""} ${item.alfaCode || ""}`);
}

function isElitKitCode(code: string | undefined): boolean {
  return /ESFABRIC|^ES[A-Z]+_/.test((code || "").toUpperCase());
}

function isShippingLine(item: { name?: string; code?: string; alfaCode?: string }): boolean {
  return /transporte|flete|\benvio\b/.test(itemBlob(item));
}

function looksLikeElitKit(rec: Record<string, unknown>, code: string | undefined): boolean {
  if (isElitKitCode(code) || isElitKitCode(asString(rec.alfaCode)) || isElitKitCode(asString(rec.codigoAlfa))) {
    return true;
  }
  if (rec.kit === true || rec.isKit === true || rec.isFabrication === true) return true;
  const type = (asString(rec.type) || asString(rec.kind) || "").toLowerCase();
  if (/kit|fabric|esquema|bundle/.test(type)) return true;
  const name = fold(asString(rec.name) || asString(rec.description) || asString(rec.detalle) || "");
  if (/pc elit|esquema de armado|kit de fabric/.test(name)) return true;
  return nestedItemList(rec).length > 0;
}

/** Alícuota argentina típica: 0 / 10,5 / 21 (a veces 0.105 / 0.21). El resto es monto. */
function looksLikeVatRate(n: number): boolean {
  if (!Number.isFinite(n) || n < 0 || n > 27) return false;
  const p = n > 0 && n <= 1 ? n * 100 : n;
  return Math.abs(p) <= 0.05 || Math.abs(p - 10.5) <= 0.15 || Math.abs(p - 21) <= 0.15;
}

function vatPoints(n: number): number {
  const p = n > 0 && n <= 1 ? n * 100 : n;
  if (Math.abs(p) <= 0.05) return 0;
  if (Math.abs(p - 10.5) <= 0.15) return 10.5;
  if (Math.abs(p - 21) <= 0.15) return 21;
  return p;
}

function inferVatPercentFromAmount(net: number, vat: number): number | null {
  if (!(net > EPS) || !(vat > EPS)) return null;
  const r = vat / net;
  if (Math.abs(r - 0.105) <= 0.008) return 10.5;
  if (Math.abs(r - 0.21) <= 0.015) return 21;
  return null;
}

function interpretVat(
  rec: Record<string, unknown>,
  unitNet: number | null,
  qty: number | null,
): { vat: number | null; vatPercent: number | null } {
  let percent: number | null = null;
  for (const key of ["vatPercent", "ivaPercent", "alicuotaIva", "vatAliquot", "ivaAliquot", "porcentajeIva", "taxPercent", "iva"]) {
    const n = asNumber(rec[key]);
    if (n == null || !looksLikeVatRate(n)) continue;
    percent = vatPoints(n);
    break;
  }
  const rawVat = asNumber(rec.vat) ?? asNumber(rec.ivaAmount) ?? asNumber(rec.vatAmount);
  let amount: number | null = null;
  if (rawVat != null) {
    if (percent == null && looksLikeVatRate(rawVat)) percent = vatPoints(rawVat);
    else if (!looksLikeVatRate(rawVat)) amount = rawVat;
  }
  const ivaRaw = asNumber(rec.iva);
  if (percent == null && amount == null && ivaRaw != null && !looksLikeVatRate(ivaRaw)) {
    amount = ivaRaw;
  }
  const q = qty != null && qty > 0 ? qty : 1;
  const lineNet = (unitNet ?? 0) * q;
  if (percent != null && amount == null && lineNet > EPS) amount = round2(lineNet * (percent / 100));
  if (percent == null && amount != null) percent = inferVatPercentFromAmount(lineNet, amount);
  return { vat: amount, vatPercent: percent };
}

function isBareComponent(item: ElitRscOrderItem): boolean {
  if (item.kit || isShippingLine(item)) return false;
  const price = item.price ?? 0;
  const total = item.total ?? item.net ?? 0;
  return price <= EPS && total <= EPS && Boolean(item.name || item.code);
}

/**
 * Piezas del esquema que Elit manda como líneas sueltas CON precio de lista.
 * CPU / fuente / gabinete / video en cantidad 1: si las sumáramos, el neto
 * no cierra con el total sin imp. de la nota.
 */
function looksLikeElitKitInternal(item: ElitRscOrderItem): boolean {
  if (item.kit || isShippingLine(item)) return false;
  if (item.parentCode) return true;
  const q = item.quantity != null && item.quantity > 0 ? item.quantity : 1;
  if (q > 1.001) return false;
  return /procesador|\bryzen\b|intel\s*core|\bcpu\b|fuente|power supply|\bpsu\b|gabinete|placa de video|geforce|radeon/.test(
    itemBlob(item),
  );
}

function mapItem(row: unknown): ElitRscOrderItem {
  const rec = asRecord(row) ?? {};
  const code = asString(rec.code) || asString(rec.productCode) || asString(rec.alfaCode);
  const nested = nestedItemList(rec).map(mapItem);
  const kit = looksLikeElitKit(rec, code) || nested.length > 0;
  const quantity = asNumber(rec.quantity) ?? asNumber(rec.qty) ?? null;
  const price = asNumber(rec.price) ?? null;
  const { vat, vatPercent } = interpretVat(rec, price, quantity);
  return {
    code,
    alfaCode: asString(rec.alfaCode) || asString(rec.codigoAlfa),
    productCode: asString(rec.productCode),
    name: asString(rec.name) || asString(rec.description) || asString(rec.detalle),
    quantity,
    price,
    net: asNumber(rec.net) ?? null,
    vat,
    vatPercent,
    internalTax: asNumber(rec.internalTax) ?? null,
    perceptions: asNumber(rec.perceptions) ?? null,
    total: asNumber(rec.total) ?? null,
    parentCode:
      asString(rec.parentCode) ||
      asString(rec.codigoPadre) ||
      asString(rec.kitCode) ||
      asString(rec.parent),
    kit: kit || undefined,
    children: nested.length > 0 ? nested : undefined,
  };
}

function appendChild(kit: ElitRscOrderItem, child: ElitRscOrderItem): void {
  const kids = kit.children ?? [];
  if (child.code && kids.some((c) => c.code && c.code === child.code)) return;
  kit.children = [...kids, { ...child, kit: undefined }];
}

function groupKitFollowers(items: ElitRscOrderItem[]): ElitRscOrderItem[] {
  const out: ElitRscOrderItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev?.kit && isBareComponent(it)) {
      appendChild(prev, it);
      continue;
    }
    out.push({ ...it, children: it.children ? [...it.children] : it.children });
  }
  return out;
}

function resolveParentKit(item: ElitRscOrderItem, kits: ElitRscOrderItem[]): ElitRscOrderItem | undefined {
  if (item.parentCode) {
    const parent = kits.find(
      (k) =>
        k.code === item.parentCode ||
        k.alfaCode === item.parentCode ||
        k.productCode === item.parentCode,
    );
    if (parent) return parent;
  }
  if (kits.length === 1 && looksLikeElitKitInternal(item)) return kits[0];
  return undefined;
}

/** CPU/fuente con precio de lista que Elit dejó sueltos: van debajo del kit, sin sumar. */
function attachKitInternals(items: ElitRscOrderItem[]): ElitRscOrderItem[] {
  const kits = items.filter((i) => i.kit);
  if (kits.length === 0) return items;
  const used = new Set<ElitRscOrderItem>();
  for (const it of items) {
    if (it.kit) continue;
    const kit = resolveParentKit(it, kits);
    if (!kit) continue;
    appendChild(kit, it);
    used.add(it);
  }
  if (used.size === 0) return items;
  return items.filter((it) => it.kit || !used.has(it));
}

/** Neto de lista (cant × unitario). Nunca `total`: en Elit suele ir con IVA/IIBB. */
function lineListNet(item: ElitRscOrderItem): number {
  if (item.kit) {
    if ((item.net ?? 0) > EPS) return item.net as number;
    if ((item.price ?? 0) <= EPS && (item.total ?? 0) > EPS) return item.total as number;
    return 0;
  }
  const q = item.quantity != null && item.quantity > 0 ? item.quantity : 1;
  const unit = item.price ?? 0;
  if (unit > EPS) return round2(unit * q);
  if ((item.net ?? 0) > EPS) return item.net as number;
  return 0;
}

function fillKitNetFromSummary(items: ElitRscOrderItem[], summaryNet: number | null | undefined): void {
  const kits = items.filter((i) => i.kit);
  if (kits.length !== 1) return;
  const kit = kits[0];
  const already = lineListNet(kit);
  if (already > EPS) return;
  if (summaryNet == null || !(summaryNet > EPS)) return;
  const paid = items.reduce((sum, it) => (it === kit ? sum : sum + lineListNet(it)), 0);
  const remaining = round2(summaryNet - paid);
  if (remaining > EPS) {
    kit.net = remaining;
    if ((kit.total ?? 0) <= EPS) kit.total = remaining;
  }
}

function inferMissingVatPercents(items: ElitRscOrderItem[]): void {
  for (const it of items) {
    if (it.children) inferMissingVatPercents(it.children);
    if (it.vatPercent == null) {
      it.vatPercent = inferVatPercentFromAmount(lineListNet(it), it.vat ?? 0);
    }
    if (it.vatPercent == null && it.children && it.children.length > 0) {
      const rates = it.children.map((c) => c.vatPercent).filter((p): p is number => p != null);
      if (rates.length > 0 && rates.every((p) => p === rates[0])) it.vatPercent = rates[0];
    }
  }
}

function mapItems(raw: unknown, summaryNet?: number | null): ElitRscOrderItem[] | undefined {
  const list = unwrapList(raw);
  if (list.length === 0) return undefined;
  const grouped = attachKitInternals(groupKitFollowers(list.map(mapItem)));
  fillKitNetFromSummary(grouped, summaryNet);
  inferMissingVatPercents(grouped);
  return grouped;
}

export function mapElitSaleNote(rec: Record<string, unknown>): ElitRscOrder {
  const ship = asRecord(rec.shippingMethodInfo);
  const sale = asRecord(rec.saleConditionInfo);
  const statusObj = asRecord(rec.saleNoteStatus);
  const summaryRec = asRecord(rec.summary);
  const summary = summaryRec
    ? {
        subtotal: asNumber(summaryRec.subtotal) ?? null,
        net: asNumber(summaryRec.net) ?? null,
        vat: asNumber(summaryRec.vat) ?? null,
        internalTaxes: asNumber(summaryRec.internalTaxes) ?? null,
        perceptions: asNumber(summaryRec.perceptions) ?? null,
        total: asNumber(summaryRec.total) ?? null,
        shipping: asNumber(summaryRec.shipping) ?? null,
      }
    : undefined;
  return {
    orderNumber: asString(rec.number) || asString(rec.internalNumber) || "",
    invoiceNumber: asString(rec.invoiceNumber) || "",
    status: asString(statusObj?.label) || asString(rec.message) || asString(rec.status) || "",
    statusDescription: asString(statusObj?.description),
    date: asString(rec.date) || "",
    amount: asNumber(summary?.total) ?? asNumber(rec.debit) ?? asNumber(rec.balance) ?? null,
    currency: currencyLabel(rec.currency),
    form: asString(rec.form) || "NOTA DE VENTA",
    warehouseName: asString(rec.warehouseName),
    saleCondition: asString(sale?.name) || asString(rec.saleCondition),
    shippingMethod: asString(ship?.name) || asString(rec.shippingMethod),
    pdfUrl: asString(rec.pdfUrl),
    dispatchNotePdfUrl: asString(rec.dispatchNotePdfUrl),
    dispatchNote: asString(rec.dispatchNote),
    tracking: asString(rec.tracking),
    trackingSupplier: asString(rec.trackingSupplier),
    trackingStatus: asString(rec.trackingStatus),
    trackingStatusDate: asString(rec.trackingStatusDate),
    items: mapItems(rec.items, summary?.net ?? summary?.subtotal),
    summary,
  };
}

export function parseElitSaleNotesPayload(body: unknown): ElitRscOrder[] {
  return unwrapList(body)
    .map((row) => mapElitSaleNote(asRecord(row) ?? {}))
    .filter((o) => o.orderNumber);
}

export function parseElitPedidosRsc(rsc: string): ElitRscOrder[] {
  return extractObjectsWithKey(rsc, '"form":"NOTA DE VENTA"').map(mapElitSaleNote);
}

function firstNum(rec: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = asNumber(rec[key]);
    if (n != null) return n;
  }
  return null;
}

function firstStr(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const nested = asRecord(rec[key]);
    if (nested) {
      const label = asString(nested.label) || asString(nested.name) || asString(nested.status);
      if (label) return label;
    }
    const s = asString(rec[key]);
    if (s) return s;
  }
  return undefined;
}

function parseArMoney(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** En el RSC a veces el cupo va como texto "Cupo de crédito" + "4.610.000,00". */
function labeledAmount(rsc: string, label: RegExp): number | null {
  const m = rsc.match(new RegExp(label.source + "[^0-9\\-]{0,80}(-?[\\d.]+,\\d{2}|-?\\d+(?:\\.\\d+)?)", "i"));
  if (!m) return null;
  return parseArMoney(m[1]);
}

function emptyCtaSummary(): ElitCtaSummary {
  return {
    status: "",
    approved: false,
    creditLimit: null,
    currentAccount: null,
    checks: null,
    pendingOrders: null,
    availableCredit: null,
  };
}

function mapCtaSummary(rec: Record<string, unknown>): ElitCtaSummary {
  const status = firstStr(rec, ["status", "currentAccountStatus", "accountStatus", "label"]) || "";
  const creditLimit = firstNum(rec, ["creditLimit", "cupo", "cupoCredito", "creditQuota", "limit"]);
  const currentAccount = firstNum(rec, [
    "currentAccount",
    "cuentaCorriente",
    "accountBalance",
    "balanceARS",
    "checkingAccount",
    "currentBalance",
  ]);
  const checks = firstNum(rec, ["checksInPortfolio", "chequesEnCartera", "checks", "cheques"]);
  const pendingOrders = firstNum(rec, ["pendingOrders", "pedidosPendientes", "pendingSales", "pending"]);
  const availableCredit = firstNum(rec, ["availableCredit", "creditoDisponible", "creditAvailable"]);
  return {
    status,
    approved: rec.approved === true || /aprobad/i.test(status),
    creditLimit,
    currentAccount,
    checks,
    pendingOrders,
    availableCredit,
  };
}

function summaryScore(s: ElitCtaSummary): number {
  return [s.creditLimit, s.currentAccount, s.checks, s.pendingOrders, s.availableCredit].filter((n) => n != null).length;
}

function mergeSummary(base: ElitCtaSummary, extra: ElitCtaSummary): ElitCtaSummary {
  return {
    status: extra.status || base.status,
    approved: extra.approved || base.approved,
    creditLimit: extra.creditLimit ?? base.creditLimit,
    currentAccount: extra.currentAccount ?? base.currentAccount,
    checks: extra.checks ?? base.checks,
    pendingOrders: extra.pendingOrders ?? base.pendingOrders,
    availableCredit: extra.availableCredit ?? base.availableCredit,
  };
}

function mapCtaMovement(rec: Record<string, unknown>): ElitRscMovement {
  const amount = firstNum(rec, ["amount", "importe", "originalAmount", "totalCurrency"]);
  const exchangeRate = firstNum(rec, ["exchangeRate", "quotation", "quote", "cotizacion", "currencyQuote", "rate"]);
  return {
    date: firstStr(rec, ["date", "fecha"]) || "",
    dueDate: firstStr(rec, ["dueDate", "expiration", "vencimiento", "expiry"]),
    form: firstStr(rec, ["form", "comprobante", "type", "kind"]) || "",
    number: firstStr(rec, ["number", "numero"]) || "",
    remito: firstStr(rec, ["remito", "dispatchNote", "deliveryNote"]),
    debit: firstNum(rec, ["debit", "debe", "debitARS"]),
    credit: firstNum(rec, ["credit", "haber", "creditARS"]),
    amount,
    total: asNumber(rec.total) ?? amount,
    balance: asNumber(rec.balance) ?? null,
    balanceUsd: asNumber(rec.balanceUSD) ?? asNumber(rec.balanceUsd) ?? null,
    currency: currencyLabel(rec.currency ?? rec.moneda),
    exchangeRate,
    status: firstStr(rec, ["status", "state", "invoiceStatus"]),
    pdfUrl: asString(rec.pdfUrl),
  };
}

function mapUsdVoucher(rec: Record<string, unknown>): ElitUsdVoucher {
  return {
    date: firstStr(rec, ["date", "fecha"]) || "",
    dueDate: firstStr(rec, ["dueDate", "expiration", "vencimiento", "expiry"]),
    form: firstStr(rec, ["form", "comprobante", "type"]) || "",
    number: firstStr(rec, ["number", "numero"]) || "",
    debit: firstNum(rec, ["debit", "debe", "debitUSD", "amount"]),
    credit: firstNum(rec, ["credit", "haber", "creditUSD"]),
    status: firstStr(rec, ["status", "state"]),
  };
}

function collectUsdVouchers(rsc: string, recs: Record<string, unknown>[], movements: ElitRscMovement[]): ElitUsdVoucher[] {
  const fromArrays: ElitUsdVoucher[] = [];
  for (const rec of recs) {
    for (const key of ["dollarInvoices", "usdInvoices", "invoicesUSD", "documentsUSD", "dollarDocuments", "comprobantesDolares"]) {
      for (const row of unwrapList(rec[key])) {
        const item = asRecord(row);
        if (!item) continue;
        const mapped = mapUsdVoucher(item);
        if (mapped.number || mapped.form) fromArrays.push(mapped);
      }
    }
  }
  if (fromArrays.length > 0) return fromArrays;
  return movements
    .filter((m) => m.currency === "USD" && /factura|nota de d/i.test(m.form))
    .map((m) => ({
      date: m.date,
      dueDate: m.dueDate,
      form: m.form,
      number: m.number,
      debit: m.amount ?? m.debit,
      credit: m.credit != null && (m.amount == null || Math.abs((m.credit ?? 0) - (m.amount ?? 0)) < 0.05) ? m.credit : null,
      status: m.status,
    }));
}

export function parseElitCtaRsc(rsc: string): ElitCtaStatement {
  const rows = extractObjectsWithKey(rsc, '"invoiceCode":').filter((rec) => asString(rec.form) || asString(rec.number));
  const movements = rows.map(mapCtaMovement);

  let summary = emptyCtaSummary();
  for (const key of ['"creditLimit":', '"availableCredit":', '"cupo":', '"currentAccount":', '"checksInPortfolio":', '"cuentaCorriente":']) {
    for (const rec of extractObjectsWithKey(rsc, key)) {
      const mapped = mapCtaSummary(rec);
      if (summaryScore(mapped) > summaryScore(summary) || (summaryScore(mapped) === summaryScore(summary) && mapped.status && !summary.status)) {
        summary = mergeSummary(summary, mapped);
      } else {
        summary = mergeSummary(summary, mapped);
      }
    }
  }

  if (summary.creditLimit == null) summary.creditLimit = labeledAmount(rsc, /cupo de cr[eé]dito/i);
  if (summary.currentAccount == null) summary.currentAccount = labeledAmount(rsc, /cuenta corriente/i);
  if (summary.checks == null) summary.checks = labeledAmount(rsc, /cheques en cartera/i);
  if (summary.pendingOrders == null) summary.pendingOrders = labeledAmount(rsc, /pedidos pendientes/i);
  if (summary.availableCredit == null) summary.availableCredit = labeledAmount(rsc, /cr[eé]dito disponible/i);
  if (!summary.status) {
    const st = rsc.match(/cuenta corriente (aprobada|rechazada|pendiente|suspendida)/i);
    if (st) {
      summary.status = `Cuenta corriente ${st[1].toLowerCase()}`;
      summary.approved = /aprobada/i.test(st[1]);
    }
  }

  const first = movements[0];
  const saldo = movements.find((m) => /saldo/i.test(m.form));
  if (summary.currentAccount == null) {
    summary.currentAccount = first?.balance ?? saldo?.balance ?? saldo?.total ?? null;
  }
  if (summary.availableCredit == null && summary.creditLimit != null && summary.currentAccount != null) {
    summary.availableCredit = Math.round((summary.creditLimit - summary.currentAccount) * 100) / 100;
  }

  const usdVouchers = collectUsdVouchers(rsc, extractObjectsWithKey(rsc, '"invoiceCode":').concat(
    extractObjectsWithKey(rsc, '"dollarInvoices":'),
    extractObjectsWithKey(rsc, '"usdInvoices":'),
  ), movements);

  return {
    balance: summary.currentAccount,
    balanceUsd: first?.balanceUsd ?? saldo?.balanceUsd ?? null,
    summary,
    usdVouchers,
    movements,
  };
}

export function parseElitPaymentsPayload(body: unknown): {
  canCreateReport: boolean;
  active: unknown;
  payments: ElitPaymentRow[];
} {
  const rec = asRecord(body) ?? {};
  const data = asRecord(rec.data) ?? rec;
  const nested = asRecord(data.data) ?? data;
  const canCreateReport = Boolean(rec.canCreateReport ?? data.canCreateReport ?? nested.canCreateReport);
  const paymentsSrc = nested.payments ?? data.payments ?? rec.payments;
  const payments = unwrapList(paymentsSrc).map((row) => {
    const p = asRecord(row) ?? {};
    return {
      id: asString(p.id) || asString(p._id) || "",
      date: asString(p.date) || "",
      total: asNumber(p.total) ?? null,
      totalApproved: asNumber(p.totalApproved) ?? null,
      status: asString(p.status) || "",
      declinedOperations: p.declinedOperations,
    };
  });
  return {
    canCreateReport,
    active: nested.active ?? data.active ?? rec.active ?? null,
    payments,
  };
}

export function parseElitPaymentOptions(body: unknown): {
  banks: { id?: number; name: string }[];
  operations: {
    bank?: number;
    code?: string;
    name?: string;
    validations?: unknown;
  }[];
} {
  const rec = asRecord(body) ?? {};
  const data = asRecord(rec.data) ?? rec;
  const banksRaw = unwrapList(data.banks ?? rec.banks ?? data.bankList);
  const opsRaw = unwrapList(data.operations ?? rec.operations ?? data.operationTypes);
  const banks = banksRaw.map((row) => {
    if (typeof row === "string") return { name: row };
    const b = asRecord(row) ?? {};
    const id = asNumber(b.id) ?? asNumber(b.bank) ?? asNumber(b.code);
    const name = asString(b.name) || asString(b.bankName) || asString(b.label) || (id != null ? `Banco ${id}` : "");
    return { id, name };
  }).filter((b) => b.name);
  const operations = opsRaw.map((row) => {
    const o = asRecord(row) ?? {};
    return {
      bank: asNumber(o.bank) ?? asNumber(o.bankId),
      code: asString(o.code) || asString(o.type) || (asNumber(o.code) != null ? String(asNumber(o.code)) : undefined),
      name: asString(o.name) || asString(o.operationName) || asString(o.label),
      validations: o.validations,
    };
  }).filter((o) => o.name || o.code);
  return { banks, operations };
}

export { scanJson as scanEmbeddedJson };
