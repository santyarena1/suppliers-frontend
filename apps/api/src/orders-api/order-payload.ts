/**
 * API de pedidos (Sistema TGS → AcuStock): el pedido tal como sale en
 * `GET /v1/pedidos` y en los avisos `pedido.*`. Función pura: arma el pedido
 * desde lo que NODO ya guarda en `ProviderOrder` (columnas, `items`,
 * `addressSnapshot`, `draftInput`), con las reglas de cada distribuidor para
 * separar IVA, internos, percepciones y envío. Lo que el distribuidor no da
 * queda en `null`: nunca se inventa un dato.
 */
import { createHash } from "crypto";
import { readLineTotal, readUnitNet } from "../orders/offline-order";

// ---------- Tipos de entrada ----------

export interface OrderRow {
  id: string;
  number: number | null;
  tenantId: string;
  provider: string;
  status: string;
  channel: string;
  approvalStatus: string;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
  paymentOption: string;
  paymentLabel: string | null;
  deliveryOption: string | null;
  deliveryLabel: string | null;
  notes: string | null;
  subtotal: unknown;
  impuestos: unknown;
  percepciones: unknown;
  total: unknown;
  items: unknown;
  addressSnapshot: unknown;
  draftInput: unknown;
  rejectionReason: string | null;
  approvalDecidedAt: Date | null;
  storefrontStatus: string | null;
  trackingStage: string | null;
  trackingStatus: string | null;
  trackingInvoice: string | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  trackingChangedAt: Date | null;
  trackingHistory?: unknown;
  createdAt: Date;
  createdBy: { id: string; username: string } | null;
  approvedBy: { id: string; username: string } | null;
  user: { id: string; username: string } | null;
}

/** Datos del producto en el catálogo de NODO (no vienen en el pedido). */
export interface CatalogFacts {
  sku: string | null;
  partNumber: string | null;
  ean: string | null;
  brand: string | null;
  warranty: string | null;
  productId: string | null;
}

/** Factura, nota o remito guardado en NODO (`ProviderOrderDocument`). */
export interface OrderDocumentRow {
  id: string;
  kind: string;
  portalNumber: string | null;
  tipo: string | null;
  puntoVenta: number | null;
  numero: number | null;
  fechaEmision: string | null;
  cae: string | null;
  caeVencimiento: string | null;
  cuitEmisor: string | null;
  importeTotal: unknown;
  moneda: string | null;
  cotizacion: unknown;
  origen: string | null;
  assetId: string | null;
  createdAt: Date;
}

export interface DistributorFacts {
  name: string;
  cuit: string | null;
}

// ---------- Tipos de salida ----------

export type OrderState = "pendiente_aprobacion" | "creado" | "enviado" | "rechazado" | "cancelado" | "fallido";

export interface OrderLine {
  codigo_distribuidor: string;
  sku: string | null;
  part_number: string | null;
  ean: string | null;
  marca: string | null;
  nombre: string;
  cantidad: number;
  precio_unitario_neto: number;
  moneda: "USD";
  iva_porcentaje: number | null;
  impuestos_internos: { porcentaje: number | null; monto: number } | null;
  descuento: null;
  total_linea: number;
  garantia: string | null;
  producto_nodo: string | null;
}

