import type { Prisma, ProviderOrder } from "@prisma/client";

function num(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Copia de pedido Nodo para los paneles de cuenta (incluye ítems del snapshot). */
export function mapProviderDraft(row: ProviderOrder) {
  return {
    id: row.id,
    status: row.status,
    invidOrderNumber: row.invidOrderNumber,
    invidWebOrderNumber: row.invidWebOrderNumber,
    paymentOption: row.paymentOption,
    paymentLabel: row.paymentLabel,
    deliveryOption: row.deliveryOption,
    deliveryLabel: row.deliveryLabel,
    notes: row.notes,
    subtotal: num(row.subtotal),
    impuestos: num(row.impuestos),
    percepciones: num(row.percepciones),
    total: num(row.total),
    errorMessage: row.errorMessage,
    items: Array.isArray(row.items) ? row.items : [],
    addressSnapshot: row.addressSnapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProviderDrafts(
  findMany: () => Promise<ProviderOrder[]>
) {
  return (await findMany()).map(mapProviderDraft);
}
