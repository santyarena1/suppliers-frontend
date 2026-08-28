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

const IVA_OPTS = [
  { value: "0", label: "0%" },
  { value: "10.5", label: "10.5%" },
  { value: "21", label: "21%" },
  { value: "27", label: "27%" },
];

const ENTREGA_OPTS = [
  { value: "Pendiente", label: "Pendiente" },
  { value: "En preparación", label: "En preparación" },
  { value: "Listo", label: "Listo" },
  { value: "Enviado", label: "Enviado" },
  { value: "Entregado", label: "Entregado" },
];

const SI_NO = [
  { value: "No", label: "No" },
  { value: "Sí", label: "Sí" },
];

const MONEDA_OPTS = [
  { value: "ARS", label: "ARS $" },
  { value: "USD", label: "USD U$S" },
];

const ESTADO_VENTA = [
  { value: "pendiente", label: "pendiente" },
  { value: "pagada", label: "pagada" },
  { value: "completada", label: "completada" },
  { value: "anulada", label: "anulada" },
];

/** Encabezado y totales de Nueva Venta (AcuStock). */
export const VENTA_FIELDS: TgsField[] = [
  { name: "cliente_id", label: "Cliente id", type: "number", required: true, section: "Comprobante", placeholder: "número, nombre o DNI/CUIT" },
  { name: "fecha_emision", label: "Fecha de la venta", type: "datetime", section: "Comprobante" },
  {
    name: "tipo_operacion",
    label: "Tipo de operación",
    type: "select",
    section: "Comprobante",
    default: "Venta directa",
    options: [
      { value: "Venta directa", label: "Venta directa" },
      { value: "Pedido", label: "Pedido" },
      { value: "Presupuesto", label: "Presupuesto" },
      { value: "Mercado Libre", label: "Mercado Libre" },
      { value: "WooCommerce", label: "WooCommerce" },
    ],
  },
  {
    name: "tipo_comprobante",
    label: "Tipo de comprobante",
    type: "select",
    section: "Comprobante",
    default: "Comprobante Interno",
    options: [
      { value: "Comprobante Interno", label: "Comprobante Interno" },
      { value: "Factura A", label: "Factura A" },
      { value: "Factura B", label: "Factura B" },
      { value: "Factura C", label: "Factura C" },
      { value: "Nota de crédito", label: "Nota de crédito" },
      { value: "Remito", label: "Remito" },
    ],
  },
  { name: "tipo_documento", label: "Tipo de documento", type: "text", section: "Comprobante", placeholder: "como figura en AcuStock" },
  { name: "tipo_factura", label: "Tipo de factura", type: "text", section: "Comprobante", placeholder: "A / B / C" },
  { name: "deposito_id", label: "Depósito default", type: "text", section: "Comprobante", placeholder: "Depósito Principal (default)" },
  {
    name: "lleva_envio",
    label: "¿Lleva envío?",
    type: "select",
    section: "Comprobante",
    default: "No",
    options: SI_NO,
  },
  { name: "etiquetas", label: "Etiquetas", type: "text", section: "Comprobante", placeholder: "Sin etiquetas" },
  {
    name: "estado_woo_ml",
    label: "Estado Woo / ML",
    type: "select",
    section: "Comprobante",
    default: "En Proceso",
    options: [
      { value: "En Proceso", label: "En Proceso" },
      { value: "Publicado", label: "Publicado" },
      { value: "Pausado", label: "Pausado" },
      { value: "Completado", label: "Completado" },
      { value: "Sin publicar", label: "Sin publicar" },
    ],
  },
  {
    name: "entrega",
    label: "Entrega",
    type: "select",
    section: "Comprobante",
    default: "Pendiente",
    options: ENTREGA_OPTS,
  },
  { name: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date", section: "Comprobante" },
  { name: "local_id", label: "Local / PV", type: "number", section: "Comprobante" },
  { name: "estado", label: "Estado de cobro", type: "select", section: "Comprobante", default: "pendiente", options: ESTADO_VENTA },
  { name: "lista_precio", label: "Lista de precio", type: "text", section: "Comprobante", default: "Publica", placeholder: "Publica (Publica)" },
  { name: "lista_precio_id", label: "Lista de precio id", type: "number", section: "Comprobante" },
  { name: "solo_web", label: "Solo web", type: "checkbox", section: "Comprobante" },
  { name: "descuento_general", label: "Descuento general %", type: "number", section: "Totales", default: "0" },
  {
    name: "al_cambiar_iva",
    label: "Al cambiar IVA",
    type: "select",
    section: "Totales",
    default: "mantener_precio",
    options: [
      { value: "mantener_precio", label: "Mantener precio" },
      { value: "recalcular", label: "Recalcular precio" },
    ],
  },
  { name: "costo_envio", label: "Costo envío (gasto)", type: "number", section: "Totales", default: "0" },
  { name: "cargos_extras", label: "Cargos extras", type: "number", section: "Totales", default: "0" },
  { name: "percepcion_iva", label: "Percepción IVA", type: "number", section: "Totales", default: "0" },
  { name: "moneda", label: "Moneda del comprobante", type: "select", section: "Totales", default: "ARS", options: MONEDA_OPTS },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Totales" },
];

/** Columnas de ítem al armar una venta en AcuStock. */
export const LINE_FIELDS: TgsField[] = [
  { name: "descripcion", label: "Producto", type: "text", required: true, placeholder: "Nombre, SKU, código de barras o serie…" },
  { name: "sku", label: "SKU", type: "text" },
  { name: "producto_id", label: "Id producto", type: "number" },
  { name: "item_libre", label: "Item libre", type: "checkbox" },
  { name: "cantidad", label: "Cant", type: "number", default: "1" },
  { name: "costo_usd", label: "Costo USD", type: "number" },
  { name: "cotizacion", label: "Cotiz.", type: "number" },
  { name: "costo_ars", label: "Costo ARS", type: "number" },
  { name: "rentabilidad_pct", label: "Rent.%", type: "number", default: "15" },
  { name: "precio_unitario", label: "P. unit. ARS", type: "number", default: "0" },
  { name: "descuento_pct", label: "Desc%", type: "number", default: "0" },
  { name: "iva", label: "IVA", type: "select", default: "10.5", options: IVA_OPTS },
  { name: "impuesto_interno", label: "Imp. int.", type: "number", default: "0" },
  { name: "serie", label: "S/N", type: "text", placeholder: "S/N 1" },
  { name: "origen", label: "Origen", type: "text", placeholder: "Local Principal - Depósito Principal" },
  { name: "deposito_id", label: "Depósito id", type: "number" },
  { name: "estado_entrega", label: "Entrega", type: "select", default: "Pendiente", options: ENTREGA_OPTS },
  { name: "etiquetas", label: "Etiquetas", type: "text" },
  { name: "proveedor", label: "Proveedor", type: "text" },
  { name: "proveedor_id", label: "Proveedor id", type: "number" },
];

export const CLIENTE_FIELDS: TgsField[] = [
  { name: "nombre", label: "Nombre", type: "text", required: true, section: "Datos" },
  { name: "apellido", label: "Apellido", type: "text", section: "Datos" },
  { name: "razon_social", label: "Razón social", type: "text", section: "Datos" },
  { name: "cuit_dni", label: "CUIT / DNI", type: "text", section: "Datos" },
  { name: "email", label: "Email", type: "text", section: "Datos" },
  { name: "telefono", label: "Teléfono", type: "text", section: "Datos" },
  { name: "celular", label: "Celular / WhatsApp", type: "text", section: "Datos" },
  { name: "tipo_iva", label: "Tipo IVA", type: "text", section: "Datos", placeholder: "RI / monotributo / CF" },
  { name: "direccion", label: "Dirección", type: "text", section: "Datos" },
  { name: "ciudad", label: "Ciudad", type: "text", section: "Datos" },
  { name: "provincia", label: "Provincia", type: "text", section: "Datos" },
  { name: "codigo_postal", label: "Código postal", type: "text", section: "Datos" },
  { name: "lista_precio_id", label: "Lista de precio id", type: "number", section: "Datos" },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Datos" },
  { name: "activo", label: "Activo", type: "checkbox", default: true, section: "Datos" },
];

export const COMPRA_FIELDS: TgsField[] = [
  { name: "proveedor_id", label: "Proveedor id", type: "number", required: true, section: "Comprobante" },
  { name: "fecha_emision", label: "Fecha de la compra", type: "datetime", section: "Comprobante" },
  { name: "tipo_comprobante", label: "Tipo de comprobante", type: "text", section: "Comprobante", placeholder: "Factura / interno" },
  { name: "deposito_id", label: "Depósito default", type: "text", section: "Comprobante" },
  { name: "moneda", label: "Moneda", type: "select", section: "Comprobante", default: "ARS", options: MONEDA_OPTS },
  { name: "cotizacion", label: "Cotización", type: "number", section: "Comprobante" },
  { name: "lleva_envio", label: "¿Lleva envío?", type: "select", section: "Comprobante", default: "No", options: SI_NO },
  { name: "etiquetas", label: "Etiquetas", type: "text", section: "Comprobante" },
  { name: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date", section: "Comprobante" },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    section: "Comprobante",
    options: [
      { value: "pendiente", label: "pendiente" },
      { value: "completada", label: "completada" },
      { value: "anulada", label: "anulada" },
    ],
  },
  { name: "descuento_general", label: "Descuento general %", type: "number", section: "Totales", default: "0" },
  { name: "costo_envio", label: "Costo envío (gasto)", type: "number", section: "Totales", default: "0" },
  { name: "cargos_extras", label: "Cargos extras", type: "number", section: "Totales", default: "0" },
  { name: "percepcion_iva", label: "Percepción IVA", type: "number", section: "Totales", default: "0" },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Totales" },
];

export const ORDEN_FIELDS: TgsField[] = [
  { name: "cliente_id", label: "Cliente id", type: "number", section: "Orden" },
  { name: "tecnico_id", label: "Técnico id", type: "number", section: "Orden" },
  { name: "prioridad", label: "Prioridad", type: "text", section: "Orden", placeholder: "normal / alta / urgente" },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    section: "Orden",
    options: [
      { value: "recepcion", label: "recepcion" },
      { value: "en_proceso", label: "en_proceso" },
      { value: "presupuesto", label: "presupuesto" },
      { value: "completada", label: "completada" },
      { value: "entregado", label: "entregado" },
      { value: "anulado", label: "anulado" },
    ],
  },
  { name: "fecha_ingreso", label: "Fecha de ingreso", type: "datetime", section: "Orden" },
  { name: "fecha_presupuesto", label: "Fecha de presupuesto", type: "datetime", section: "Orden" },
  { name: "fecha_completado", label: "Fecha completado", type: "datetime", section: "Orden" },
  { name: "fecha_entrega", label: "Fecha de entrega", type: "datetime", section: "Orden" },
  { name: "equipo_tipo", label: "Tipo de equipo", type: "text", section: "Equipo" },
  { name: "equipo_marca", label: "Marca", type: "text", section: "Equipo" },
  { name: "equipo_modelo", label: "Modelo", type: "text", section: "Equipo" },
  { name: "equipo_serie", label: "Serie", type: "text", section: "Equipo" },
  { name: "accesorios", label: "Accesorios", type: "text", section: "Equipo" },
  { name: "falla_reportada", label: "Falla reportada", type: "textarea", required: true, section: "Servicio" },
  { name: "diagnostico", label: "Diagnóstico", type: "textarea", section: "Servicio" },
  { name: "solucion", label: "Solución", type: "textarea", section: "Servicio" },
  { name: "presupuesto_monto", label: "Presupuesto", type: "number", section: "Servicio" },
  { name: "costo_final", label: "Costo final", type: "number", section: "Servicio" },
  { name: "garantia_dias", label: "Garantía (días)", type: "number", section: "Servicio" },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Servicio" },
];