export interface OrderPayload {
  id: string;
  numero: string | null;
  version: number;
  actualizado: string;
  estado: OrderState;
  canal: "online" | "offline";
  distribuidor: { clave: string; nombre: string; cuit: string | null };
  numero_pedido_distribuidor: string | null;
  numero_pedido_web_distribuidor: string | null;
  fecha: string;
  creado_por: { id: string; usuario: string } | null;
  aprobado_por: { id: string; usuario: string } | null;
  aprobado_en: string | null;
  motivo_rechazo: string | null;
  moneda: "USD";
  cotizacion: number | null;
  subtotal_neto: number | null;
  iva: number | null;
  iva_105: number | null;
  iva_21: number | null;
  impuestos_internos: number | null;
  percepciones: number | null;
  percepciones_detalle: { concepto: string; jurisdiccion: string | null; monto: number }[];
  envio: { monto: number; moneda: "USD" | "ARS" } | null;
  total: number | null;
  /** neto + IVA + internos + percepciones (+ envío en USD) da el total (±0,05). */
  desglose_cuadra: boolean;
  entrega: { tipo: string | null; detalle: string | null };
  forma_pago: string | null;
  notas: string | null;
  /** La factura del pedido (la primera, si hay entregas parciales). */
  factura: InvoicePayload | null;
  /** Todas las facturas y notas de crédito o débito del pedido, de la más vieja a la más nueva. */
  facturas: InvoicePayload[];
  /** El remito del pedido (el primero, si hay varios). */
  remito: DeliveryNotePayload | null;
  remitos: DeliveryNotePayload[];
  seguimiento: {
    etapa: string | null;
    estado_portal: string | null;
    factura: string | null;
    numero_envio: string | null;
    transporte: string | null;
    actualizado: string | null;
  } | null;
  renglones: OrderLine[];
}

export interface InvoicePayload {
  clase: "factura" | "nota_credito" | "nota_debito";
  /** Número tal como lo muestra el portal. */
  numero_portal: string | null;
  tipo: string | null;
  punto_venta: number | null;
  numero: number | null;
  /** AAAA-MM-DD, la fecha fiscal del comprobante. */
  fecha_emision: string | null;
  cae: string | null;
  cae_vencimiento: string | null;
  cuit_emisor: string | null;
  importe_total: number | null;
  moneda: string | null;
  cotizacion: number | null;
  /** Copia del PDF guardada en NODO (se pide con la misma API key). */
  pdf_url: string | null;
  /** De dónde salieron los datos: QR de ARCA, texto del PDF, o solo el número que mostró el portal. */
  origen: "qr" | "texto" | "portal";
}

export interface DeliveryNotePayload {
  numero: string | null;
  fecha: string | null;
  pdf_url: string | null;
}

// ---------- Utilidades ----------

const EPS = 0.005;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "object" && v !== null && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    const n = (v as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r2n = (n: number | null) => (n == null ? null : r2(n));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s ? s : null;
};
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** 0,21 → 21; 21 → 21. */
const points = (raw: number) => (raw > 0 && raw <= 1 ? raw * 100 : raw);

/** Alícuota de IVA conocida (10,5 / 21 / 27) o `null` si no calza. */
export function snapIvaPercent(p: number | null): number | null {
  if (p == null || !(p > 0)) return null;
  const v = points(p);
  for (const known of [10.5, 21, 27]) if (Math.abs(v - known) <= 0.3) return known;
  return null;
}

/** El IVA de un renglón vino como monto: ¿de la unidad o del renglón? Se elige el que da 10,5 o 21. */
function ivaPercentFromAmount(amount: number, qty: number, lineNet: number): number | null {
  if (!(amount > EPS) || !(lineNet > EPS)) return null;
  const asLine = snapIvaPercent((amount / lineNet) * 100);
  const asUnit = qty > 1 ? snapIvaPercent(((amount * qty) / lineNet) * 100) : null;
  if (asLine != null && asUnit == null) return asLine;
  if (asUnit != null && asLine == null) return asUnit;
  return asLine;
}

/** Impuestos de un renglón de Grupo Núcleo (`taxes: [{ desc, percent }]`). */
function gnTaxes(taxes: unknown): { iva: number | null; internos: number | null } {
  let iva: number | null = null;
  let internos: number | null = null;
  for (const raw of Array.isArray(taxes) ? taxes : []) {
    const t = rec(raw);
    const desc = fold(String(t.desc ?? t.imp_desc ?? ""));
    const pct = num(t.percent ?? t.imp_porcentaje);
    if (pct == null) continue;
    if (/\biva\b|i\.v\.a/.test(desc)) iva = snapIvaPercent(pct);
    else if (/interno/.test(desc)) internos = points(pct);
  }
  return { iva, internos };
}

// ---------- Estado ----------

