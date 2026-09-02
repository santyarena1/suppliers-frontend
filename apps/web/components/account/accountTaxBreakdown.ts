import type { AccountDetailLine } from "@/components/account/AccountRowDetail";
import { formatAccountSum, parseAccountAmount } from "@/lib/account-history";

const EPS = 0.005;

export type IvaBucket = "105" | "21" | "other";

export type TaxBreakdownInput = {
  net?: number | null;
  iva105?: number | null;
  iva21?: number | null;
  ivaOther?: number | null;
  perceptions?: number | null;
  perceptionLabel?: string | null;
  internalTaxes?: number | null;
  shipping?: number | null;
  total?: number | null;
  currency?: string | null;
};

export type IvaAcc = { iva105: number; iva21: number; ivaOther: number };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyIvaAcc(): IvaAcc {
  return { iva105: 0, iva21: 0, ivaOther: 0 };
}

function asNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" || v == null) return parseAccountAmount(v) ?? 0;
  return 0;
}

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function points(raw: number): number {
  if (raw > 0 && raw <= 1) return raw * 100;
  return raw;
}

/** Clasifica un monto de IVA. No inventa alícuota: si no calza 10,5 ni 21, va a other. */
export function ivaBucket(net: number, vat: number, vatPercent?: number | null): IvaBucket {
  if (vatPercent != null && Number.isFinite(vatPercent) && vatPercent !== 0) {
    const p = points(vatPercent);
    if (Math.abs(p - 10.5) <= 0.6) return "105";
    if (Math.abs(p - 21) <= 1.2) return "21";
  }
  if (net > EPS && vat > EPS) {
    const r = vat / net;
    if (Math.abs(r - 0.105) <= 0.02) return "105";
    if (Math.abs(r - 0.21) <= 0.03) return "21";
  }
  return "other";
}

export function addIva(acc: IvaAcc, net: number, vat: number, vatPercent?: number | null): void {
  if (!(vat > EPS)) return;
  const b = ivaBucket(net, vat, vatPercent);
  if (b === "105") acc.iva105 += vat;
  else if (b === "21") acc.iva21 += vat;
  else acc.ivaOther += vat;
}

export function splitLumpVat(net: number, vat: number): IvaAcc {
  const acc = emptyIvaAcc();
  addIva(acc, net, vat);
  return acc;
}

function money(n: number, currency?: string | null): string {
  const code = currency === "ARS" || currency === "USD" ? currency : undefined;
  return formatAccountSum(round2(n), code);
}

/**
 * Siempre las 4 líneas pedidas (aunque den 0,00).
 * Extra: IVA sin discriminar, internos, envío y total si hay dato.
 */
export function taxBreakdownLines(input: TaxBreakdownInput): AccountDetailLine[] {
  const cur = input.currency;
  const percLabel = input.perceptionLabel?.trim() || "IIBB / percepciones";
  const lines: AccountDetailLine[] = [
    { label: "Total sin imp.", value: money(input.net ?? 0, cur) },
    { label: percLabel, value: money(input.perceptions ?? 0, cur) },
    { label: "IVA 10,5%", value: money(input.iva105 ?? 0, cur) },
    { label: "IVA 21%", value: money(input.iva21 ?? 0, cur) },
  ];
  if ((input.ivaOther ?? 0) > EPS) {
    lines.push({ label: "IVA (sin discriminar)", value: money(input.ivaOther ?? 0, cur) });
  }
  if (input.internalTaxes != null && Number.isFinite(input.internalTaxes) && input.internalTaxes > EPS) {
    lines.push({ label: "Imp. internos", value: money(input.internalTaxes, cur) });
  }
  if (input.shipping != null && Number.isFinite(input.shipping) && input.shipping > EPS) {
    lines.push({ label: "Envío", value: money(input.shipping, cur) });
  }
  if (input.total != null && Number.isFinite(input.total)) {
    lines.push({ label: "Total", value: money(input.total, cur) });
  }
  return lines;
}

/**
 * `raw` puede ser IVA unitario (Elit NV) o de línea (Invid/Air).
 * Si al multiplicar por qty deja de parecer 10,5/21, ya era de línea.
 */
