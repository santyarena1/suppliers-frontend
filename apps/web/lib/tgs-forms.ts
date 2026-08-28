export type TgsFieldType = "text" | "number" | "textarea" | "select" | "checkbox";

export interface TgsField {
  name: string;
  label: string;
  type: TgsFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

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
  { name: "activo", label: "Activo", type: "checkbox" },
];

export const VENTA_FIELDS: TgsField[] = [
  { name: "cliente_id", label: "Cliente id", type: "number", required: true },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    options: [
      { value: "pendiente", label: "pendiente" },
      { value: "pagada", label: "pagada" },
      { value: "completada", label: "completada" },
      { value: "anulada", label: "anulada" },
    ],
  },
];

export const COMPRA_FIELDS: TgsField[] = [
  { name: "proveedor_id", label: "Proveedor id", type: "number", required: true },
  { name: "moneda", label: "Moneda", type: "text", placeholder: "ARS o USD" },
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
];

export const STOCK_CREATE_FIELDS: TgsField[] = [
  { name: "sku", label: "SKU", type: "text", required: true },
  { name: "nombre", label: "Nombre", type: "text", required: true },
  { name: "precio", label: "Precio", type: "number" },
  { name: "stock", label: "Stock de depósito", type: "number" },
];

export interface TgsDraftLine {
  producto_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
}

export function emptyLine(): TgsDraftLine {
  return { producto_id: "", descripcion: "", cantidad: "1", precio_unitario: "" };
}

export function valuesFromRecord(fields: TgsField[], record: Record<string, unknown> | null | undefined) {
  const out: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = record?.[field.name];
    if (field.type === "checkbox") out[field.name] = Boolean(raw);
    else if (raw == null) out[field.name] = "";
    else out[field.name] = String(raw);
  }
  return out;
}

export function payloadFromValues(fields: TgsField[], values: Record<string, string | boolean>, extra?: Record<string, unknown>) {
  const body: Record<string, unknown> = { ...extra };
  for (const field of fields) {
    const raw = values[field.name];
    if (field.type === "checkbox") {
      body[field.name] = Boolean(raw);
      continue;
    }
    const text = String(raw ?? "").trim();
    if (!text) continue;
    if (field.type === "number") {
      const n = Number(text.replace(",", "."));
      if (Number.isFinite(n)) body[field.name] = n;
      continue;
    }
    body[field.name] = text;
  }
  return body;
}
