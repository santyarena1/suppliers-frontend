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

function parseOutlineBlock(html: string): Pick<InvidOrderRow, "items" | "delivery" | "payment" | "links"> {
  const items: InvidOrderItem[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const texts = extractTdHtml(m[1]).map(stripTags);
    if (texts.length < 3) continue;
    const joined = texts.join(" ");
    if (/calificaci[oó]n/i.test(joined) && /producto/i.test(joined)) continue;
    if (/cargar a pedido/i.test(joined)) continue;
    if (/^total:/i.test(joined) || texts.some((t) => /^total:/i.test(t))) continue;
    const name = texts.length >= 4 ? texts[1] : texts[0];
    if (!name || /forma de (entrega|pago)/i.test(name)) continue;
    const price = texts.length >= 4 ? texts[2] : texts[1];
    const qty = texts.length >= 4 ? texts[3] : texts[2];
    if (!/\d/.test(price || "") && !/\d/.test(qty || "")) continue;
    const code = name.match(/\((\d{4,})\)/)?.[1];
    items.push({ code, name, price, qty });
  }
  const delivery = stripTags(html.match(/<b>\s*Forma de Entrega\s*<\/b>\s*([^<]+)/i)?.[1] ?? "") || undefined;
  const payment = stripTags(html.match(/<b>\s*Forma de Pago\s*<\/b>\s*([^<]+)/i)?.[1] ?? "") || undefined;
  return { items, delivery, payment, links: extractAnchors(html) };
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
      : { items: [] as InvidOrderItem[], delivery: undefined, payment: undefined, links: [] as { href: string; label: string }[] };

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