export function orderState(o: Pick<OrderRow, "status" | "approvalStatus" | "storefrontStatus" | "trackingStage" | "channel">): OrderState {
  if (o.approvalStatus === "REJECTED") return "rechazado";
  if (o.storefrontStatus === "REJECTED") return "rechazado";
  if (o.trackingStage === "CANCELLED" || o.storefrontStatus === "CANCELLED") return "cancelado";
  if (o.approvalStatus === "PENDING_APPROVAL") return "pendiente_aprobacion";
  if (o.status === "FAILED") return "fallido";
  if (o.status === "CREATED") return "enviado";
  return "creado";
}

/**
 * Qué pedidos publica la API: los que existen para el comercio. Un intento de
 * compra que falló o que todavía se está mandando no es un pedido (salvo que
 * ya se haya publicado antes: entonces sale como `fallido`).
 */
export function isPublishable(o: Pick<OrderRow, "status" | "approvalStatus">): boolean {
  if (o.approvalStatus === "PENDING_APPROVAL" || o.approvalStatus === "REJECTED") return true;
  return o.status === "CREATED" || o.status === "OFFLINE";
}

// ---------- Renglones ----------

function lineOf(raw: unknown, catalog: (code: string) => CatalogFacts | null): OrderLine | null {
  const it = rec(raw);
  const code = text(it.externalId ?? it.code ?? it.codigo ?? it.sku);
  const name = text(it.name ?? it.nombre ?? it.description);
  const qty = num(it.qty ?? it.quantity ?? it.cantidad);
  if (!code || !name || qty == null || !(qty > 0)) return null;
  const unit = readUnitNet(it);
  const lineTotal = readLineTotal({ ...it, total: undefined }, unit, qty);

  let ivaPct = snapIvaPercent(num(it.ivaPercent ?? it.iva_percent ?? it.vatPercent));
  let internos: OrderLine["impuestos_internos"] = null;
  const gn = Array.isArray(it.taxes) ? gnTaxes(it.taxes) : null;
  if (gn) {
    ivaPct = ivaPct ?? gn.iva;
    if (gn.internos != null && gn.internos > 0) internos = { porcentaje: r2(gn.internos), monto: r2(lineTotal * (gn.internos / 100)) };
  }
  if (ivaPct == null) {
    const amount = num(it.vat ?? it.iva);
    if (amount != null) ivaPct = ivaPercentFromAmount(amount, qty, lineTotal);
  }
  const internosUnit = num(it.internosAmount);
  const internosPct = num(it.internosPercent);
  if (!internos && internosUnit != null && internosUnit > EPS) internos = { porcentaje: internosPct && internosPct > 0 ? r2(internosPct) : null, monto: r2(internosUnit * qty) };

  const facts = catalog(code);
  return {
    codigo_distribuidor: code,
    sku: text(it.sku) ?? facts?.sku ?? null,
    part_number: facts?.partNumber ?? text(it.partNumber) ?? null,
    ean: facts?.ean ?? text(it.ean) ?? null,
    marca: facts?.brand ?? text(it.brand) ?? null,
    nombre: name,
    cantidad: qty,
    precio_unitario_neto: r2(unit),
    moneda: "USD",
    iva_porcentaje: ivaPct,
    impuestos_internos: internos,
    descuento: null,
    total_linea: r2(lineTotal),
    garantia: facts?.warranty ?? null,
    producto_nodo: facts?.productId ?? null,
  };
}

// ---------- Totales por distribuidor ----------

interface Totals {
  neto: number | null;
  iva: number | null;
  iva105: number | null;
  iva21: number | null;
  internos: number | null;
  percepciones: number | null;
  percepcionesDetalle: OrderPayload["percepciones_detalle"];
  envio: OrderPayload["envio"];
  cotizacion: number | null;
}

/** IVA por alícuota desde los renglones (cuando todos la tienen). */
function ivaFromLines(lines: OrderLine[]): { iva: number; iva105: number; iva21: number } | null {
  if (lines.length === 0 || lines.some((l) => l.iva_porcentaje == null)) return null;
  let iva105 = 0;
  let iva21 = 0;
  let other = 0;
  for (const l of lines) {
    const v = l.total_linea * ((l.iva_porcentaje as number) / 100);
    if (l.iva_porcentaje === 10.5) iva105 += v;
    else if (l.iva_porcentaje === 21) iva21 += v;
    else other += v;
  }
  return { iva: r2(iva105 + iva21 + other), iva105: r2(iva105), iva21: r2(iva21) };
}