export const RMA_FIELDS: TgsField[] = [
  { name: "falla_reportada", label: "Falla reportada", type: "textarea", required: true, section: "Caso" },
  { name: "producto_nombre", label: "Producto", type: "text", section: "Caso" },
  { name: "producto_serie", label: "Serie", type: "text", section: "Caso" },
  { name: "producto_id", label: "Producto id", type: "number", section: "Caso" },
  { name: "cliente_id", label: "Cliente id", type: "number", section: "Caso" },
  { name: "venta_id", label: "Venta id", type: "number", section: "Caso" },
  { name: "venta_numero", label: "N° de venta", type: "text", section: "Caso" },
  { name: "orden_trabajo_id", label: "Orden de trabajo id", type: "number", section: "Caso" },
  { name: "proveedor_id", label: "Proveedor id", type: "number", section: "Caso" },
  {
    name: "estado",
    label: "Estado",
    type: "select",
    section: "Caso",
    default: "recepcion",
    options: [
      { value: "recepcion", label: "recepcion" },
      { value: "en_proceso", label: "en_proceso" },
      { value: "cerrado", label: "cerrado" },
    ],
  },
  { name: "diagnostico", label: "Diagnóstico", type: "textarea", section: "Caso" },
  { name: "resolucion", label: "Resolución", type: "textarea", section: "Caso" },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Caso" },
];

