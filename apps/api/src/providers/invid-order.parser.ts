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
  const web = html.match(/pedido\s*web[^0-9]{0,40}(\d{3,})/i);
  const orden = html.match(/(?:n[úu]mero\s*(?:de\s*)?)?orden[^0-9]{0,40}(\d{3,})/i)
    ?? html.match(/nro\.?\s*(?:de\s*)?pedido[^0-9]{0,40}(\d{3,})/i);
  const errorBlock = html.match(/class="[^"]*(?:error|msgalerta|alert-danger|stockerror)[^"]*"[^>]*>([^<]{5,200})/i);
  const stillOnCart = /id=["']iniciarpago["']/i.test(html) && /name=["']opcionPago["']/i.test(html);
  const thanks = /gracias|pedido\s+(?:generado|registrado|confirmado|recibido)|pendiente\s+de\s+procesamiento|n[úu]mero\s+de\s+pedido/i.test(html);

  const errorMessage = errorBlock ? stripTags(errorBlock[1]) : undefined;
  const looksLikeError = Boolean(errorMessage) && /error|no se pudo|inv[aá]lid|rechaz/i.test(errorMessage ?? "");

  return {
    appearsSuccessful: Boolean((web || orden || thanks) && !looksLikeError && !stillOnCart)
      || Boolean((web || orden) && !looksLikeError),
    orderNumber: orden?.[1],
    webOrderNumber: web?.[1],
    errorMessage: looksLikeError ? errorMessage : stillOnCart && !web && !orden
      ? "Invid devolvió el carrito sin confirmar el pedido"
      : undefined,
  };
}

export function parseOrdersTable(html: string) {
  const rows: { orderNumber: string; webOrderNumber: string; status: string; date: string; amount: string; invoice: string }[] = [];
  const rowRe =
    /<tr class="CartProduct"[^>]*>\s*<td>.*?<\/td>\s*<td class="valorizar">\s*(\d+)\s*<\/td>\s*<td class="valorizar">\s*(\d+)\s*<\/td>\s*<td class="text-center">\s*([^<]+?)\s*<\/td>\s*<td class="text-center">\s*([\d-]+)\s*<\/td>\s*<td[^>]*class="text-right"[^>]*>\s*([^<]+?)\s*<\/td>\s*<td>\s*([^<]*?)\s*<\/td>\s*<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    rows.push({
      orderNumber: m[1],
      webOrderNumber: m[2],
      status: decodeEntities(m[3].trim()),
      date: m[4].trim(),
      amount: decodeEntities(m[5].trim()),
      invoice: decodeEntities(m[6].trim()),
    });
  }
  return { orders: rows };
}