export function lineVatAmount(raw: number, qty: number, lineNet: number): number {
  if (!(raw > EPS)) return 0;
  if (!(qty > 1)) return raw;
  const asLine = raw;
  const asUnit = raw * qty;
  const rLine = lineNet > EPS ? asLine / lineNet : 0;
  const rUnit = lineNet > EPS ? asUnit / lineNet : 0;
  const fits = (r: number) => Math.abs(r - 0.21) <= 0.03 || Math.abs(r - 0.105) <= 0.02;
  if (fits(rLine) && !fits(rUnit)) return asLine;
  if (fits(rUnit) && !fits(rLine)) return asUnit;
  if (asUnit > lineNet) return asLine;
  return asUnit;
}

export function mergeSplit(preferred: IvaAcc, fallbackNet: number, fallbackVat?: number | null): IvaAcc {
  const got = preferred.iva105 + preferred.iva21 + preferred.ivaOther;
  if (got > EPS) return preferred;
  if (fallbackVat != null && fallbackVat > EPS) return splitLumpVat(fallbackNet, fallbackVat);
  return emptyIvaAcc();
}

type DraftLike = {
  subtotal?: number | null;
  impuestos?: number | null;
  percepciones?: number | null;
  total?: string | number | null;
  items?: unknown[] | null;
  addressSnapshot?: unknown;
};

function taxFromGnTaxes(
  net: number,
  taxes: unknown,
): { vat: number; vatPercent: number | null; intern: number; perc: number } {
  const list = Array.isArray(taxes) ? taxes : [];
  let vat = 0;
  let intern = 0;
  let perc = 0;
  let vatPercent: number | null = null;
  for (const raw of list) {
    const t = asRec(raw);
    if (!t) continue;
    const desc = fold(String(t.desc ?? t.imp_desc ?? ""));
    const pct = asNum(t.percent ?? t.imp_porcentaje);
    const amt = net * (points(pct) / 100);
    if (/iva|i\.v\.a/.test(desc)) {
      vat += amt;
      vatPercent = pct;
    } else if (/interno/.test(desc)) intern += amt;
    else if (/iibb|perc|bruto/.test(desc)) perc += amt;
  }
  return { vat, vatPercent, intern, perc };
}

function taxFromItems(items: unknown[]): {
  net: number;
  perc: number;
  intern: number;
  acc: IvaAcc;
} {
  const acc = emptyIvaAcc();
  let net = 0;
  let perc = 0;
  let intern = 0;
  for (const raw of items) {
    const it = asRec(raw) ?? {};
    const qty = asNum(it.qty) || asNum(it.quantity) || 1;
    const unitNet = asNum(it.net) || asNum(it.price) || asNum(it.priceUsd) || asNum(it.precio);
    const lineNet = asNum(it.subtotal) || unitNet * qty;
    net += lineNet;

    const vatPercentRaw = it.ivaPercent ?? it.iva_percent;
    const vatPercent = vatPercentRaw != null && asNum(vatPercentRaw) > 0 ? asNum(vatPercentRaw) : null;

    let lineVat = 0;
    if (it.vat != null) {
      lineVat = lineVatAmount(asNum(it.vat), qty, lineNet);
    } else if (it.iva != null) {
      lineVat = lineVatAmount(asNum(it.iva), qty, lineNet);
    } else if (vatPercent != null) {
      lineVat = lineNet * (points(vatPercent) / 100);
    }

    if (Array.isArray(it.taxes) && it.taxes.length > 0) {
      const g = taxFromGnTaxes(lineNet, it.taxes);
      lineVat = g.vat;
      intern += g.intern;
      perc += g.perc;
      addIva(acc, lineNet, lineVat, g.vatPercent);
    } else {
      addIva(acc, lineNet, lineVat, vatPercent);
      perc += asNum(it.percepciones ?? it.percepcion ?? it.perceptions);
      intern += asNum(it.internos ?? it.internalTax ?? it.internosAmount);
    }
  }
  return { net, perc, intern, acc };
}

