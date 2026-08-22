import { parsePrice } from "./format";

export type TaxKind = "iva" | "internos" | "iibb" | "other";

export type TaxLine = {
  kind: TaxKind;
  label: string;
  /** Alícuota en puntos (21 = 21%). `null` si el proveedor mandó un monto fijo. */
  percent: number | null;
  /** Monto unitario, misma moneda que el precio de lista (USD). */
  unitAmount: number;
};

export type TaxableProduct = {
  price?: string | number | null;
  finalPrice?: string | number | null;
  ivaPercent?: string | number | null;
  taxes?: TaxLine[] | null;
  raw?: unknown;
};

export const TAX_KIND_LABEL: Record<TaxKind, string> = {
  iva: "IVA",
  internos: "Imp. internos",
  iibb: "IIBB",
  other: "Otros",
};

export const TAX_KINDS: TaxKind[] = ["iva", "internos", "iibb"];

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number"
    ? v
    : Number(String(v).replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Cada proveedor manda su alícuota (21, 10.5, 0, a veces 0.21).
 * `null` = el producto no trajo dato; no es lo mismo que 0%.
 */
export function taxRateFromPercent(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number"
    ? raw
    : Number(String(raw).replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 0;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  return null;
}

function amountFromRate(net: number, pctOrAmount: number): { percent: number | null; amount: number } {
  if (pctOrAmount === 0) return { percent: 0, amount: 0 };
  if (pctOrAmount > 0 && pctOrAmount <= 1) {
    return { percent: round4(pctOrAmount * 100), amount: round4(net * pctOrAmount) };
  }
  if (pctOrAmount > 1 && pctOrAmount <= 100) {
    return { percent: pctOrAmount, amount: round4(net * (pctOrAmount / 100)) };
  }
  return {
    percent: net > 0 ? round4((pctOrAmount / net) * 100) : null,
    amount: round4(pctOrAmount),
  };
}

function foldAccents(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function classifyTaxKind(desc: string): TaxKind {
  const d = foldAccents(desc);
  if (/iibb|i\.i\.b\.b|ingresos\s*brutos/.test(d)) return "iibb";
  if (/interno/.test(d)) return "internos";
  if (/iva|i\.v\.a/.test(d)) return "iva";
  if (/perc/.test(d)) return "iibb";
  return "other";
}

function labelFor(kind: TaxKind, original?: string) {
  if (kind === "other" && original?.trim()) return original.trim();
  return TAX_KIND_LABEL[kind];
}

function fromGnImpuestos(impuestos: unknown, net: number): TaxLine[] | null {
  if (!Array.isArray(impuestos) || impuestos.length === 0) return null;
  const lines: TaxLine[] = [];
  for (const item of impuestos) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const desc = String(o.imp_desc ?? o.descripcion ?? o.nombre ?? o.name ?? "");
    const pct = asNum(o.imp_porcentaje ?? o.porcentaje ?? o.alicuota ?? o.iva);
    if (pct == null) continue;
    const kind = classifyTaxKind(desc || "IVA");
    const t = amountFromRate(net, pct);
    lines.push({ kind, label: labelFor(kind, desc), percent: t.percent, unitAmount: t.amount });
  }
  return lines.length ? lines : null;
}

function fromInvidRow(row: unknown[], net: number): TaxLine[] | null {
  if (row.length < 9) return null;
  const iva = asNum(row[7]);
  const internos = asNum(row[8]);
  if (iva == null && internos == null) return null;
  const lines: TaxLine[] = [];
  if (iva != null) {
    const t = amountFromRate(net, iva);
    lines.push({ kind: "iva", label: "IVA", percent: t.percent, unitAmount: t.amount });
  }
  if (internos != null && internos !== 0) {
    const t = amountFromRate(net, internos);
    lines.push({ kind: "internos", label: "Imp. internos", percent: t.percent, unitAmount: t.amount });
  }
  return lines.length ? lines : null;
}

function fromNamedRaw(raw: Record<string, unknown>, net: number): TaxLine[] | null {
  const gn = fromGnImpuestos(raw.impuestos, net);
  if (gn) return gn;

  const ivaField = asNum(raw.IVA ?? raw.iva ?? raw.IVA_PORCENTAJE);
  if (ivaField == null) return null;
  const t = amountFromRate(net, ivaField);
  const lines: TaxLine[] = [{ kind: "iva", label: "IVA", percent: t.percent, unitAmount: t.amount }];
  const listed = asNum(raw["PRECIO FINAL"] ?? raw.precioFinal ?? raw.precio_final);
  if (listed != null && net > 0) {
    const leftover = round4(listed - net - t.amount);
    if (leftover > 0.005) {
      lines.push({
        kind: "internos",
        label: "Imp. internos",
        percent: round4((leftover / net) * 100),
        unitAmount: leftover,
      });
    }
  }
  return lines;
}

function fallbackLines(p: TaxableProduct, net: number): TaxLine[] {
  const ivaPct = taxRateFromPercent(p.ivaPercent);
  const listedGross = parsePrice(p.finalPrice);
  const lines: TaxLine[] = [];

  if (ivaPct != null) {
    lines.push({
      kind: "iva",
      label: "IVA",
      percent: round4(ivaPct * 100),
      unitAmount: round4(net * ivaPct),
    });
  }

  if (listedGross > 0 && net > 0) {
    const accounted = net + lines.reduce((s, l) => s + l.unitAmount, 0);
    const leftover = round4(listedGross - accounted);
    if (leftover > 0.005) {
      lines.push({
        kind: "internos",
        label: "Imp. internos",
        percent: round4((leftover / net) * 100),
        unitAmount: leftover,
      });
    }
  }

  return lines;
}

/** Líneas fiscales del producto (unitarias). No inventa IIBB si el proveedor no lo mandó. */
export function extractTaxLines(p: TaxableProduct): TaxLine[] {
  if (p.taxes && p.taxes.length > 0) return p.taxes;

  const net = parsePrice(p.price);
  const raw = p.raw;

  if (Array.isArray(raw)) {
    const inv = fromInvidRow(raw, net);
    if (inv) return inv;
  } else if (raw && typeof raw === "object") {
    const named = fromNamedRaw(raw as Record<string, unknown>, net);
    if (named) return named;
  }

  return fallbackLines(p, net);
}

export function taxByKind(lines: TaxLine[], kind: TaxKind): TaxLine | null {
  const match = lines.filter((l) => l.kind === kind);
  if (match.length === 0) return null;
  if (match.length === 1) return match[0];
  return {
    kind,
    label: TAX_KIND_LABEL[kind],
    percent: match.every((l) => l.percent === match[0].percent) ? match[0].percent : null,
    unitAmount: round4(match.reduce((s, l) => s + l.unitAmount, 0)),
  };
}

export function formatAlicuota(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "—";
  const n = Math.round(percent * 10) / 10;
  return `${Number.isInteger(n) ? String(n) : n.toFixed(1)}%`;
}

export function linePricing(p: TaxableProduct, qty = 1) {
  const unitNet = parsePrice(p.price);
  const unitListedGross = parsePrice(p.finalPrice);
  const knownRate = taxRateFromPercent(p.ivaPercent);
  const lines = extractTaxLines(p);
  const taxFromLines = lines.reduce((s, l) => s + l.unitAmount, 0);

  let unitGross: number;
  if (unitListedGross > 0) {
    unitGross = unitListedGross;
  } else if (taxFromLines > 0) {
    unitGross = unitNet + taxFromLines;
  } else if (knownRate != null) {
    unitGross = unitNet * (1 + knownRate);
  } else {
    unitGross = unitNet * 1.21;
  }

  const net = unitNet * qty;
  const gross = unitGross * qty;
  const tax = Math.max(0, gross - net);
  const rate = unitNet > 0 ? (unitGross - unitNet) / unitNet : (knownRate ?? 0.21);

  return { unitNet, unitGross, net, gross, tax, rate, knownRate, lines };
}

/** Completa IVA / internos / IIBB (percepciones) con lo que devolvió ValidarStockInvid. */
export function applyInvidCheckoutTaxes(
  product: TaxableProduct,
  qty: number,
  checkout: { lineIva?: number; lineInternos?: number; percepcionPercent?: number }
): TaxLine[] {
  const unitNet = parsePrice(product.price);
  const existing = extractTaxLines(product);
  const keep = (kind: TaxKind) => taxByKind(existing, kind);
  const lines: TaxLine[] = [];
  const safeQty = qty > 0 ? qty : 1;

  const lineIva = checkout.lineIva;
  if (lineIva != null && lineIva > 0.0001) {
    const unit = round4(lineIva / safeQty);
    lines.push({
      kind: "iva",
      label: "IVA",
      percent: unitNet > 0 ? round4((unit / unitNet) * 100) : null,
      unitAmount: unit,
    });
  } else {
    const prev = keep("iva");
    if (prev) lines.push(prev);
  }

  const lineInternos = checkout.lineInternos;
  if (lineInternos != null && lineInternos > 0.0001) {
    const unit = round4(lineInternos / safeQty);
    lines.push({
      kind: "internos",
      label: "Imp. internos",
      percent: unitNet > 0 ? round4((unit / unitNet) * 100) : null,
      unitAmount: unit,
    });
  } else {
    const prev = keep("internos");
    if (prev) lines.push(prev);
  }

  const pct = checkout.percepcionPercent ?? 0;
  if (pct > 0 && unitNet > 0) {
    lines.push({
      kind: "iibb",
      label: "IIBB",
      percent: pct,
      unitAmount: round4(unitNet * (pct / 100)),
    });
  } else {
    const prev = keep("iibb");
    if (prev) lines.push(prev);
  }

  return lines;
}

export function grossFromTaxLines(product: TaxableProduct, lines: TaxLine[]): number {
  return round4(parsePrice(product.price) + lines.reduce((s, l) => s + l.unitAmount, 0));
}

export function formatTaxPercent(rate: number): string {
  const pct = Math.round(rate * 1000) / 10;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

/** Etiqueta para badges / desglose: "IVA 10.5%" o "Impuestos 29%" si hay más que IVA. */
export function taxLabel(p: TaxableProduct): string {
  const lines = extractTaxLines(p);
  const iva = taxByKind(lines, "iva");
  const extras = lines.filter((l) => l.kind !== "iva" && l.unitAmount > 0.0001);
  if (iva && extras.length === 0) {
    return iva.unitAmount <= 0.0001 ? "Sin impuestos" : `IVA ${formatAlicuota(iva.percent)}`;
  }
  const t = linePricing(p);
  if (t.tax <= 0.0001) return "Sin impuestos";
  return `Impuestos ${formatTaxPercent(t.rate)}%`;
}
