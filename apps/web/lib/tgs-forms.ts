export type TgsFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "datetime" | "date";

export interface TgsField {
  name: string;
  label: string;
  type: TgsFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  default?: string | boolean;
  section?: string;
}

const MONEDA_OPTS = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

const ESTADO_VENTA = [
  { value: "pendiente", label: "pendiente" },
  { value: "pagada", label: "pagada" },
  { value: "completada", label: "completada" },
  { value: "anulada", label: "anulada" },
];

const ENTREGA_OPTS = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "Listo", label: "Listo" },
  { value: "Enviado", label: "Enviado" },
  { value: "Entregado", label: "Entregado" },
];

/**
 * Solo claves que aparecen en el GET de AcuStock (o el PATCH documentado).
 * No copiar labels de la UI del sistema: muchos no existen en la API.
 */
export const VENTA_FIELDS: TgsField[] = [
  { name: "cliente_id", label: "Cliente id", type: "number", required: true },
  { name: "fecha_emision", label: "Fecha de la venta", type: "datetime" },
  { name: "tipo_documento", label: "Tipo de documento", type: "text", placeholder: "venta / interno" },
  { name: "tipo_factura", label: "Tipo de factura", type: "text", placeholder: "A / B / C" },
  { name: "local_id", label: "Local", type: "number" },
  { name: "estado", label: "Estado de cobro", type: "select", options: ESTADO_VENTA },
];

export const LINE_FIELDS: TgsField[] = [
  { name: "descripcion", label: "Producto", type: "text", required: true },
  { name: "producto_id", label: "Id producto", type: "number" },
  { name: "cantidad", label: "Cant", type: "number", default: "1" },
  { name: "precio_unitario", label: "P. unitario", type: "number" },
  { name: "serie", label: "S/N", type: "text", placeholder: "si el producto es serializable" },
  { name: "estado_entrega", label: "Entrega", type: "select", options: ENTREGA_OPTS },
];

export const CLIENTE_FIELDS: TgsField[] = [
  { name: "nombre", label: "Nombre", type: "text", required: true },
  { name: "apellido", label: "Apellido", type: "text" },
  { name: "razon_social", label: "Razón social", type: "text" },
  { name: "cuit_dni", label: "CUIT / DNI", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "telefono", label: "Teléfono", type: "text" },
  { name: "tipo_iva", label: "Tipo IVA", type: "text" },
  { name: "ciudad", label: "Ciudad", type: "text" },
  { name: "provincia", label: "Provincia", type: "text" },
  { name: "lista_precio_id", label: "Lista de precio id", type: "number" },
  { name: "activo", label: "Activo", type: "checkbox", default: true },
];

export const COMPRA_FIELDS: TgsField[] = [
  { name: "proveedor_id", label: "Proveedor id", type: "number", required: true },
  { name: "fecha_emision", label: "Fecha de la compra", type: "datetime" },
  { name: "moneda", label: "Moneda", type: "select", options: MONEDA_OPTS },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    options: [
      { value: "pendiente", label: "pendiente" },
      { value: "completada", label: "completada" },
      { value: "anulada", label: "anulada" },
    ],
  },
];

export const ORDEN_FIELDS: TgsField[] = [
  { name: "cliente_id", label: "Cliente id", type: "number" },
  { name: "tecnico_id", label: "Técnico id", type: "number" },
  { name: "prioridad", label: "Prioridad", type: "text" },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    options: [
      { value: "recepcion", label: "recepcion" },
      { value: "en_proceso", label: "en_proceso" },
      { value: "presupuesto", label: "presupuesto" },
      { value: "completada", label: "completada" },
      { value: "entregado", label: "entregado" },
      { value: "anulado", label: "anulado" },
    ],
  },
  { name: "equipo_tipo", label: "Tipo de equipo", type: "text" },
  { name: "equipo_marca", label: "Marca", type: "text" },
  { name: "equipo_modelo", label: "Modelo", type: "text" },
  { name: "equipo_serie", label: "Serie", type: "text" },
  { name: "falla_reportada", label: "Falla reportada", type: "textarea", required: true },
  { name: "diagnostico", label: "Diagnóstico", type: "textarea" },
  { name: "solucion", label: "Solución", type: "textarea" },
  { name: "presupuesto_monto", label: "Presupuesto", type: "number" },
  { name: "costo_final", label: "Costo final", type: "number" },
  { name: "garantia_dias", label: "Garantía (días)", type: "number" },
];

export const RMA_CREATE_FIELDS: TgsField[] = [
  { name: "falla_reportada", label: "Falla reportada", type: "textarea", required: true },
  { name: "producto_nombre", label: "Producto", type: "text" },
  { name: "producto_serie", label: "Serie", type: "text" },
  { name: "cliente_id", label: "Cliente id", type: "number" },
  { name: "venta_id", label: "Venta id", type: "number" },
  { name: "venta_numero", label: "N° de venta", type: "text" },
  { name: "orden_trabajo_id", label: "Orden de trabajo id", type: "number" },
];

