import { isArsCurrency } from "@/lib/fx";
import type { Quote, QuoteSettings } from "@/lib/quotes";
import { quoteAmounts, quoteCode, shortDate, shownAmount } from "@/lib/quotes";

/**
 * Lo que dibuja el PDF, ya calculado y en texto: el documento no hace cuentas
 * ni conoce monedas. Así la vista previa de la plantilla y el PDF real salen
 * de lo mismo.
 */
export interface QuotePdfModel {
  theme: QuoteSettings["theme"];
  accent: string;
  font: QuoteSettings["font"];
  /** data: URL (JPEG/PNG) o null. */
  logo: string | null;
  business: {
    name: string;
    lines: string[];
  };
  code: string;
  /** Nombre de referencia del presupuesto, si tiene. */
  title: string | null;
  /** "8 productos · 11 unidades". */
  summary: string;
  /** Total final ya formateado (va también arriba, en el resumen). */
  grandTotal: string;
  date: string;
  validUntil: string | null;
  client: { name: string | null; lines: string[] };
  intro: string | null;
  showImages: boolean;
  netPrices: boolean;
  lines: {
    name: string;
    detail: string | null;
    qty: number;
    unit: string;
    total: string;
    /** data: URL o null. */
    image: string | null;
    /** Clave para buscar la foto (url original). */
    imageSrc: string | null;
  }[];
  totals: { label: string; value: string; strong?: boolean; muted?: boolean }[];
  /** Aclaración de moneda y cotización, si hubo que convertir. */
  currencyNote: string | null;
  notes: string | null;
  terms: string | null;
  footer: string | null;
}

type Convert = (amount: number | null, source: string) => number | null;

/** Arma el modelo del PDF. Devuelve `error` si falta la cotización para convertir. */
export function buildQuotePdfModel(
  quote: Quote,
  settings: QuoteSettings,
  money: { currency: "ARS" | "USD"; rate: number | null; convert: Convert; format: (n: number | null) => string }
): { model: QuotePdfModel } | { error: string } {
  const net = settings.priceDisplay === "NET";
  const amounts = quoteAmounts(quote.items, quote.discountPercent, money.currency, money.convert);
  if (amounts.missingRate) return { error: "Falta la cotización del dólar para pasar los precios. Probá en un momento." };
  const { subtotalFinal, subtotalNet, discount, total } = amounts;
  const converted = quote.items.some((it) => isArsCurrency(it.currency) !== (money.currency === "ARS"));
  const lines: QuotePdfModel["lines"] = quote.items.map((it, i) => {
    const line = amounts.lines[i];
    const detail = [settings.showBrand ? it.brand : null, settings.showSku ? it.sku : null].filter(Boolean).join(" · ");
    return {
      name: it.name,
      detail: detail || null,
      qty: it.qty,
      unit: line == null ? "Consultar" : money.format(net ? line.unitNet : line.unitFinal),
      total: line == null ? "—" : money.format(net ? line.totalNet : line.totalFinal),
      image: null,
      imageSrc: settings.showImages && it.kind === "product" ? it.imageUrl : null,
    };
  });
  const pct = quote.discountPercent ? `${quote.discountPercent.toLocaleString("es-AR")} %` : "";

  const totals: QuotePdfModel["totals"] = [];
  if (net) {
    totals.push({ label: "Subtotal sin IVA", value: money.format(subtotalNet) });
    totals.push({ label: "IVA", value: money.format(shownAmount(subtotalFinal - subtotalNet, money.currency)), muted: true });
  } else if (discount > 0) {
    totals.push({ label: "Subtotal", value: money.format(subtotalFinal) });
  }
  // Guion común: el "−" tipográfico no existe en las letras del PDF y se perdía.
  if (discount > 0) totals.push({ label: `Descuento ${pct}`, value: `- ${money.format(discount)}` });
  totals.push({ label: net ? "Total con IVA" : "Total · IVA incluido", value: money.format(total), strong: true });

  const rateText = money.rate ? money.rate.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : null;
  const currencyNote = converted && rateText
    ? `Importes en ${money.currency === "ARS" ? "pesos" : "dólares"} calculados con dólar a $ ${rateText} del ${shortDate(new Date().toISOString())}.`
    : money.currency === "USD"
      ? "Importes en dólares estadounidenses."
      : null;

  const business = settings.businessName?.trim() || "";
  const contact = [settings.address, [settings.phone, settings.email].filter(Boolean).join(" · "), settings.website].filter(
    (s): s is string => Boolean(s && s.trim())
  );
  if (settings.taxId) contact.unshift(`CUIT ${settings.taxId}`);

  return {
    model: {
      theme: settings.theme,
      accent: settings.accentColor,
      font: settings.font,
      logo: null,
      business: { name: business, lines: contact },
      code: quoteCode(settings.numberPrefix, quote.number),
      title: quote.title?.trim() || null,
      summary: itemSummary(quote.items),
      grandTotal: money.format(total),
      date: shortDate(quote.createdAt),
      validUntil: quote.validUntil ? shortDate(quote.validUntil) : null,
      client: {
        name: quote.clientName,
        lines: [quote.clientPhone, quote.clientEmail].filter((s): s is string => Boolean(s)),
      },
      intro: settings.intro,
      showImages: settings.showImages && lines.some((l) => l.imageSrc),
      netPrices: net,
      lines,
      totals,
      currencyNote,
      notes: quote.notes,
      terms: quote.terms ?? settings.terms,
      footer: settings.footer,
    },
  };
}

function itemSummary(items: Quote["items"]): string {
  const units = items.reduce((s, it) => s + it.qty, 0);
  const lines = items.length;
  return `${lines} ${lines === 1 ? "producto" : "productos"} · ${units} ${units === 1 ? "unidad" : "unidades"}`;
}

/** Nombre del archivo: "Presupuesto P-0012 - Oficina Perez.pdf" (nombre de referencia o cliente, sin caracteres raros). */
export function quotePdfFilename(model: Pick<QuotePdfModel, "code" | "client" | "title">): string {
  const client = (model.title || model.client.name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return `Presupuesto ${model.code}${client ? ` - ${client}` : ""}.pdf`;
}
