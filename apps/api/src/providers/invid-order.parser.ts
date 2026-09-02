export function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
}

/** Invid manda `mensaje` de stock en HTML; lo dejamos legible para Nodo. */
export function stripHtmlMessage(html: string | undefined | null): string | undefined {
  if (!html) return undefined;
  const text = decodeEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " ")
  ).replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  return text || undefined;
}

export interface InvidRadioOption {
  value: string;
  label: string;
  id?: string;
}

export interface InvidCheckoutForm {
  payments: InvidRadioOption[];
  deliveries: InvidRadioOption[];
  expresoCompanies: InvidRadioOption[];
  hasTerms: boolean;
  hasConfirmButton: boolean;
}

const KNOWN_PAYMENT_LABELS: Record<string, string> = {
  "-1": "Contado",
  "67": "Depósito/Transferencia Banco",
  "69": "Cheque previa acreditación",
  "107": "Transferencia desde MercadoPago",
  "132": "Tarjeta de Crédito (recargo 5%)",
};

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))
    ?? tag.match(new RegExp(`\\b${name}='([^']*)'`, "i"));
  return m?.[1];
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseRadios(html: string, name: string): InvidRadioOption[] {
  const re = new RegExp(`<input\\b[^>]*\\bname=["']${name}["'][^>]*>`, "gi");
  const options: InvidRadioOption[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const value = attr(tag, "value");
    if (value == null || seen.has(value)) continue;
    seen.add(value);
    const id = attr(tag, "id");
    const after = html.slice(m.index, m.index + 500);
    const labelFor = id
      ? html.match(new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([\\s\\S]*?)</label>`, "i"))
      : null;
    const siblingLabel = after.match(/<label[^>]*>([\s\S]*?)<\/label>/i);
    const cellText = after.match(/>([^<]{2,80})</);
    const rawLabel = labelFor?.[1] ?? siblingLabel?.[1] ?? cellText?.[1] ?? "";
    const label = stripTags(rawLabel) || KNOWN_PAYMENT_LABELS[value] || `Opción ${value}`;
    options.push({ value, label, id });
  }
  return options;
}

export function parseCheckoutForm(html: string): InvidCheckoutForm {
  return {
    payments: parseRadios(html, "opcionPago"),
    deliveries: parseRadios(html, "entrega"),
    expresoCompanies: parseSelectOptions(html, "expreso_entrega"),
    hasTerms: /name=["']termYCond["']/i.test(html) || /id=["']termYCond["']/i.test(html),
    hasConfirmButton: /id=["']iniciarpago["']/i.test(html) || /CONFIRMAR\s+PEDIDO/i.test(html),
  };
}

/** Hidden/text/checkbox values from `#form_envio` — lo que mandaría el browser. */
export function collectFormFields(html: string, formId = "form_envio"): Record<string, string> {
  const formMatch = html.match(new RegExp(`<form\\b[^>]*\\bid=["']${formId}["'][^>]*>([\\s\\S]*?)</form>`, "i"));
  const block = formMatch?.[1] ?? "";
  if (!block) return {};
  const fields: Record<string, string> = {};
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(block))) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (["button", "submit", "image", "file"].includes(type)) continue;
    const name = attr(tag, "name");
    if (!name) continue;
    if (type === "radio") {
      if (/\bchecked\b/i.test(tag)) fields[name] = attr(tag, "value") ?? "";
      continue;
    }
    if (type === "checkbox" && !/\bchecked\b/i.test(tag)) continue;
    fields[name] = attr(tag, "value") ?? "";
  }
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(block))) {
    const name = attr(`<x ${m[1]}>`, "name");
    if (!name) continue;
    const options = [...m[2].matchAll(/<option\b([^>]*)>/gi)];
    const selected = options.find((o) => /\bselected\b/i.test(o[0])) ?? options[0];
    fields[name] = selected ? (attr(selected[0], "value") ?? "") : "";
  }
  return fields;
}