function internosFromLines(lines: OrderLine[]): number | null {
  const withData = lines.filter((l) => l.impuestos_internos);
  if (withData.length === 0) return null;
  return r2(withData.reduce((s, l) => s + (l.impuestos_internos?.monto ?? 0), 0));
}

function perceptionLines(raw: unknown): OrderPayload["percepciones_detalle"] {
  const out: OrderPayload["percepciones_detalle"] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const r = rec(p);
    const monto = num(r.amount ?? r.monto ?? r.importe ?? r.value);
    const concepto = text(r.label ?? r.desc ?? r.concepto ?? r.name);
    if (monto == null || !(Math.abs(monto) > EPS) || !concepto) continue;
    out.push({ concepto, jurisdiccion: text(r.jurisdiction ?? r.jurisdiccion ?? r.province) ?? jurisdictionIn(concepto), monto: r2(monto) });
  }
  return out;
}

const JURISDICTIONS: [RegExp, string][] = [
  [/\b(caba|c\.?a\.?b\.?a|capital federal|ciudad aut)/, "CABA"],
  [/\b(arba|buenos aires|bs\.? ?as|pba)\b/, "Buenos Aires"],
  [/\bcordoba\b/, "Córdoba"],
  [/\bsanta fe\b/, "Santa Fe"],
  [/\bmendoza\b/, "Mendoza"],
  [/\btucuman\b/, "Tucumán"],
];

function jurisdictionIn(label: string): string | null {
  const f = fold(label);
  for (const [re, name] of JURISDICTIONS) if (re.test(f)) return name;
  return null;
}