export const RMA_PATCH_FIELDS: TgsField[] = [
  {
    name: "estado",
    label: "Estado",
    type: "select",
    options: [
      { value: "recepcion", label: "recepcion" },
      { value: "en_proceso", label: "en_proceso" },
      { value: "cerrado", label: "cerrado" },
    ],
  },
  { name: "falla_reportada", label: "Falla reportada", type: "textarea" },
];

export const CTACTE_FIELDS: TgsField[] = [
  { name: "tipo", label: "Tipo", type: "text", required: true, placeholder: "como figura en AcuStock" },
  { name: "monto", label: "Monto", type: "number", required: true },
  { name: "concepto", label: "Concepto", type: "text" },
  { name: "fecha", label: "Fecha", type: "datetime" },
  { name: "referencia_tipo", label: "Tipo de referencia", type: "text", placeholder: "venta / compra" },
  { name: "referencia_id", label: "Id de referencia", type: "number" },
];

export const STOCK_FIELDS: TgsField[] = [
  { name: "sku", label: "SKU", type: "text", required: true },
  { name: "nombre", label: "Nombre", type: "text", required: true },
  { name: "tipo", label: "Tipo", type: "text" },
  { name: "categoria", label: "Categoría", type: "text" },
  { name: "marca", label: "Marca", type: "text" },
  { name: "precio", label: "Precio", type: "number" },
  { name: "moneda", label: "Moneda", type: "select", options: MONEDA_OPTS },
  { name: "stock", label: "Stock de depósito", type: "number" },
];

export const STOCK_CREATE_FIELDS = STOCK_FIELDS;

export type TgsDraftLine = Record<string, string>;

export function emptyLine(): TgsDraftLine {
  const line: TgsDraftLine = {};
  for (const field of LINE_FIELDS) {
    line[field.name] = field.default != null ? String(field.default) : "";
  }
  return line;
}

export function linesFromItems(items: unknown): TgsDraftLine[] {
  if (!Array.isArray(items) || items.length === 0) return [emptyLine()];
  return items.map((raw) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const line = emptyLine();
    for (const field of LINE_FIELDS) {
      const value = row[field.name];
      if (value != null && value !== "") line[field.name] = String(value);
    }
    if (!line.serie && row.sn != null && row.sn !== "") line.serie = String(row.sn);
    if (!line.estado_entrega) {
      const entrega = row.entrega ?? row.entrega_estado;
      if (entrega != null && entrega !== "") line.estado_entrega = String(entrega);
    }
    if (row.id != null) line.id = String(row.id);
    return line;
  });
}

function toDatetimeLocal(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  return text.replace(" ", "T").slice(0, 16);
}

function fromDatetimeLocal(text: string): string {
  const value = text.trim();
  if (!value) return value;
  const withSpace = value.replace("T", " ");
  return withSpace.length === 16 ? `${withSpace}:00` : withSpace;
}

export function valuesFromRecord(fields: TgsField[], record: Record<string, unknown> | null | undefined) {
  const out: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = record?.[field.name];
    if (field.type === "checkbox") {
      out[field.name] = raw == null ? Boolean(field.default) : Boolean(raw);
      continue;
    }
    if (raw == null || raw === "") {
      out[field.name] = field.default != null ? String(field.default) : "";
      continue;
    }
    if (field.type === "datetime") out[field.name] = toDatetimeLocal(raw);
    else if (field.type === "date") out[field.name] = String(raw).slice(0, 10);
    else out[field.name] = String(raw);
  }
  return out;
}

function coerceField(field: TgsField, raw: string | boolean | undefined): unknown {
  if (field.type === "checkbox") return Boolean(raw);
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  if (field.type === "number") {
    const n = Number(text.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.type === "datetime") return fromDatetimeLocal(text);
  return text;
}

export function payloadFromValues(
  fields: TgsField[],
  values: Record<string, string | boolean>,
  extra?: Record<string, unknown>
) {
  const body: Record<string, unknown> = { ...extra };
  for (const field of fields) {
    const coerced = coerceField(field, values[field.name]);
    if (field.type === "checkbox") {
      body[field.name] = coerced;
      continue;
    }
    if (coerced === undefined) continue;
    body[field.name] = coerced;
  }
  return body;
}

export function payloadFromLine(line: TgsDraftLine): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (line.id?.trim()) {
    const id = Number(line.id);
    if (Number.isFinite(id)) body.id = id;
  }
  for (const field of LINE_FIELDS) {
    const coerced = coerceField(field, line[field.name]);
    if (coerced === undefined) continue;
    body[field.name] = coerced;
  }
  return body;
}
