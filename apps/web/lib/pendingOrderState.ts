import type { PolledDraft } from "@/lib/providerOrders";

/** Estado de los avisos de pedidos en segundo plano (sin React ni localStorage). */

export type PendingOrderProvider = "INVID" | "NEW_BYTES" | "ELIT" | "GRUPO_NUCLEO" | "AIR" | "NEW_TREE" | "SOLUTION_BOX" | "DISTECNA" | "POLYTECH";

export type PendingOrderJob = {
  id: string;
  provider: PendingOrderProvider;
  /** PENDING_APPROVAL: lo armó un vendedor y espera la firma del dueño del comercio. */
  status: "PENDING" | "PENDING_APPROVAL" | "CREATED" | "FAILED";
  message: string;
  webOrderNumber?: string | null;
  orderNumber?: string | null;
  errorMessage?: string | null;
  startedAt: number;
  /** Cuándo pasó a CREATED o FAILED (para sacar el aviso solo). */
  finishedAt?: number;
  notified?: boolean;
};

/** El "Pedido confirmado" se ve un rato y se va: antes quedaba en el carrito hasta tocar la X. */
export const CREATED_VISIBLE_MS = 60_000;
/** Un error queda hasta cerrarlo, pero no más de un día. */
export const FAILED_VISIBLE_MS = 24 * 60 * 60_000;
/** Nada queda guardado más de una semana (una aprobación que nunca se resolvió, por ejemplo). */
export const JOB_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Los avisos que siguen en pantalla. Un CREATED se va recién cuando el carrito ya
 * lo vio (`notified`, que es cuando lo vacía) y pasó CREATED_VISIBLE_MS.
 */
export function liveJobs(jobs: PendingOrderJob[], now = Date.now()): PendingOrderJob[] {
  return jobs.filter((j) => {
    if (now - j.startedAt > JOB_MAX_AGE_MS) return false;
    const finished = j.finishedAt ?? j.startedAt;
    if (j.status === "CREATED") return !j.notified || now - finished < CREATED_VISIBLE_MS;
    if (j.status === "FAILED") return now - finished < FAILED_VISIBLE_MS;
    return true;
  });
}

/** Qué pasa con el aviso según el estado del pedido en el servidor; `null` = sigue igual. */
export function nextJobState(job: PendingOrderJob, row: PolledDraft, now = Date.now()): Partial<PendingOrderJob> | null {
  const patch = nextJobStatus(row, now);
  if (!patch || row.status === job.status) return null;
  // Retenido para aprobación: el carrito ya se vació al guardarlo. Al salir no se
  // vuelve a vaciar (borraría lo que se cargó después para ese distribuidor).
  return job.status === "PENDING_APPROVAL" ? { ...patch, notified: true } : patch;
}

function nextJobStatus(row: PolledDraft, now: number): Partial<PendingOrderJob> | null {
  if (row.status === "PENDING_APPROVAL") return { status: "PENDING_APPROVAL" };
  // Aprobado: se está mandando al distribuidor.
  if (row.status === "PENDING") return { status: "PENDING", message: "Aprobado. Mandando el pedido al distribuidor…" };
  if (row.status === "CREATED") {
    return {
      status: "CREATED",
      finishedAt: now,
      orderNumber: row.invidOrderNumber,
      webOrderNumber: row.invidWebOrderNumber,
      message: row.invidWebOrderNumber
        ? `Pedido confirmado. Pedido web ${row.invidWebOrderNumber}.`
        : row.invidOrderNumber
          ? `Pedido confirmado. Orden ${row.invidOrderNumber}.`
          : "Pedido confirmado.",
    };
  }
  return {
    status: "FAILED",
    finishedAt: now,
    errorMessage: row.errorMessage,
    message: row.status === "REJECTED" ? "Rechazaron el pedido: no se mandó al distribuidor." : row.errorMessage || "No se pudo crear el pedido",
  };
}
