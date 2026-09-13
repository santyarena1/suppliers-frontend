import type { NewBytesComprobante } from "@/lib/api";

// Misma lógica que packages/shared/src/nb-cta-summary.ts (tests en la API).

const EPS = 0.005;

export type NbCtaSummary = {
  /** Facturas del período. */
  invoiced: number;
  /** Notas de crédito, en positivo: lo que descuenta. */
  credits: number;
  /** Percepciones incluidas en esos comprobantes. */
  perceptions: number;
  /** Facturado menos notas de crédito. */
  net: number;
  count: number;
};

/**
 * Una nota de crédito descuenta; todo lo demás suma.
 *
 * New Bytes nombra el tipo de comprobante de varias formas según el
 * comprobante ("NOTA DE CREDITO", "NC A-0005", "N/C"), así que se reconoce por
 * el texto y no por un código fijo. El total del portal ya viene con el signo
 * que corresponde en algunos casos, por eso se toma el valor absoluto y el
 * signo lo decide el tipo.
 */
function isCreditNote(row: NewBytesComprobante): boolean {
  const texto = `${row.invoiceType ?? ""} ${row.invoiceLabel ?? ""}`.toUpperCase();
  return /NOTA\s*DE\s*CR|(^|[^A-Z])N\s*\/?\s*C([^A-Z]|$)|CREDITO/.test(texto);
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resumen del período de la cuenta corriente.
 *
 * La pantalla mostraba el saldo y un total del período, sin separar lo
 * facturado de lo acreditado ni decir cuánto de eso son percepciones — que es
 * justo el número que se busca cuando se revisa la cuenta.
 */
export function nbCtaSummary(rows: NewBytesComprobante[]): NbCtaSummary | null {
  if (!rows.length) return null;
  let invoiced = 0;
  let credits = 0;
  let perceptions = 0;
  for (const row of rows) {
    const total = Math.abs(num(row.totalUsd));
    if (isCreditNote(row)) credits += total;
    else invoiced += total;
    perceptions += Math.abs(num(row.perceptions));
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    invoiced: round(invoiced),
    credits: round(credits),
    perceptions: round(perceptions),
    net: round(invoiced - credits),
    count: rows.length,
  };
}

/** Las tarjetas que vale la pena mostrar: sin notas de crédito ni percepciones, no se ocupa lugar. */
export function nbCtaSummaryCards(
  summary: NbCtaSummary
): { label: string; hint: string; value: number }[] {
  const cards = [
    { label: "Facturado", hint: "Facturas del período", value: summary.invoiced },
    { label: "Notas de crédito", hint: "Lo que te acreditaron", value: summary.credits },
    { label: "Percepciones", hint: "Incluidas en esos comprobantes", value: summary.perceptions },
    { label: "Neto del período", hint: "Facturado menos créditos", value: summary.net },
  ];
  return cards.filter((c, i) => i === 0 || i === 3 || Math.abs(c.value) > EPS);
}
