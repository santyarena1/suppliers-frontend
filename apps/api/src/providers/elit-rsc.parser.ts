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

function looksLikeElitKit(rec: Record<string, unknown>, code: string | undefined): boolean {
  const rawCode = (code || "").toUpperCase();
  if (/ESFABRIC|^ES[A-Z]*_/.test(rawCode)) return true;
  if (rec.kit === true || rec.isKit === true || rec.isFabrication === true) return true;
  const type = (asString(rec.type) || asString(rec.kind) || "").toLowerCase();
  if (/kit|fabric|esquema|bundle/.test(type)) return true;
  return nestedItemList(rec).length > 0;
}

function isBareComponent(item: ElitRscOrderItem): boolean {
  if (item.kit) return false;
  const price = item.price ?? 0;
  const total = item.total ?? item.net ?? 0;
  return price <= 0.005 && total <= 0.005 && Boolean(item.name || item.code);
}

function mapItem(row: unknown): ElitRscOrderItem {
  const rec = asRecord(row) ?? {};
  const code = asString(rec.code) || asString(rec.productCode) || asString(rec.alfaCode);
  const nested = nestedItemList(rec).map(mapItem);
  const kit = looksLikeElitKit(rec, code) || nested.length > 0;
  return {
    code,
    alfaCode: asString(rec.alfaCode),
    productCode: asString(rec.productCode),
    name: asString(rec.name) || asString(rec.description) || asString(rec.detalle),
    quantity: asNumber(rec.quantity) ?? asNumber(rec.qty) ?? null,
    price: asNumber(rec.price) ?? null,
    net: asNumber(rec.net) ?? null,
    vat: asNumber(rec.vat) ?? null,
    internalTax: asNumber(rec.internalTax) ?? null,
    perceptions: asNumber(rec.perceptions) ?? null,
    total: asNumber(rec.total) ?? null,
    kit: kit || undefined,
    children: nested.length > 0 ? nested : undefined,
  };
}

function groupKitFollowers(items: ElitRscOrderItem[]): ElitRscOrderItem[] {
  const out: ElitRscOrderItem[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev?.kit && isBareComponent(it)) {
      const kids = prev.children ?? [];
      if (!it.code || !kids.some((c) => c.code && c.code === it.code)) {
        prev.children = [...kids, { ...it, kit: undefined }];
        continue;
      }
    }
    out.push({ ...it, children: it.children ? [...it.children] : it.children });
  }
  return out;
}

function mapItems(raw: unknown): ElitRscOrderItem[] | undefined {
  const list = unwrapList(raw);
  if (list.length === 0) return undefined;
  return groupKitFollowers(list.map(mapItem));
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
    items: mapItems(rec.items),
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