function parseSelectOptions(html: string, id: string): InvidRadioOption[] {
  const block = html.match(new RegExp(`<select[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, "i"));
  if (!block) return [];
  const options: InvidRadioOption[] = [];
  const re = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1]))) {
    const value = attr(`<x ${m[1]}>`, "value");
    if (!value) continue;
    const label = stripTags(m[2]);
    if (!label || /seleccione/i.test(label)) continue;
    options.push({ value, label });
  }
  return options;
}

export function pickPickupDelivery(deliveries: InvidRadioOption[]): InvidRadioOption | undefined {
  return deliveries.find((d) => /retir|f[aá]brica|sucursal|pickup/i.test(`${d.label} ${d.id ?? ""}`))
    ?? deliveries.find((d) => d.value === "1")
    ?? deliveries[0];
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** "US$ 6.01", "6,01", 6.01 → número. */
export function parseInvidMoney(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return round2(raw);
  if (raw == null) return 0;
  const s = String(raw).replace(/US\$/gi, "").replace(/AR\$/gi, "").replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  const normalized = s.includes(",") && !s.includes(".")
    ? s.replace(",", ".")
    : s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(n) : 0;
}

export function parseXmlCost(xml: string): number {
  return parseInvidMoney(xml.match(/<costo>([^<]*)<\/costo>/i)?.[1]);
}

/**
 * Precio mostrado en la tabla de entrega del carrito autenticado.
 * 1 RETIRA · 5 Puerta a puerta · 3 EXPRESO · 6 Express 24hs.
 */
export function parseQuotedShipping(html: string, deliveryValue: string): number | null {
  const byId = (id: string) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([^<]*)`, "i"));
    if (!m) return null;
    const n = parseInvidMoney(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  if (deliveryValue === "5") return byId("valor_envio_x_cp");
  if (deliveryValue === "6") return byId("valorEntregar");
  if (deliveryValue === "3") return byId("valorExpreso");
  if (deliveryValue === "1") {
    const row = html.match(/<tr[^>]*id=["']fila_1["'][\s\S]*?<\/tr>/i);
    const lastTd = row?.[0]?.match(/<td[^>]*>\s*(?:US\$\s*)?([\d.,]+)\s*<\/td>\s*<\/tr>/i);
    if (lastTd) return parseInvidMoney(lastTd[1]);
    return 0;
  }
  return null;
}

/**
 * Misma fórmula que el resumen del carrito de Invid:
 * (a) subtotal neto + (b) envío + (c) IVA de (a)+(b) + (d) imp. internos + (e) percepción % de (a)+(b).
 * `percepcionPercent` es alícuota (3 = 3%), no un monto.
 */
export function computeInvidTotals(input: {
  net: number;
  ivaProducts: number;
  internos: number;
  percepcionPercent: number;
  shipping?: number;
}) {
  const shipping = input.shipping ?? 0;
  const iva = round2(input.ivaProducts + shipping * 0.21);
  const percepciones = round2((input.net + shipping) * (input.percepcionPercent / 100));
  const total = round2(input.net + shipping + iva + input.internos + percepciones);
  return { shipping, iva, percepciones, total };
}

export interface InvidSubmitResult {
  appearsSuccessful: boolean;
  orderNumber?: string;
  webOrderNumber?: string;
  errorMessage?: string;
}

export function parseSubmitResult(html: string): InvidSubmitResult {
  const stillOnCart = /id=["']iniciarpago["']/i.test(html) && /name=["']opcionPago["']/i.test(html);
  const thanks = /gracias por tu pedido|pedido fue grabado|enviado a invid para su procesamiento/i.test(html);
  const web = html.match(/pedido\s*web\s*asignado[^0-9]{0,24}(\d{3,})/i)
    ?? html.match(/pedido\s*web[^0-9]{0,40}(\d{3,})/i);
  const orden = html.match(/\borden\b[^0-9]{0,40}(\d{3,})/i);
  const errorBlock = html.match(/class="[^"]*(?:error|msgalerta|alert-danger|stockerror)[^"]*"[^>]*>([^<]{5,200})/i);
  const errorMessage = errorBlock ? stripTags(errorBlock[1]) : undefined;
  const looksLikeError = Boolean(errorMessage) && /error|no se pudo|inv[aá]lid|rechaz/i.test(errorMessage ?? "");
  const webOrderNumber = web?.[1];
  const orderNumber = orden?.[1] && orden[1] !== webOrderNumber ? orden[1] : undefined;

  if (stillOnCart || looksLikeError) {
    return {
      appearsSuccessful: false,
      errorMessage: looksLikeError
        ? errorMessage
        : "Invid devolvió el carrito sin confirmar el pedido",
    };
  }

  return {
    appearsSuccessful: Boolean(webOrderNumber || thanks),
    orderNumber,
    webOrderNumber,
    errorMessage: webOrderNumber || thanks ? undefined : "Invid no devolvió número de pedido web",
  };
}

export interface InvidOrderItem {
  code?: string;
  name: string;
  price?: string;
  qty?: string;
  total?: string;
}

export interface InvidOrderTotals {
  net?: number;
  iva?: number;
  iva105?: number;
  iva21?: number;
  internos?: number;
  percepciones?: number;
  shipping?: number;
  /** Resto no discriminado (total − neto − envío − lo que sí vino). */
  taxes?: number;
  total?: number;
}

export type InvidExchangeRateSource = "order" | "current";

export interface InvidPaymentBank {
  value: string;
  label: string;
}

export interface InvidPaymentForm {
  action: string;
  method: string;
  fields: Record<string, string>;
  banks: InvidPaymentBank[];
  bankField: string;
  notesField: string;
  fileFields: string[];
  notice?: string;
  orderField?: string;
}

export const INVID_PAYMENT_NOTICE = [
  "No envíes el comprobante si necesitás que se realicen cambios en el pedido, primero contactate con nosotros.",
  "Usá el campo Observaciones si necesitás aclararnos alguna cuestión: utilizás dinero a favor en tu cuenta, el pago es parcial, te queda un saldo en efectivo, etc.",
  "Si el pago se realizó a través de más de un banco, seleccioná el banco al cual hayas depositado la mayor cantidad de dinero.",
  "En el caso de Echeq, seleccioná Galicia.",
  "Los informes de pagos enviados luego de las 17:00 hs serán tomados con el TC del día siguiente.",
].join(" ");

export interface InvidOrderRow {
  orderNumber: string;
  webOrderNumber: string;
  status: string;
  date: string;
  amount: string;
  invoice: string;
  invoiceHrefs: string[];
  delivery?: string;
  payment?: string;
  items: InvidOrderItem[];
  links: { href: string; label: string }[];
  totals?: InvidOrderTotals;
  exchangeRate?: number;
  exchangeRateSource?: InvidExchangeRateSource;
  amountArs?: number;
  canAttachPayment?: boolean;
  paymentHref?: string;
}

const LINE_STATUS = /^(abierto|cerrado|cancelado|pendiente|pedido|vencido|anulado|facturado)$/i;

export function formatUsMoney(n: number): string {
  return `US$ ${round2(n).toFixed(2)}`;
}

function isMoneyText(t: string): boolean {
  return /(?:US\$|AR\$|USD)\s*[\d.,]+/i.test(t) || /^\$?\s*[\d]+[.,]\d{2}$/.test(t.trim());
}

function isQtyText(t: string): boolean {
  return /^\d{1,5}$/.test(t.trim());
}

function isUselessName(s: string): boolean {
  return !s
    || LINE_STATUS.test(s)
    || isMoneyText(s)
    || isQtyText(s)
    || /x---det--/i.test(s)
    || /^(https?:|\/|\.)/i.test(s);
}

function extractProductCode(text: string, html: string): string | undefined {
  const fromParen = text.match(/\((\d{4,})\)/)?.[1];
  if (fromParen) return fromParen;
  const fromHref = html.match(/x---det--(\d+)/i)?.[1]
    ?? html.match(/nro_?art(?:iculo)?=(\d+)/i)?.[1];
  if (fromHref) return fromHref;
  const bare = text.match(/\b(0?41\d{4,})\b/)?.[1];
  return bare;
}

function parseItemRow(tdHtmls: string[]): InvidOrderItem | null {
  const texts = tdHtmls.map(stripTags);
  if (texts.length < 2) return null;
  const joined = texts.join(" ");
  if (/calificaci[oó]n/i.test(joined) && /producto/i.test(joined)) return null;
  if (/producto/i.test(joined) && /precio/i.test(joined)) return null;
  if (/cargar a pedido/i.test(joined)) return null;
  if (/^total:/i.test(joined) || texts.some((t) => /^total:/i.test(t))) return null;
  if (texts.some((t) => /forma de (entrega|pago)/i.test(t))) return null;

  let priceIdx = -1;
  for (let i = 0; i < texts.length; i++) {
    if (isMoneyText(texts[i])) priceIdx = i;
  }
  let qtyIdx = -1;
  for (let i = texts.length - 1; i >= 0; i--) {
    if (i !== priceIdx && isQtyText(texts[i])) {
      qtyIdx = i;
      break;
    }
  }

  const htmlBlob = tdHtmls.join(" ");
  const candidates = texts
    .map((t, i) => {
      const anchors = extractAnchors(tdHtmls[i] ?? "");
      const titles = [...(tdHtmls[i] ?? "").matchAll(/\b(?:title|alt)="([^"]+)"/gi)]
        .map((m) => decodeEntities(m[1]).trim())
        .filter(Boolean);
      const linkLabel = anchors.map((a) => a.label).find((l) => l && !isUselessName(l));
      const title = titles.find((s) => s && !isUselessName(s));
      const label = [t, linkLabel, title].find((s) => s && !isUselessName(s)) ?? "";
      return { t, i, label, html: tdHtmls[i] ?? "" };
    })
    .filter((c) => c.i !== priceIdx && c.i !== qtyIdx && (c.label || extractProductCode(c.t, c.html)));

  const named = candidates.sort((a, b) => {
    const score = (x: (typeof candidates)[number]) => {
      let s = 0;
      if (/\(\d{4,}\)/.test(x.label || x.t)) s += 10;
      if (/x---det--/i.test(x.html)) s += 8;
      s += Math.min((x.label || x.t).length, 80) / 80;
      return s;
    };
    return score(b) - score(a);
  })[0];

  if (priceIdx < 0 && qtyIdx < 0) return null;

  const rawName = named?.label || named?.t || "";
  if (/^(subtotal|neto|total:?|iva|i\.v\.a\.?|imp(?:uestos?)?\.?\s*internos|internos|perc(?:epci[oó]n(?:es)?)?|iibb|env[ií]o|flete)\b/i.test(rawName)) {
    return null;
  }
  const code = extractProductCode(`${rawName} ${joined}`, htmlBlob);
  if (!rawName && !code) return null;
  if (rawName && LINE_STATUS.test(rawName) && !code) return null;

  const name = rawName && !LINE_STATUS.test(rawName) ? rawName : (code ? `(${code})` : rawName);
  const price = priceIdx >= 0 ? texts[priceIdx] : undefined;
  const qty = qtyIdx >= 0 ? texts[qtyIdx] : undefined;
  let total: string | undefined;
  if (price && qty) {
    const p = parseInvidMoney(price);
    const q = Number(qty);
    if (p > 0 && Number.isFinite(q) && q > 0) total = formatUsMoney(p * q);
  }
  return { code, name, price, qty, total };
}

function pickLabeledMoney(text: string, re: RegExp): number | undefined {
  const m = text.match(re);
  if (!m) return undefined;
  const n = parseInvidMoney(m[1]);
  return n > 0 ? n : undefined;
}

function assignTotalLabel(label: string, value: string, totals: InvidOrderTotals) {
  if (!/\d/.test(value)) return;
  const n = parseInvidMoney(value);
  if (!Number.isFinite(n)) return;
  const l = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (!l) return;
  if (/^total\b/.test(l)) {
    totals.total = n;
    return;
  }
  if (/(subtotal|neto|mercader)/.test(l) && !/\biva\b|i\.v\.a/.test(l)) {
    totals.net = n;
    return;
  }
  if (/\biva\b|i\.v\.a/.test(l)) {
    if (/10\s*[.,]?\s*5/.test(l)) {
      totals.iva105 = n;
      return;
    }
    if (/\b21\b/.test(l)) {
      totals.iva21 = n;
      return;
    }
    totals.iva = n;
    return;
  }
  if (/interno/.test(l)) {
    totals.internos = n;
    return;
  }
  if (/perc|iibb/.test(l)) {
    totals.percepciones = n;
    return;
  }
  if (/env[ií]o|flete/.test(l)) {
    totals.shipping = n;
    return;
  }
}

function parseExchangeRateValue(raw: string): number | undefined {
  const n = parseInvidMoney(raw);
  if (!Number.isFinite(n) || n < 10 || n >= 100_000) return undefined;
  return n;
}

function parseOutlineTotals(html: string): { totals: InvidOrderTotals; exchangeRate?: number } {
  const totals: InvidOrderTotals = {};
  let exchangeRate: number | undefined;
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const texts = extractTdHtml(m[1]).map(stripTags).filter((t) => t.length > 0);
    if (texts.length === 0) continue;
    const joined = texts.join(" ");
    if (parseItemRow(extractTdHtml(m[1]))) continue;
    const label = texts[0];
    const value = texts.length >= 2 ? texts[texts.length - 1] : texts[0];
    assignTotalLabel(label, value, totals);
    assignTotalLabel(joined, value, totals);
    if (/cotizaci[oó]n|tipo\s+de\s+cambio|\btc\b/.test(joined.toLowerCase())) {
      const rate = parseExchangeRateValue(value) ?? parseExchangeRateValue(joined);
      if (rate) exchangeRate = rate;
    }
  }

  const text = stripTags(html);
  if (totals.iva == null && totals.iva105 == null && totals.iva21 == null) {
    totals.iva = pickLabeledMoney(text, /\bI\.?V\.?A\.?(?:\s*\(?\d+(?:[.,]\d+)?\s*%\)?)?\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (totals.internos == null) {
    totals.internos = pickLabeledMoney(text, /imp(?:uestos?)?\.?\s*internos\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (totals.percepciones == null) {
    totals.percepciones = pickLabeledMoney(text, /perc(?:epci[oó]n(?:es)?)?(?:\s*(?:iibb|IIBB))?\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (totals.shipping == null) {
    totals.shipping = pickLabeledMoney(text, /(?:env[ií]o|flete|costo de env[ií]o)\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (totals.net == null) {
    totals.net = pickLabeledMoney(text, /(?:subtotal|neto)\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (totals.total == null) {
    totals.total = pickLabeledMoney(text, /\btotal\s*[:.]?\s*(US\$\s*[\d.,]+)/i);
  }
  if (exchangeRate == null) {
    const rateMatch = text.match(/cotizaci[oó]n(?:\s*(?:del\s+d[oó]lar|usd)?)?\s*[:.]?\s*([\d.,]+)/i)
      ?? text.match(/tipo\s+de\s+cambio\s*[:.]?\s*([\d.,]+)/i);
    if (rateMatch) exchangeRate = parseExchangeRateValue(rateMatch[1]);
  }

  return { totals, exchangeRate };
}

function finalizeTotals(orderAmount: string, items: InvidOrderItem[], parsed: InvidOrderTotals): InvidOrderTotals | undefined {
  const totals: InvidOrderTotals = { ...parsed };
  const lineNet = round2(items.reduce((sum, it) => {
    const qty = Number(String(it.qty ?? "").replace(/[^\d]/g, ""));
    const price = parseInvidMoney(it.price);
    if (price > 0 && Number.isFinite(qty) && qty > 0) return sum + price * qty;
    return sum + parseInvidMoney(it.total);
  }, 0));
  if (totals.net == null && lineNet > 0) totals.net = lineNet;

  const total = (totals.total && totals.total > 0) ? totals.total : parseInvidMoney(orderAmount);
  if (total > 0) totals.total = total;

  const ivaSplit = (totals.iva105 ?? 0) + (totals.iva21 ?? 0);
  if (ivaSplit > 0) totals.iva = round2(ivaSplit);

  const iva = ivaSplit > 0 ? ivaSplit : (totals.iva ?? 0);
  const accounted = round2(
    (totals.net ?? 0)
    + iva
    + (totals.internos ?? 0)
    + (totals.percepciones ?? 0)
    + (totals.shipping ?? 0)
  );
  const hasSplit = totals.iva != null || totals.iva105 != null || totals.iva21 != null
    || totals.internos != null || totals.percepciones != null;
  if (totals.net != null && totals.total != null && totals.total - accounted > 0.05 && !hasSplit) {
    totals.taxes = round2(totals.total - accounted);
  }

  const hasBreakdown = totals.net != null || totals.iva != null || totals.iva105 != null || totals.iva21 != null
    || totals.internos != null
    || totals.percepciones != null || totals.shipping != null || totals.taxes != null;
  return hasBreakdown ? totals : undefined;
}

/** Completa TC (del HTML o el actual de Invid) y el equivalente en pesos. */
export function applyInvidOrderRates(orders: InvidOrderRow[], currentRate: number): InvidOrderRow[] {
  const live = Number.isFinite(currentRate) && currentRate > 0 ? currentRate : 0;
  return orders.map((order) => {
    const fromOrder = order.exchangeRate && order.exchangeRate > 0 ? order.exchangeRate : 0;
    const exchangeRate = fromOrder || live || undefined;
    const exchangeRateSource: InvidExchangeRateSource | undefined = fromOrder
      ? "order"
      : exchangeRate
        ? "current"
        : undefined;
    const usd = parseInvidMoney(order.amount);
    const amountArs = exchangeRate && usd > 0 ? round2(usd * exchangeRate) : undefined;
    return { ...order, exchangeRate, exchangeRateSource, amountArs };
  });
}

function extractTdHtml(trInner: string): string[] {
  const cells: string[] = [];
  const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = tdRe.exec(trInner))) cells.push(m[1]);
  return cells;
}

function extractAnchors(html: string): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]).trim();
    if (!href || /^(javascript:|#|mailto:)/i.test(href)) continue;
    links.push({ href, label: stripTags(m[2]) || href });
  }
  return links;
}

function extractPopupHref(html: string): string | undefined {
  const open = html.match(/window\.open\(\s*['"]([^'"]+)['"]/i)?.[1]
    ?? html.match(/\b(?:location|href)\s*=\s*['"]([^'"]+\.php[^'"]*)['"]/i)?.[1]
    ?? html.match(/data-(?:href|url|src)=['"]([^'"]+)['"]/i)?.[1]
    ?? extractAnchors(html).find((l) => /comprob|adjunt|pago/i.test(`${l.href} ${l.label}`))?.href;
  const href = open ? decodeEntities(open).trim() : "";
  if (!href || /^(javascript:|#|mailto:)/i.test(href)) return undefined;
  return href;
}

function collectNamedFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(block))) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "text").toLowerCase();
    if (["button", "submit", "image", "file"].includes(type)) continue;
    const name = attr(tag, "name");
    if (!name) continue;
    if (type === "radio") {
      if (/\bchecked\b/i.test(tag)) fields[name] = attr(tag, "value") ?? "";
      continue;
    }
    if (type === "checkbox" && !/\bchecked\b/i.test(tag)) continue;
    fields[name] = attr(tag, "value") ?? "";
  }
  const taRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  while ((m = taRe.exec(block))) {
    const name = attr(`<x ${m[1]}>`, "name");
    if (name && fields[name] == null) fields[name] = stripTags(m[2]);
  }
  return fields;
}

function formNotice(block: string): string | undefined {
  const alert = block.match(/<(?:div|p|span)[^>]*(?:alert|msgalerta|aviso|importante)[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);
  if (alert) {
    const text = stripTags(alert[1].replace(/<br\s*\/?>/gi, " "));
    if (text.length > 20) return text;
  }
  const important = block.match(/importante[:\s]*([\s\S]{40,800}?)(?:banco\s*\*|observaciones\s*\*|adjuntar|$)/i);
  if (important) {
    const text = stripTags(important[1].replace(/<br\s*\/?>/gi, " "));
    if (text.length > 20) return text;
  }
  return undefined;
}

function radioNames(block: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /<input\b[^>]*type=["']radio["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const name = attr(m[0], "name");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function textareaNames(block: string): { name: string; required: boolean }[] {
  const out: { name: string; required: boolean }[] = [];
  const re = /<textarea\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const name = attr(`<x ${m[1]}>`, "name");
    if (!name) continue;
    out.push({ name, required: /\brequired\b/i.test(m[1]) });
  }
  return out;
}

function fileFieldNames(block: string): string[] {
  const names: string[] = [];
  const re = /<input\b[^>]*type=["']file["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    names.push(attr(m[0], "name") || `file${names.length + 1}`);
  }
  return names;
}

/** Formulario real de «Comprobantes de Pago» del portal (banco, observaciones, archivos). */
export function parseInvidPaymentForm(html: string): InvidPaymentForm | null {
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let best: { score: number; attrs: string; body: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(html))) {
    const body = m[2];
    const files = fileFieldNames(body);
    if (files.length === 0) continue;
    let score = files.length;
    if (/comprob|pago|adjunt/i.test(body) || /comprob|pago|adjunt/i.test(m[1])) score += 4;
    if (/banco/i.test(body)) score += 3;
    if (/observ/i.test(body)) score += 3;
    if (!best || score > best.score) best = { score, attrs: m[1], body };
  }
  if (!best) return null;

  const fields = collectNamedFields(best.body);
  const files = fileFieldNames(best.body);
  const radios = radioNames(best.body);
  const bankField = radios.find((n) => /banco|bank/i.test(n)) ?? radios[0] ?? "banco";
  const banks = parseRadios(best.body, bankField);
  const tas = textareaNames(best.body);
  const notesField = tas.find((t) => /observ|nota|comment|mensaje/i.test(t.name))?.name
    ?? tas[0]?.name
    ?? "observaciones";
  const orderField = Object.keys(fields).find((n) =>
    /^(n_ped|nro_ped|n_pedido|nro_pedido|pedido|id_pedido|orden|n_orden|nro_orden)$/i.test(n)
  );
  const notice = formNotice(best.body);

  return {
    action: attr(`<form ${best.attrs}>`, "action") || "",
    method: (attr(`<form ${best.attrs}>`, "method") || "post").toLowerCase(),
    fields,
    banks: banks.length > 0
      ? banks.map((b) => ({ value: b.value, label: b.label }))
      : [
          { value: "Macro", label: "Macro" },
          { value: "Galicia", label: "Galicia" },
        ],
    bankField,
    notesField,
    fileFields: files.slice(0, 3),
    notice,
    orderField,
  };
}

function parseOutlineBlock(html: string): Pick<
  InvidOrderRow,
  "items" | "delivery" | "payment" | "links" | "totals" | "exchangeRate"
> {
  const items: InvidOrderItem[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const item = parseItemRow(extractTdHtml(m[1]));
    if (item) items.push(item);
  }
  const delivery = stripTags(html.match(/<b>\s*Forma de Entrega\s*<\/b>\s*([^<]+)/i)?.[1] ?? "") || undefined;
  const payment = stripTags(html.match(/<b>\s*Forma de Pago\s*<\/b>\s*([^<]+)/i)?.[1] ?? "") || undefined;
  const meta = parseOutlineTotals(html);
  return {
    items,
    delivery,
    payment,
    links: extractAnchors(html),
    totals: meta.totals,
    exchangeRate: meta.exchangeRate,
  };
}

export function parseOrdersTable(html: string): { orders: InvidOrderRow[] } {
  const orders: InvidOrderRow[] = [];
  const rowRe = /<tr\b([^>]*class="[^"]*CartProduct[^"]*"[^>]*)>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const trTag = m[1];
    if (/cartTableHeader/i.test(trTag) || /cartTableHeader/i.test(m[0])) continue;
    const cells = extractTdHtml(m[2]);
    if (cells.length === 0) continue;
    const firstIsChrome = /<img/i.test(cells[0]) || stripTags(cells[0]) === "";
    const data = (firstIsChrome ? cells.slice(1) : cells).map(stripTags);
    if (data.length < 4) continue;

    let orderNumber: string;
    let webOrderNumber = "";
    let status: string;
    let date: string;
    let amount: string;
    let invoice = "";
    let invoiceHrefs: string[] = [];
    if (data.length >= 6) {
      orderNumber = data[0];
      webOrderNumber = data[1];
      status = data[2];
      date = data[3];
      amount = data[4];
      invoice = data[5];
      invoiceHrefs = extractAnchors(cells[firstIsChrome ? 6 : 5] ?? "").map((l) => l.href);
    } else {
      orderNumber = data[0];
      status = data[1];
      date = data[2];
      amount = data[3];
    }

    const after = html.slice(m.index + m[0].length);
    const nextOrder = after.search(/<tr\b[^>]*class="[^"]*CartProduct/i);
    const outlineHtml = nextOrder >= 0 ? after.slice(0, nextOrder) : after.slice(0, 20_000);
    const outline = /id=["']menu\d+outline["']/i.test(outlineHtml)
      ? parseOutlineBlock(outlineHtml)
      : {
          items: [] as InvidOrderItem[],
          delivery: undefined,
          payment: undefined,
          links: [] as { href: string; label: string }[],
          totals: undefined as InvidOrderTotals | undefined,
          exchangeRate: undefined as number | undefined,
        };

    const invoiceCell = cells[firstIsChrome ? (data.length >= 6 ? 6 : 5) : (data.length >= 6 ? 5 : 4)] ?? "";
    const paymentHref = extractPopupHref(invoiceCell)
      || invoiceHrefs.find((h) => /comprob|adjunt|pago/i.test(h));
    const canAttachPayment = /adjuntar/i.test(invoice) || Boolean(paymentHref);

    orders.push({
      orderNumber,
      webOrderNumber,
      status,
      date,
      amount,
      invoice,
      invoiceHrefs,
      delivery: outline.delivery,
      payment: outline.payment,
      items: outline.items,
      links: outline.links,
      totals: finalizeTotals(amount, outline.items, outline.totals ?? {}),
      exchangeRate: outline.exchangeRate,
      canAttachPayment,
      paymentHref,
    });
  }
  return { orders };
}

export interface InvidAccountMovement {
  date: string;
  docType: string;
  docNumber: string;
  internalNumber: string;
  currency: string;
  total: string;
  hrefs: string[];
}

export function parseAccountStatement(html: string): {
  balance: number | null;
  movements: InvidAccountMovement[];
} {
  const balanceMatch = html.match(/Saldo de Cuenta Corriente:\s*\$?\s*(-?[\d,]+\.?\d*)/i);
  const balance = balanceMatch ? Number(balanceMatch[1].replace(/,/g, "")) : null;
  const movements: InvidAccountMovement[] = [];
  const rowRe = /<tr class="CartProduct"[^>]*>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const cells = extractTdHtml(m[1]);
    if (cells.length < 6) continue;
    const texts = cells.map(stripTags);
    if (texts.length < 6) continue;
    if (!/^[\d/-]+/.test(texts[0])) continue;
    movements.push({
      date: texts[0],
      docType: texts[1],
      docNumber: texts[2],
      internalNumber: texts[3],
      currency: texts[4],
      total: texts[5],
      hrefs: cells.flatMap((c) => extractAnchors(c).map((l) => l.href)),
    });
  }
  return { balance, movements };
}