export function totalsFor(o: OrderRow, lines: OrderLine[]): Totals {
  const snap = rec(o.addressSnapshot);
  const draft = rec(o.draftInput);
  const subtotal = num(o.subtotal);
  const impuestos = num(o.impuestos);
  const percep = num(o.percepciones);
  const fromLines = ivaFromLines(lines);
  const linesNet = lines.length ? r2(lines.reduce((s, l) => s + l.total_linea, 0)) : null;
  const t: Totals = {
    neto: subtotal ?? linesNet,
    iva: null,
    iva105: null,
    iva21: null,
    internos: null,
    percepciones: percep,
    percepcionesDetalle: [],
    envio: null,
    cotizacion: null,
  };
  const ivaFrom = (total: number | null) => {
    t.iva = r2n(total);
    // Separación por alícuota: solo si los renglones la confirman.
    if (fromLines && total != null && Math.abs(fromLines.iva - total) <= 0.05) {
      t.iva105 = fromLines.iva105;
      t.iva21 = fromLines.iva21;
    }
  };

  if (o.channel === "OFFLINE" || o.status === "OFFLINE") {
    // Offline: `impuestos` guarda solo internos; el IVA sale de cada renglón.
    t.iva = fromLines?.iva ?? null;
    t.iva105 = fromLines?.iva105 ?? null;
    t.iva21 = fromLines?.iva21 ?? null;
    t.internos = internosFromLines(lines) ?? impuestos;
    t.percepciones = percep && percep > EPS ? percep : null;
    t.cotizacion = num(draft.quoteRate);
    return t;
  }

  switch (o.provider) {
    case "AIR": {
      const i21 = num(snap.iva21) ?? 0;
      const i105 = num(snap.iva105) ?? 0;
      t.iva = r2(i21 + i105);
      t.iva21 = r2(i21);
      t.iva105 = r2(i105);
      t.internos = r2n(num(snap.ii));
      break;
    }
    case "ELIT":
    case "INVID": {
      ivaFrom(num(snap.vat));
      t.internos = r2n(num(snap.internalTax));
      const ship = num(snap.shippingCost);
      if (ship != null && ship > EPS) t.envio = { monto: r2(ship), moneda: "USD" };
      if (o.provider === "ELIT") t.percepcionesDetalle = perceptionLines(snap.perceptionLines);
      const pct = num(snap.perceptionPercent);
      if (o.provider === "INVID" && pct != null && pct > 0 && percep != null && percep > EPS) {
        t.percepcionesDetalle = [{ concepto: `Percepciones ${String(r2(pct)).replace(".", ",")} %`, jurisdiccion: null, monto: r2(percep) }];
      }
      break;
    }
    case "NEW_BYTES": {
      ivaFrom(num(snap.vat) ?? impuestos);
      t.internos = internosFromLines(lines);
      const quote = rec(snap.quote);
      const ship = num(quote.total);
      if (ship != null && ship > EPS) t.envio = { monto: r2(ship), moneda: "ARS" };
      t.cotizacion = num(snap.exchangeRate);
      const label = text(snap.perceptionLabel);
      if (label && percep != null && percep > EPS) t.percepcionesDetalle = [{ concepto: label, jurisdiccion: jurisdictionIn(label), monto: r2(percep) }];
      break;
    }
    case "SOLUTION_BOX": {
      const vat = num(snap.vat);
      ivaFrom(vat);
      if (impuestos != null && vat != null) {
        const internos = impuestos - vat - (percep ?? 0);
        t.internos = internos > EPS ? r2(internos) : 0;
      }
      t.percepcionesDetalle = perceptionLines(snap.perceptionLines);
      t.cotizacion = num(snap.exchange);
      const ship = num(snap.shippingCost);
      if (ship != null && ship > EPS) t.envio = { monto: r2(ship), moneda: "USD" };
      break;
    }
    case "DISTECNA": {
      // `impuestos` = IVA + internos; el IVA sale de cada renglón (trae su %).
      if (fromLines) {
        t.iva = fromLines.iva;
        t.iva105 = fromLines.iva105;
        t.iva21 = fromLines.iva21;
        if (impuestos != null) t.internos = r2(Math.max(0, impuestos - fromLines.iva));
      }
      t.percepciones = null; // Distecna no cobra percepciones.
      break;
    }
    case "POLYTECH": {
      ivaFrom(impuestos);
      t.cotizacion = num(snap.exchangeRate);
      break;
    }
    case "NEW_TREE": {
      ivaFrom(impuestos);
      t.percepciones = null;
      break;
    }
    case "GRUPO_NUCLEO": {
      t.iva = fromLines?.iva ?? null;
      t.iva105 = fromLines?.iva105 ?? null;
      t.iva21 = fromLines?.iva21 ?? null;
      t.internos = internosFromLines(lines);
      t.percepciones = null;
      t.cotizacion = num(snap.usdExchange);
      break;
    }
    default: {
      // Pedido aprobado que todavía no se mandó, o distribuidor sin reglas: lo que haya.
      if (fromLines) {
        t.iva = fromLines.iva;
        t.iva105 = fromLines.iva105;
        t.iva21 = fromLines.iva21;
      }
      t.internos = internosFromLines(lines);
    }
  }
  return t;
}

// ---------- Pedido completo ----------

export function orderNumberLabel(n: number | null): string | null {
  return n == null ? null : `NODO-${n}`;
}