/** Totales de un pedido armado desde Nodo (Elit / Invid / NB / Air / GN). */
export function taxFromDraft(d: DraftLike): TaxBreakdownInput {
  const snap = asRec(d.addressSnapshot) ?? {};
  const items = Array.isArray(d.items) ? d.items : [];
  const fromItems = taxFromItems(items);

  const snapIva105 = asNum(snap.iva105);
  const snapIva21 = asNum(snap.iva21);
  const snapVat = asNum(snap.vat ?? snap.iva);
  const snapPerc = asNum(snap.perceptions ?? snap.percepciones);
  const snapIntern = asNum(snap.internalTax ?? snap.ii ?? snap.internos);
  const snapNet = asNum(snap.subtotal ?? snap.net);
  const snapTotal = asNum(snap.total);

  const net = asNum(d.subtotal) || snapNet || fromItems.net;
  const perc = asNum(d.percepciones) || snapPerc || fromItems.perc;
  const intern = snapIntern || fromItems.intern;
  const total = asNum(d.total) || snapTotal || null;

  if (snapIva105 > EPS || snapIva21 > EPS) {
    return {
      net,
      iva105: snapIva105,
      iva21: snapIva21,
      perceptions: perc,
      internalTaxes: intern,
      total,
      currency: "USD",
    };
  }

  const acc = mergeSplit(fromItems.acc, net, snapVat > EPS ? snapVat : null);
  const got = acc.iva105 + acc.iva21 + acc.ivaOther;
  if (got <= EPS && asNum(d.impuestos) > EPS && intern <= EPS && perc <= EPS) {
    Object.assign(acc, splitLumpVat(net, asNum(d.impuestos)));
  } else if (got <= EPS && snapVat > EPS) {
    Object.assign(acc, splitLumpVat(net, snapVat));
  }

  return {
    net,
    ...acc,
    perceptions: perc,
    internalTaxes: intern,
    total,
    currency: "USD",
  };
}

function labelLooks(key: string, re: RegExp): boolean {
  return re.test(fold(key));
}

/** Extrae el desglose de una fila HTML (Air) o de un objeto con columnas sueltas. */
export function taxFromLabeledRecord(row: Record<string, unknown>): TaxBreakdownInput | null {
  let net: number | null = null;
  let iva105: number | null = null;
  let iva21: number | null = null;
  let ivaOther = 0;
  let perc: number | null = null;
  let intern: number | null = null;
  let total: number | null = null;
  let hit = false;

  for (const [key, raw] of Object.entries(row)) {
    if (key.startsWith("_")) continue;
    const n = parseAccountAmount(raw as string | number | null | undefined);
    if (n == null) continue;
    if (labelLooks(key, /iva/) && labelLooks(key, /10\s*[.,]?\s*5/)) {
      iva105 = n;
      hit = true;
    } else if (labelLooks(key, /iva/) && labelLooks(key, /\b21\b/)) {
      iva21 = n;
      hit = true;
    } else if (labelLooks(key, /\biva\b|i\.v\.a/)) {
      ivaOther += n;
      hit = true;
    } else if (labelLooks(key, /iibb|perc/)) {
      perc = n;
      hit = true;
    } else if (labelLooks(key, /interno/)) {
      intern = n;
      hit = true;
    } else if (labelLooks(key, /neto|subtotal|sin\s*imp/)) {
      net = n;
      hit = true;
    } else if (labelLooks(key, /^total$|^importe$/)) {
      total = n;
    }
  }

  if (!hit) return null;
  const acc = emptyIvaAcc();
  if (iva105 != null) acc.iva105 = iva105;
  if (iva21 != null) acc.iva21 = iva21;
  if (ivaOther > EPS && iva105 == null && iva21 == null) {
    Object.assign(acc, splitLumpVat(net ?? 0, ivaOther));
  } else if (ivaOther > EPS) {
    acc.ivaOther = ivaOther;
  }
  return {
    net: net ?? 0,
    ...acc,
    perceptions: perc ?? 0,
    internalTaxes: intern,
    total,
    currency: "USD",
  };
}
