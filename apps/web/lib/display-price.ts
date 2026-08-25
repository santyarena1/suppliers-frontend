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
  /** true si la alícuota no vino en el producto y se estimó por proveedor. */
  estimatedIibb: boolean;
  iibbPercent: number | null;
};

/**
 * Precio a mostrar en búsqueda / cards / ficha.
 * - sin impuestos: neto
 * - con impuestos, sin IIBB: IVA + internos (excluye percepciones aunque el producto las traiga)
 * - con impuestos + IIBB: suma IIBB del producto o alícuota conocida del distribuidor
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
  if (!opts.withIva) {
    return {
      displayUsd: pricing.net,
      unitDisplayUsd: pricing.unitNet,
      iibbUnitUsd: 0,
      iibbIncluded: false,
      estimatedIibb: false,
      iibbPercent: null,
    };
  }

  const existing = taxByKind(pricing.lines, "iibb");
  const existingUnit = existing && existing.unitAmount > 0.0001 ? existing.unitAmount : 0;
  const nonIibbTax = pricing.lines
    .filter((l) => l.kind !== "iibb")
    .reduce((s, l) => s + l.unitAmount, 0);

  const hasLineDetail = pricing.lines.some((l) => l.unitAmount > 0.0001);
  const unitWithoutIibb = hasLineDetail
    ? round4(pricing.unitNet + nonIibbTax)
    : pricing.unitGross;

  if (!opts.withIibb) {
    return {
      displayUsd: round4(unitWithoutIibb * qty),
      unitDisplayUsd: unitWithoutIibb,
      iibbUnitUsd: 0,
      iibbIncluded: false,
      estimatedIibb: false,
      iibbPercent: null,
    };
  }

  let iibbUnit = existingUnit;
  let iibbPercent = existing?.percent ?? null;
  let estimated = false;

  if (iibbUnit <= 0.0001) {
    const pct = getIibbRatePercent(opts.provider);
    if (pct != null && pct > 0 && pricing.unitNet > 0) {
      iibbUnit = round4(pricing.unitNet * (pct / 100));
      iibbPercent = pct;
      estimated = true;
    }
  }

  const unitDisplay = round4(unitWithoutIibb + iibbUnit);
  return {
    displayUsd: round4(unitDisplay * qty),
    unitDisplayUsd: unitDisplay,
    iibbUnitUsd: iibbUnit,
    iibbIncluded: iibbUnit > 0.0001,
    estimatedIibb: estimated,
    iibbPercent,
  };
}

/** Badge corto bajo el precio (+ IVA 21% · + IIBB, etc.). */
export function displayTaxBadge(
  product: TaxableProduct,
  opts: DisplayTaxOpts
): string {
  if (!opts.withIva) return "Sin imp.";

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
  if (iva && iva.unitAmount > 0.0001) {
    parts.push(`IVA ${formatAlicuota(iva.percent)}`);
  }
  if (internos && internos.unitAmount > 0.0001) {
    parts.push("int.");
  }
  if (willShowIibb) {
    const pct = productIibb?.percent ?? ratePct;
    parts.push(pct != null ? `IIBB ${formatAlicuota(pct)}` : "IIBB");
  }

  if (parts.length > 0) return parts.join(" · ");

  // Fallback: etiqueta genérica sin inventar IIBB
  if (!opts.withIibb) {
    const without = lines.filter((l) => l.kind !== "iibb");
    const tax = without.reduce((s, l) => s + l.unitAmount, 0);
    const net = parsePrice(product.price);
    if (tax > 0.0001 && net > 0) {
      return `Impuestos ${formatTaxPercent(tax / net)}%`;
    }
  }
  return taxLabel(product);
}

export function displayTaxTitle(opts: DisplayTaxOpts): string {
  if (!opts.withIva) return "Precio sin impuestos";
  if (opts.withIibb) return "Precio con impuestos e IIBB";
  return "Precio con impuestos (sin IIBB)";
}
