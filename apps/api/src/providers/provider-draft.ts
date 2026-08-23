import { Logger } from "@nestjs/common";
import type { Prisma, ProviderOrder } from "@prisma/client";

/**
 * Quién arma el pedido y para qué organización. El pedido es de la organización;
 * la persona queda registrada para saber quién lo armó y quién lo aprobó.
 */
export interface OrderAuthor {
  userId: string;
  tenantId: string;
}

/** Campos de dueño comunes a todo pedido nuevo. */
export function orderOwner(author: OrderAuthor) {
  return {
    userId: author.userId,
    tenantId: author.tenantId,
    createdByUserId: author.userId,
  };
}

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

export function pendingCheckoutResponse(id: string, items: unknown, message: string) {
  return {
    id,
    status: "PENDING" as const,
    orderNumber: null,
    webOrderNumber: null,
    paymentLabel: null,
    deliveryLabel: null,
    items,
    total: null,
    message,
  };
}

export function runBackgroundDraft(
  logger: Logger,
  label: string,
  id: string,
  fulfill: () => Promise<unknown>,
  markFailed: (message: string) => Promise<unknown>
) {
  setImmediate(() => {
    fulfill().catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`${label} ${id}: ${message}`);
      await markFailed(message.slice(0, 500)).catch((updateErr: unknown) => logger.error(String(updateErr)));
    });
  });
}