export const RMA_PATCH_FIELDS = RMA_FIELDS;
export const RMA_CREATE_FIELDS = RMA_FIELDS;

export const CTACTE_FIELDS: TgsField[] = [
  { name: "tipo", label: "Tipo", type: "text", required: true, placeholder: "como figura en AcuStock" },
  { name: "monto", label: "Monto", type: "number", required: true },
  { name: "concepto", label: "Concepto", type: "text" },
  { name: "fecha", label: "Fecha", type: "datetime" },
  { name: "referencia_tipo", label: "Tipo de referencia", type: "text", placeholder: "venta / compra / pago" },
  { name: "referencia_id", label: "Id de referencia", type: "number" },
  { name: "moneda", label: "Moneda", type: "select", default: "ARS", options: MONEDA_OPTS },
  { name: "observaciones", label: "Observaciones", type: "textarea" },
];

export const STOCK_FIELDS: TgsField[] = [
  { name: "sku", label: "SKU", type: "text", required: true, section: "Producto" },
  { name: "nombre", label: "Nombre", type: "text", required: true, section: "Producto" },
  { name: "codigo_barras", label: "Código de barras", type: "text", section: "Producto" },
  { name: "tipo", label: "Tipo", type: "text", section: "Producto" },
  { name: "categoria", label: "Categoría", type: "text", section: "Producto" },
  { name: "marca", label: "Marca", type: "text", section: "Producto" },
  { name: "descripcion", label: "Descripción", type: "textarea", section: "Producto" },
  { name: "precio", label: "Precio", type: "number", section: "Precios" },
  { name: "costo", label: "Costo", type: "number", section: "Precios" },
  { name: "moneda", label: "Moneda", type: "select", section: "Precios", default: "ARS", options: MONEDA_OPTS },
  { name: "iva", label: "IVA", type: "select", section: "Precios", default: "21", options: IVA_OPTS },
  { name: "lista_precio_id", label: "Lista de precio id", type: "number", section: "Precios" },
  { name: "stock", label: "Stock de depósito", type: "number", section: "Stock" },
  { name: "stock_deposito", label: "Stock depósito (alt)", type: "number", section: "Stock" },
  { name: "deposito_id", label: "Depósito id", type: "number", section: "Stock" },
  { name: "serializable", label: "Serializable", type: "checkbox", section: "Stock" },
  { name: "web", label: "Publicar web", type: "checkbox", section: "Stock" },
  { name: "proveedor_id", label: "Proveedor id", type: "number", section: "Stock" },
  { name: "sku_proveedor", label: "SKU proveedor", type: "text", section: "Stock" },
  { name: "observaciones", label: "Observaciones", type: "textarea", section: "Stock" },
];