export function buildOrderPayload(
  o: OrderRow,
  ctx: {
    version: number;
    changedAt: Date;
    distributor: DistributorFacts;
    catalog: (code: string) => CatalogFacts | null;
    /** Comprobantes guardados del pedido. */
    documents?: OrderDocumentRow[];
    /** URL del PDF guardado (la arma la API). */
    documentUrl?: (orderId: string, documentId: string) => string;
  }
): OrderPayload {
  const docs = documentsPayload(o, ctx.documents ?? [], ctx.documentUrl);
  const lines = (Array.isArray(o.items) ? o.items : []).map((it) => lineOf(it, ctx.catalog)).filter((l): l is OrderLine => l !== null);
  const t = totalsFor(o, lines);
  const total = num(o.total);
  const parts = [t.neto, t.iva, t.internos, t.percepciones, t.envio?.moneda === "USD" ? t.envio.monto : 0].map((v) => v ?? 0);
  const sum = parts.reduce((a, b) => a + b, 0);
  const author = o.createdBy ?? o.user;
  const tracked = o.trackingStage || o.trackingStatus || o.trackingInvoice || o.trackingNumber;
  return {
    id: o.id,
    numero: orderNumberLabel(o.number),
    version: ctx.version,
    actualizado: ctx.changedAt.toISOString(),
    estado: orderState(o),
    canal: o.channel === "OFFLINE" || o.status === "OFFLINE" ? "offline" : "online",
    distribuidor: { clave: o.provider, nombre: ctx.distributor.name, cuit: ctx.distributor.cuit },
    numero_pedido_distribuidor: text(o.invidOrderNumber),
    numero_pedido_web_distribuidor: text(o.invidWebOrderNumber) !== text(o.invidOrderNumber) ? text(o.invidWebOrderNumber) : null,
    fecha: o.createdAt.toISOString(),
    creado_por: author ? { id: author.id, usuario: author.username } : null,
    aprobado_por: o.approvedBy ? { id: o.approvedBy.id, usuario: o.approvedBy.username } : null,
    aprobado_en: o.approvedBy && o.approvalDecidedAt ? o.approvalDecidedAt.toISOString() : null,
    motivo_rechazo: text(o.rejectionReason),
    moneda: "USD",
    cotizacion: r2n(t.cotizacion && t.cotizacion > 0 ? t.cotizacion : null),
    subtotal_neto: r2n(t.neto),
    iva: r2n(t.iva),
    iva_105: t.iva105,
    iva_21: t.iva21,
    impuestos_internos: r2n(t.internos),
    percepciones: r2n(t.percepciones),
    percepciones_detalle: t.percepcionesDetalle,
    envio: t.envio,
    total: r2n(total),
    desglose_cuadra: total != null && t.iva != null && Math.abs(sum - total) <= 0.05,
    entrega: { tipo: text(o.deliveryOption), detalle: text(o.deliveryLabel) },
    forma_pago: text(o.paymentLabel) ?? (o.paymentOption && o.paymentOption !== "OFFLINE" ? text(o.paymentOption) : null),
    notas: text(o.notes),
    factura: docs.facturas.find((f) => f.clase === "factura") ?? docs.facturas[0] ?? null,
    facturas: docs.facturas,
    remito: docs.remitos[0] ?? null,
    remitos: docs.remitos,
    seguimiento: tracked
      ? {
          etapa: text(o.trackingStage),
          estado_portal: text(o.trackingStatus),
          factura: text(o.trackingInvoice),
          numero_envio: text(o.trackingNumber),
          transporte: text(o.trackingCarrier),
          actualizado: o.trackingChangedAt ? o.trackingChangedAt.toISOString() : null,
        }
      : null,
    renglones: lines,
  };
}

/**
 * Número de factura tal como lo escribe el portal. Con formato fiscal
 * ("A 0003-00018422", "B-0001-00000009") se separa tipo, punto de venta y número;
 * un número interno del distribuidor (Elit: "2000240284") queda solo como está.
 */
export function parseInvoiceNumber(raw: string | null | undefined): { tipo: string | null; punto_venta: number | null; numero: number | null } | null {
  const t = text(raw);
  if (!t) return null;
  const m = /^(?:fc|fac|factura)?\s*([ABCEM])\s*[-\s]?\s*(\d{1,5})\s*-\s*(\d{1,8})$/i.exec(t);
  if (!m) return { tipo: null, punto_venta: null, numero: null };
  return { tipo: m[1].toUpperCase(), punto_venta: Number(m[2]), numero: Number(m[3]) };
}

const CLASS_OF: Record<string, InvoicePayload["clase"]> = { FACTURA: "factura", NOTA_CREDITO: "nota_credito", NOTA_DEBITO: "nota_debito" };

/**
 * Facturas y remitos del pedido: los guardados en NODO y, si no hay ninguna
 * factura guardada, la que informó el seguimiento del portal (solo el número).
 */
