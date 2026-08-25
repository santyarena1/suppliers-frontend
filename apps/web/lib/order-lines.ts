import type { TenantOrder } from "@/lib/api";
import { computePurchaseUnit, type PurchasePolicy } from "@/lib/purchase-pricing";

export type OrderLine = TenantOrder["items"][number];

export type LineAmounts = {
  qty: number;
  unitNet: number;
  net: number;
  ivaPercent: number;
  iva: number;
  internosPercent: number;
  internos: number;
  /** Final de línea mostrado (editado o calculado). */
  final: number;
  computedFinal: number;
  pricingMode: "list" | "scheme" | "offline" | null;
  edited: boolean;
  editedAt: string | null;
  originalUnitPrice: number | null;
  originalFinal: number | null;
  listUnitPrice: number | null;
  editNote: string | null;
};

function asNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Neto unitario: offline usa unitPrice; online suele mandar price/priceUsd. */
export function readUnitNet(it: OrderLine): number {
  const n = asNum(
    it.unitPrice ?? it.price ?? it.priceUsd ?? it.unitPriceUsd
  );
  return n > 0 ? n : 0;
}

export function lineAmounts(it: OrderLine): LineAmounts {
  const qty = Math.max(1, asNum(it.qty) || 1);
  const unitNet = readUnitNet(it);
  const netFromFields = asNum(it.lineTotal ?? it.subtotal ?? it.total);
  const net = netFromFields > 0 ? netFromFields : unitNet * qty;
  const unitForCalc = qty > 0 ? net / qty : unitNet;

  const ivaPercent = asNum(it.ivaPercent ?? it.iva);
  const iva = net * (ivaPercent / 100);

  const internosUnit = asNum(it.internosAmount);
  const internosFromAmt = internosUnit * qty;
  const internosPercent = asNum(it.internosPercent) || (
    unitForCalc > 0 && internosUnit > 0 ? (internosUnit / unitForCalc) * 100 : 0
  );
  const internos = internosFromAmt > 0.00005
    ? internosFromAmt
    : net * (internosPercent / 100);

  const computedFinal = net + iva + internos;
  const finalOverride = asNum(it.finalLineUsd ?? it.finalPrice);
  const final = finalOverride > 0 ? finalOverride : computedFinal;

  return {
    qty,
    unitNet: unitForCalc,
    net,
    ivaPercent,
    iva,
    internosPercent,
    internos,
    final,
    computedFinal,
    pricingMode: it.pricingMode ?? null,
    edited: Boolean(it.edited),
    editedAt: it.editedAt ?? null,
    originalUnitPrice: it.originalUnitPrice ?? null,
    originalFinal: it.originalFinalLineUsd ?? null,
    listUnitPrice: it.listUnitPrice ?? null,
    editNote: it.editNote ?? null,
  };
}

export type OrderLineTotals = { net: number; iva: number; internos: number; final: number };

export function sumOrderLines(items: OrderLine[]): OrderLineTotals {
  const acc: OrderLineTotals = { net: 0, iva: 0, internos: 0, final: 0 };
  for (const it of items) {
    const row = lineAmounts(it);
    acc.net += row.net;
    acc.iva += row.iva;
    acc.internos += row.internos;
    acc.final += row.final;
  }
  return acc;
}

/** Aplica la config de esquema del proveedor sobre el neto de lista. */
export function applySchemeToLine(
  it: OrderLine,
  policy: PurchasePolicy | null | undefined
): OrderLine {
  const row = lineAmounts(it);
  const listNet = row.listUnitPrice && row.listUnitPrice > 0
    ? row.listUnitPrice
    : row.unitNet;
  const adj = policy?.schemeIvaAdjustment;
  if (!policy?.acceptsScheme || !adj) {
    return {
      ...it,
      pricingMode: "scheme",
      listUnitPrice: listNet,
      edited: true,
      editedAt: new Date().toISOString(),
      originalUnitPrice: it.originalUnitPrice ?? row.unitNet,
      originalFinalLineUsd: it.originalFinalLineUsd ?? row.final,
      editNote: it.editNote || "Marcado como esquema (sin ajuste de IVA configurado)",
    };
  }

  const unit = computePurchaseUnit({
    net: listNet,
    ivaPercent: row.ivaPercent > 0 ? row.ivaPercent : null,
    internosAmount: row.qty > 0 ? row.internos / row.qty : 0,
    iibbAmount: 0,
    otherAmount: 0,
    ivaAdjustment: adj,
    schemeDiscountPercent: policy.schemeDiscountPercent ?? 0,
    dropPerceptions: false,
  });

  const qty = row.qty;
  const unitNet = unit.net;
  const net = Math.round(unitNet * qty * 100) / 100;
  const ivaPercent = unit.ivaPercent ?? 0;
  const iva = unit.ivaAmount != null ? Math.round(unit.ivaAmount * qty * 100) / 100 : 0;
  const internos = Math.round(unit.internosAmount * qty * 100) / 100;
  const finalLineUsd = Math.round((net + iva + internos) * 100) / 100;

  return {
    ...it,
    unitPrice: unitNet,
    price: unitNet,
    lineTotal: net,
    subtotal: net,
    ivaPercent,
    internosAmount: qty > 0 ? internos / qty : 0,
    internosPercent: unitNet > 0 && internos > 0 ? (internos / net) * 100 : row.internosPercent,
    finalLineUsd,
    pricingMode: "scheme",
    listUnitPrice: listNet,
    edited: true,
    editedAt: new Date().toISOString(),
    originalUnitPrice: it.originalUnitPrice ?? row.unitNet,
    originalFinalLineUsd: it.originalFinalLineUsd ?? row.final,
    editNote: it.editNote || "Esquema del proveedor aplicado",
  };
}

export function markLineEdited(
  it: OrderLine,
  patch: Partial<OrderLine>,
  note?: string
): OrderLine {
  const row = lineAmounts(it);
  return {
    ...it,
    ...patch,
    edited: true,
    editedAt: new Date().toISOString(),
    originalUnitPrice: it.originalUnitPrice ?? row.unitNet,
    originalFinalLineUsd: it.originalFinalLineUsd ?? row.final,
    listUnitPrice: it.listUnitPrice ?? row.listUnitPrice ?? row.unitNet,
    editNote: note ?? it.editNote ?? "Valor ajustado manualmente",
  };
}
