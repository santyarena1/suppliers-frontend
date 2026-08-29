import {
  extractTaxLines,
  formatAlicuota,
  formatTaxPercent,
  taxByKind,
  taxLabel,
  type TaxLine,
  type TaxableProduct,
} from "@/lib/tax";
import { parsePrice } from "@/lib/format";
import { getIibbRatePercent } from "@/lib/iibb-rates";

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export type DisplayTaxOpts = {
  withIva: boolean;
  withIibb: boolean;
  provider?: string | null;
};

export type DisplayAmount = {
  displayUsd: number;
  unitDisplayUsd: number;
  /** IIBB unitario incluido en el display (0 si el toggle está off). */
  iibbUnitUsd: number;
  iibbIncluded: boolean;
  /** true si la alícuota no vino en el producto y se usó la de este comercio. */
  estimatedIibb: boolean;
  iibbPercent: number | null;
};

function resolveIibb(
  pricing: { unitNet: number; lines: TaxLine[] },
  provider?: string | null
): { unit: number; percent: number | null; estimated: boolean } {
  const existing = taxByKind(pricing.lines, "iibb");
  const existingUnit = existing && existing.unitAmount > 0.0001 ? existing.unitAmount : 0;
  if (existingUnit > 0.0001) {
    return { unit: existingUnit, percent: existing?.percent ?? null, estimated: false };
  }
  const pct = getIibbRatePercent(provider);
  if (pct != null && pct > 0 && pricing.unitNet > 0) {
    return { unit: round4(pricing.unitNet * (pct / 100)), percent: pct, estimated: true };
  }
  return { unit: 0, percent: null, estimated: false };
}

/**
 * IVA e IIBB son capas independientes. El precio de display es:
 *   neto
 * + (si withIva) IVA + internos
 * + (si withIibb) percepciones / IIBB del producto o alícuota de ESTE comercio
 *   (Configuración; la confirma el carrito o se carga a mano — no hay % fijo por proveedor)
 *
 * Offline no suma IIBB (eso lo decide el modo de compra, no este toggle).
 */
export function displayAmountFromPricing(
  pricing: {
    unitNet: number;
    unitGross: number;
    net: number;
    gross: number;
    lines: TaxLine[];
  },
  opts: DisplayTaxOpts,
  qty = 1
): DisplayAmount {
  const nonIibbTax = pricing.lines
    .filter((l) => l.kind !== "iibb")
    .reduce((s, l) => s + l.unitAmount, 0);
  const hasLineDetail = pricing.lines.some((l) => l.unitAmount > 0.0001);
  const unitWithIva = hasLineDetail
    ? round4(pricing.unitNet + nonIibbTax)
    : pricing.unitGross;

  const baseUnit = opts.withIva ? unitWithIva : pricing.unitNet;

  if (!opts.withIibb) {
    return {
      displayUsd: round4(baseUnit * qty),
      unitDisplayUsd: round4(baseUnit),
      iibbUnitUsd: 0,
      iibbIncluded: false,
      estimatedIibb: false,
      iibbPercent: null,
    };
  }

  const iibb = resolveIibb(pricing, opts.provider);
  const unitDisplay = round4(baseUnit + iibb.unit);
  return {
    displayUsd: round4(unitDisplay * qty),
    unitDisplayUsd: unitDisplay,
    iibbUnitUsd: iibb.unit,
    iibbIncluded: iibb.unit > 0.0001,
    estimatedIibb: iibb.estimated,
    iibbPercent: iibb.percent,
  };
}

/** Badge corto bajo el precio (+ IVA 21% · + IIBB, etc.). */
export function displayTaxBadge(
  product: TaxableProduct,
  opts: DisplayTaxOpts
): string {
  const lines = extractTaxLines(product);
  const iva = taxByKind(lines, "iva");
  const internos = taxByKind(lines, "internos");
  const productIibb = taxByKind(lines, "iibb");
  const ratePct = getIibbRatePercent(opts.provider);
  const willShowIibb =
    opts.withIibb &&
    ((productIibb != null && productIibb.unitAmount > 0.0001) ||
      (ratePct != null && ratePct > 0));

  const parts: string[] = [];
  if (!opts.withIva && !opts.withIibb) return "Neto";

  if (opts.withIva) {
    if (iva && iva.unitAmount > 0.0001) {
      parts.push(`IVA ${formatAlicuota(iva.percent)}`);
    }
    if (internos && internos.unitAmount > 0.0001) {
      parts.push("int.");
    }
    if (parts.length === 0) {
      const without = lines.filter((l) => l.kind !== "iibb");
      const tax = without.reduce((s, l) => s + l.unitAmount, 0);
      const net = parsePrice(product.price);
      if (tax > 0.0001 && net > 0) {
        parts.push(`IVA/int. ${formatTaxPercent(tax / net)}%`);
      }
    }
  } else {
    parts.push("s/IVA");
  }

  if (willShowIibb) {
    const pct = productIibb?.percent ?? ratePct;
    parts.push(pct != null ? `IIBB ${formatAlicuota(pct)}` : "IIBB");
  }

  if (parts.length > 0) return parts.join(" · ");
  return taxLabel(product);
}

export function displayTaxTitle(opts: DisplayTaxOpts): string {
  if (opts.withIva && opts.withIibb) return "Con IVA y percepciones";
  if (opts.withIva) return "Con IVA (sin percepciones)";
  if (opts.withIibb) return "Neto + percepciones (sin IVA)";
  return "Precio neto";
}