export function documentsPayload(
  o: Pick<OrderRow, "id" | "trackingInvoice">,
  documents: OrderDocumentRow[],
  documentUrl?: (orderId: string, documentId: string) => string
): { facturas: InvoicePayload[]; remitos: DeliveryNotePayload[] } {
  const url = (d: OrderDocumentRow) => (d.assetId && documentUrl ? documentUrl(o.id, d.id) : null);
  const sorted = [...documents].sort(
    (a, b) => (a.fechaEmision ?? "9").localeCompare(b.fechaEmision ?? "9") || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  // Un comprobante cuyo PDF todavía no se pudo bajar no aporta nada.
  const facturas: InvoicePayload[] = sorted
    .filter((d) => CLASS_OF[d.kind] && d.assetId)
    .map((d) => {
      const fiscal = d.origen === "qr" || d.origen === "texto";
      const fromPortal = parseInvoiceNumber(d.portalNumber);
      return {
        clase: CLASS_OF[d.kind],
        numero_portal: text(d.portalNumber),
        tipo: fiscal ? d.tipo : fromPortal?.tipo ?? null,
        punto_venta: fiscal ? d.puntoVenta : fromPortal?.punto_venta ?? null,
        numero: fiscal ? d.numero : fromPortal?.numero ?? null,
        fecha_emision: fiscal ? d.fechaEmision : null,
        cae: fiscal ? d.cae : null,
        cae_vencimiento: fiscal ? d.caeVencimiento : null,
        cuit_emisor: fiscal ? d.cuitEmisor : null,
        importe_total: fiscal ? r2n(num(d.importeTotal)) : null,
        moneda: fiscal ? d.moneda : null,
        cotizacion: fiscal ? num(d.cotizacion) : null,
        pdf_url: url(d),
        origen: fiscal ? (d.origen as "qr" | "texto") : "portal",
      };
    });
  if (!facturas.some((f) => f.clase === "factura")) {
    const portal = text(o.trackingInvoice);
    const parsed = parseInvoiceNumber(portal);
    if (portal && parsed) {
      facturas.unshift({
        clase: "factura",
        numero_portal: portal,
        ...parsed,
        fecha_emision: null,
        cae: null,
        cae_vencimiento: null,
        cuit_emisor: null,
        importe_total: null,
        moneda: null,
        cotizacion: null,
        pdf_url: null,
        origen: "portal",
      });
    }
  }
  const remitos: DeliveryNotePayload[] = sorted
    .filter((d) => d.kind === "REMITO" && d.assetId)
    .map((d) => ({ numero: text(d.portalNumber), fecha: d.fechaEmision, pdf_url: url(d) }));
  return { facturas, remitos };
}

/** ¿El pedido ya tiene una factura con datos fiscales (QR o texto del PDF)? */
export function hasFiscalInvoice(p: Pick<OrderPayload, "facturas">): boolean {
  return p.facturas.some((f) => f.clase === "factura" && f.origen !== "portal");
}

/** Hash de lo que importa a quien lee: sin la versión ni la fecha de cambio (las pone la API). */
export function payloadHash(p: OrderPayload): string {
  const { version: _v, actualizado: _a, ...rest } = p;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

// ---------- CUIT ----------

/** CUIT con dígito verificador válido (11 dígitos). */
export function validCuit(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  const mod = 11 - (sum % 11);
  const dv = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return dv === Number(d[10]);
}

/**
 * CUIT de cada distribuidor, solo los confirmados con una fuente oficial.
 * Los que faltan salen en `null`: el distribuidor se identifica por `clave`.
 * Para sumar uno: el CUIT tal como figura en una factura del distribuidor.
 */
export const DISTRIBUTOR_CUIT: Record<string, string> = {
  // Página de información al consumidor de HP Argentina (Grupo Nucleo S.A.).
  GRUPO_NUCLEO: "30-70933244-5",
  // QR de ARCA de sus facturas (prueba en modo lectura, 18/11/2026).
  ELIT: "30-65165551-6",
  SOLUTION_BOX: "30-70797502-0",
  // Datos oficiales de sus comprobantes (lio.red, el sistema de facturación de New Bytes).
  NEW_BYTES: "30-70865519-4",
};

export function distributorCuit(provider: string): string | null {
  const c = DISTRIBUTOR_CUIT[provider];
  return c && validCuit(c) ? c : null;
}
