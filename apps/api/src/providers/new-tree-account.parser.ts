import { decodeEntities, stripTags } from "./html-table";

export interface NewTreeBalance {
  currency: string;
  /** Deuda total (vencida + a vencer) menos créditos. */
  total: number | null;
  overdue: number | null;
  toExpire: number | null;
}

export interface NewTreeMovement {
  date: string;
  /** "Fc A", "Rc A", "NC A"… */
  form: string;
  number: string;
  voucher: string;
  dueDate: string;
  currency: string | null;
  debit: number | null;
  credit: number | null;
  /** Query string cifrada de wfmPrintMyDocument.aspx, solo si el portal ofrece la descarga. */
  documentToken: string | null;
}

export interface NewTreePortalOrder {
  id: string;
  date: string;
  status: string;
  origin: string;
  currency: string | null;
  amount: number | null;
  detailUrl: string | null;
}

/**
 * Números del portal: la cuenta corriente usa punto decimal ("549913.98"), los
 * saldos del script usan coma ("10649,81"). El último separador seguido de 1–2
 * dígitos es el decimal; el resto son miles.
 */
export function parsePortalNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;
  const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  let normalized: string;
  if (lastSep >= 0 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) {
    normalized = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + s.slice(lastSep + 1);
  } else {
    normalized = s.replace(/[.,]/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function currencyOf(text: string): string | null {
  const m = text.match(/\b(ARS|USD|U\$S)\b/i);
  if (!m) return text.includes("$") ? "ARS" : null;
  return m[1].toUpperCase() === "U$S" ? "USD" : m[1].toUpperCase();
}

/** Saldos: el portal los calcula en el script de la página a partir de cuatro totales. */
export function parseAccountBalances(html: string): NewTreeBalance {
  const read = (name: string) => {
    const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*'([^']*)'`));
    return m ? parsePortalNumber(m[1]) : null;
  };
  const debitOverdue = read("totaldeuven");
  const debitToExpire = read("totaldeuaven");
  const creditOverdue = read("totalacreven");
  const creditToExpire = read("totalacreaven");
  const cur = html.match(/monedasaldototal["']\)\[0\]\.innerHTML\s*=\s*'([^']*)'/);
  const currency = (cur ? cur[1] : "USD").trim() || "USD";
  const has = [debitOverdue, debitToExpire, creditOverdue, creditToExpire].some((v) => v != null);
  if (!has) return { currency, total: null, overdue: null, toExpire: null };
  const round = (n: number) => Math.round(n * 100) / 100;
  const overdue = round((debitOverdue ?? 0) - (creditOverdue ?? 0));
  const toExpire = round((debitToExpire ?? 0) - (creditToExpire ?? 0));
  return { currency, total: round(overdue + toExpire), overdue, toExpire };
}

function tableBlock(html: string, classHint: RegExp): string | null {
  const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (classHint.test(m[1]) || classHint.test(m[2].slice(0, 600))) return m[2];
  }
  return null;
}

function rowsOf(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const cells = [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]);
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const CELL_LABEL = /^(Fecha|Comprobante|Vencimiento|Imp\.?\s*Deudor|Imp\.?\s*Acreedor|Id|Estado|Origen|Monto)\s*:\s*/i;

function cellText(cell: string): string {
  return stripTags(cell).replace(CELL_LABEL, "").trim();
}

/** Movimientos de la página CUENTACORRIENTE/FECHAI=…/FECHAF=… */
export function parseAccountMovements(html: string): NewTreeMovement[] {
  const table = tableBlock(html, /tablalistadocc|Numero de Comprobante/i);
  if (!table) return [];
  const out: NewTreeMovement[] = [];
  for (const cells of rowsOf(table)) {
    if (cells.length < 5) continue;
    const date = cellText(cells[0]);
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) && !/^\d{2}[-/]\d{2}[-/]\d{4}/.test(date)) continue;
    const voucher = cellText(cells[1]);
    const formMatch = voucher.match(/^([A-Za-z]{1,3}\s+[A-Za-z])\s+(.+)$/);
    const debitText = cellText(cells[3]);
    const creditText = cellText(cells[4]);
    const lastCell = cells[cells.length - 1];
    const tokenMatch = lastCell.match(/wfmPrintMyDocument\.aspx\?([^'"]+)/i);
    const hidden = /display\s*:\s*none/i.test(lastCell);
    out.push({
      date,
      form: formMatch ? formMatch[1] : voucher.split(" ").slice(0, 2).join(" "),
      number: formMatch ? formMatch[2] : voucher,
      voucher,
      dueDate: cellText(cells[2]),
      currency: currencyOf(debitText) ?? currencyOf(creditText),
      debit: parsePortalNumber(debitText),
      credit: parsePortalNumber(creditText),
      documentToken: tokenMatch && !hidden ? decodeEntities(tokenMatch[1]) : null,
    });
  }
  return out;
}

/** Pedidos web de la página MISPEDIDOS/FECHAI=…/FECHAF=… (Id | Fecha | Estado | Origen | Monto | Ver). */
export function parsePortalOrders(html: string): NewTreePortalOrder[] {
  const table = tableBlock(html, /Origen|Estado/i);
  if (!table) return [];
  const out: NewTreePortalOrder[] = [];
  for (const cells of rowsOf(table)) {
    if (cells.length < 5) continue;
    const id = cellText(cells[0]);
    if (!id || /^id$/i.test(id)) continue;
    const amountText = cellText(cells[4]);
    const link = cells[cells.length - 1].match(/href=["']([^"']+)["']/i)?.[1] ?? cells[cells.length - 1].match(/'(https?:[^']+)'/)?.[1];
    out.push({
      id,
      date: cellText(cells[1]),
      status: cellText(cells[2]),
      origin: cellText(cells[3]),
      currency: currencyOf(amountText),
      amount: parsePortalNumber(amountText),
      detailUrl: link ? decodeEntities(link) : null,
    });
  }
  return out;
}

/** "Fc", "NC", "ND" son comprobantes fiscales; "Rc" es recibo. */
export function isInvoiceForm(form: string): boolean {
  return /^(fc|nc|nd|fac|fa)\b/i.test(form.trim());
}
