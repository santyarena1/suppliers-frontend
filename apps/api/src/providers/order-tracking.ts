/**
 * Seguimiento de pedidos: del estado que escribe cada portal a una etapa común
 * (Enviado → Confirmado → Facturado → Despachado → Entregado, o Anulado).
 * Puro, sin red: `OrderTrackingService` lee los portales y usa esto.
 */

export const TRACKING_STAGES = ["SENT", "CONFIRMED", "INVOICED", "SHIPPED", "DELIVERED"] as const;
export type TrackingStage = (typeof TRACKING_STAGES)[number] | "CANCELLED";

/** Lo que dice el portal de un pedido. */
export interface PortalOrderStatus {
  /** Números con los que el portal identifica el pedido (se cruzan con los que guardó NODO). */
  numbers: (string | null | undefined)[];
  /** Estado tal cual (se muestra al comercio). */
  status?: string | null;
  /** Otros textos que ayudan a deducir la etapa (descripción, estado del envío). */
  hints?: (string | null | undefined)[];
  invoice?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  /** El portal ya lo agrupa en una etapa (Polytech: pendiente / en proceso / despachado). */
  stage?: TrackingStage;
}

export interface TrackingUpdate {
  stage: TrackingStage;
  status: string | null;
  invoice: string | null;
  trackingNumber: string | null;
  carrier: string | null;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const CANCELLED = /\b(anulad|cancelad|rechazad|vencid|baja\b)/;
// «Armado Finalizado» (New Bytes) es armado, no entregado: «finalizad» no cuenta solo.
const DELIVERED = /\b(entregad|recibid|cumplid|cobrad)/;
const SHIPPED = /\b(despachad|en camino|enviad[oa] al|en transito|remitid|retirad|shipped|listo para retir|en distribucion|en reparto)/;
// «Cerrado» (Invid) es el pedido procesado y facturado; la entrega no la informa.
const INVOICED = /\b(factur|cerrad)/;
/** «No preparado», «sin despachar», «todavía no facturado»: la palabra negada no cuenta. */
const NEGATED = /\b(todavia no|aun no|no|sin)\s+\w+/g;
const CONFIRMED = /\b(confirmad|aprobad|aceptad|en preparacion|preparando|preparad|armando|armad|en proceso|procesad|reservad|in_process|en curso)/;

export function stageRank(stage: TrackingStage | string | null | undefined): number {
  if (stage === "CANCELLED") return 99;
  const i = TRACKING_STAGES.indexOf(stage as (typeof TRACKING_STAGES)[number]);
  return i < 0 ? -1 : i;
}

/** "Entregado Cobrado" → DELIVERED; "REMITIDO Y FACTURADO" → SHIPPED; "Pendiente" → SENT. */
export function stageFromText(text: string): TrackingStage {
  const t = fold(text).replace(NEGATED, " ");
  if (CANCELLED.test(t)) return "CANCELLED";
  if (DELIVERED.test(t)) return "DELIVERED";
  if (SHIPPED.test(t)) return "SHIPPED";
  if (INVOICED.test(t)) return "INVOICED";
  if (CONFIRMED.test(t)) return "CONFIRMED";
  return "SENT";
}

function clean(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s && !/^(-|pendiente|no|sin factura|adjuntar)$/i.test(s) ? s : null;
}

export function trackingFromPortal(row: PortalOrderStatus): TrackingUpdate {
  const invoice = clean(row.invoice);
  const trackingNumber = clean(row.trackingNumber);
  const texts = [row.status, ...(row.hints ?? [])].filter((s): s is string => Boolean(s && s.trim()));
  let stage: TrackingStage = row.stage ?? "SENT";
  for (const t of texts) {
    const s = stageFromText(t);
    if (s === "CANCELLED") {
      stage = s;
      break;
    }
    if (stageRank(s) > stageRank(stage)) stage = s;
  }
  if (stage !== "CANCELLED") {
    if (trackingNumber && stageRank(stage) < stageRank("SHIPPED")) stage = "SHIPPED";
    if (invoice && stageRank(stage) < stageRank("INVOICED")) stage = "INVOICED";
  }
  return {
    stage,
    status: row.status?.trim() || null,
    invoice,
    trackingNumber,
    carrier: clean(row.carrier),
  };
}

/** Números que NODO guardó de un pedido, sin la extensión "/01" de Solution Box. */
export function nodoNumbers(order: { invidOrderNumber?: string | null; invidWebOrderNumber?: string | null }): Set<string> {
  const out = new Set<string>();
  for (const n of [order.invidOrderNumber, order.invidWebOrderNumber]) {
    for (const part of String(n ?? "").split(",")) {
      const v = part.trim();
      if (v) out.add(v);
    }
  }
  return out;
}

/** La fila del portal que corresponde al pedido de NODO, si está. */
export function findPortalRow<T extends PortalOrderStatus>(
  order: { invidOrderNumber?: string | null; invidWebOrderNumber?: string | null },
  rows: T[]
): T | undefined {
  const mine = nodoNumbers(order);
  if (mine.size === 0) return undefined;
  return rows.find((r) => r.numbers.some((n) => n != null && mine.has(String(n).trim())));
}

/** Etapa nueva solo si avanza (o si se anuló). Un portal que "retrocede" no se toma. */
export function advances(current: string | null | undefined, next: TrackingStage): boolean {
  if (current === "CANCELLED" || current === "DELIVERED") return false;
  return stageRank(next) > stageRank(current ?? "SENT");
}

const STAGE_TEXT: Record<TrackingStage, string> = {
  SENT: "recibió tu pedido",
  CONFIRMED: "confirmó tu pedido",
  INVOICED: "facturó tu pedido",
  SHIPPED: "despachó tu pedido",
  DELIVERED: "entregó tu pedido",
  CANCELLED: "anuló tu pedido",
};

/** Título y texto del aviso: "Air facturó tu pedido" · "Pedido 123 · Factura A 0003-00018422". */
export function trackingNotice(
  providerName: string,
  orderNumber: string | null,
  update: TrackingUpdate
): { title: string; body: string } {
  const parts = [orderNumber ? `Pedido ${orderNumber}` : null];
  if (update.invoice && (update.stage === "INVOICED" || update.stage === "SHIPPED")) parts.push(`Factura ${update.invoice}`);
  if (update.trackingNumber && update.stage === "SHIPPED") {
    parts.push(`Seguimiento ${update.trackingNumber}${update.carrier ? ` (${update.carrier})` : ""}`);
  }
  if (update.status) parts.push(`En el portal: «${update.status}»`);
  return { title: `${providerName} ${STAGE_TEXT[update.stage]}`, body: parts.filter(Boolean).join(" · ") };
}

/** Distribuidores que publican el estado de sus pedidos y NODO sabe leer. */
export const TRACKED_PROVIDERS = ["NEW_BYTES", "ELIT", "INVID", "NEW_TREE", "SOLUTION_BOX", "POLYTECH"] as const;

export function isTrackedProvider(provider: string): boolean {
  return (TRACKED_PROVIDERS as readonly string[]).includes(provider);
}

/** De todas las filas del portal que son ese pedido, la que más avanzó (anulado gana). */
export function bestUpdate(
  order: { invidOrderNumber?: string | null; invidWebOrderNumber?: string | null },
  rows: PortalOrderStatus[]
): TrackingUpdate | null {
  const mine = nodoNumbers(order);
  if (mine.size === 0) return null;
  const updates = rows
    .filter((row) => row.numbers.some((n) => n != null && mine.has(String(n).trim())))
    .map(trackingFromPortal);
  if (updates.length === 0) return null;
  const best = updates.reduce((a, b) => (stageRank(b.stage) > stageRank(a.stage) ? b : a));
  // La factura o el seguimiento pueden venir en otra fila del mismo pedido.
  return {
    ...best,
    invoice: best.invoice ?? updates.find((u) => u.invoice)?.invoice ?? null,
    trackingNumber: best.trackingNumber ?? updates.find((u) => u.trackingNumber)?.trackingNumber ?? null,
  };
}