export const STOCK_CREATE_FIELDS = STOCK_FIELDS;

export type TgsDraftLine = Record<string, string>;

export function emptyLine(): TgsDraftLine {
  const line: TgsDraftLine = {};
  for (const field of LINE_FIELDS) {
    if (field.type === "checkbox") line[field.name] = field.default ? "true" : "";
    else line[field.name] = field.default != null ? String(field.default) : "";
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
      if (field.type === "checkbox") {
        line[field.name] = value === true || value === "true" || value === 1 || value === "1" ? "true" : "";
        continue;
      }
      if (value != null && value !== "") line[field.name] = String(value);
    }
    if (!line.serie && row.sn != null && row.sn !== "") line.serie = String(row.sn);
    if (!line.serie && row.nro_serie != null && row.nro_serie !== "") line.serie = String(row.nro_serie);
    if (!line.estado_entrega) {
      const entrega = row.entrega ?? row.entrega_estado ?? row.estado_item;
      if (entrega != null && entrega !== "") line.estado_entrega = String(entrega);
    }
    if (!line.etiquetas && Array.isArray(row.etiquetas)) line.etiquetas = row.etiquetas.map(String).join(", ");
    if (!line.proveedor && row.proveedor_nombre != null) line.proveedor = String(row.proveedor_nombre);
    if (row.id != null) line.id = String(row.id);
    return line;
  });
}

const SKIP_WRITE = new Set(["meta", "movimientos", "display_name", "scopes", "modules"]);

export function recordForWrite(record?: Record<string, unknown> | null): Record<string, unknown> {
  if (!record) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SKIP_WRITE.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function extraFieldsFromRecord(fields: TgsField[], record?: Record<string, unknown> | null): TgsField[] {
  if (!record) return [];
  const known = new Set(fields.map((field) => field.name));
  known.add("items");
  known.add("id");
  const extra: TgsField[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (known.has(key) || SKIP_WRITE.has(key)) continue;
    if (value != null && typeof value === "object") continue;
    extra.push({
      name: key,
      label: key.replace(/_/g, " "),
      type: typeof value === "boolean" ? "checkbox" : typeof value === "number" ? "number" : "text",
      section: "Otros campos de AcuStock",
    });
  }
  return extra;
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
    if (field.type === "checkbox") {
      if (coerced) body[field.name] = true;
      continue;
    }
    if (coerced === undefined) continue;
    body[field.name] = coerced;
  }
  return body;
}
