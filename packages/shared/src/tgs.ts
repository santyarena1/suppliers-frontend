/**
 * Tipos del módulo SISTEMA TGS (proxy a AcuStock API de sistema).
 * Los campos siguen el JSON real de thegamershop.acustock.app — no inventar.
 */

export type TgsScopeLevel = "off" | "read" | "read_write";

export const TGS_MODULES = [
  "clientes",
  "stock",
  "ventas",
  "compras",
  "ctacte",
  "ordenes",
  "rma",
] as const;

export type TgsModule = (typeof TGS_MODULES)[number];

export interface TgsPageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  local_id?: number;
}

export interface TgsList<T> {
  items: T[];
  meta: TgsPageMeta;
}

export interface TgsMe {
  tenant: string;
  key_name: string;
  key_public: string;
  scopes: Record<TgsModule, TgsScopeLevel>;
  modules: TgsModule[];
  local_id: number;
}

export type TgsKeysSource = "db" | "env" | "none";

/** Estado de las claves AcuStock. El secret nunca se devuelve. */
export interface TgsKeysStatus {
  configured: boolean;
  source: TgsKeysSource;
  keyHint: string | null;
  secretConfigured: boolean;
  baseUrl: string;
  verified?: boolean;
  verifyError?: string | null;
  tenant?: string;
  key_name?: string;
}

export interface TgsCliente {
  id: number;
  nombre: string;
  apellido: string | null;
  razon_social: string | null;
  display_name: string;
  cuit_dni: string | null;
  email: string | null;
  telefono: string | null;
  tipo_iva: string | null;
  activo: boolean;
  saldo_cuenta: number;
  lista_precio_id: number | null;
  ciudad: string | null;
  provincia: string | null;
  direccion?: string | null;
  codigo_postal?: string | null;
  celular?: string | null;
  observaciones?: string | null;
  [key: string]: unknown;
}

export interface TgsStockItem {
  id: number;
  sku: string;
  nombre: string;
  tipo: string | null;
  categoria: string | null;
  marca: string | null;
  stock_deposito: number;
  stock_catalogo: number;
  comprometido: number;
  disponible: number;
  precio: number;
  precio_manual?: boolean;
  moneda: string;
  codigo_barras?: string | null;
  costo?: number | null;
  iva?: number | string | null;
  serializable?: boolean | null;
  descripcion?: string | null;
  proveedor_id?: number | null;
  [key: string]: unknown;
}

export interface TgsLinea {
  id: number;
  producto_id: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  sku?: string | null;
  costo_usd?: number | null;
  cotizacion?: number | null;
  costo_ars?: number | null;
  rentabilidad_pct?: number | null;
  descuento_pct?: number | null;
  iva?: number | string | null;
  impuesto_interno?: number | null;
  serie?: string | null;
  origen?: string | null;
  deposito_id?: number | null;
  /** Estado de entrega del ítem (pendiente, listo, enviado, entregado…). No es el cobro de la venta. */
  estado_entrega?: string | null;
  entrega?: string | null;
  etiquetas?: unknown;
  proveedor?: string | null;
  proveedor_nombre?: string | null;
  proveedor_id?: number | null;
  [key: string]: unknown;
}

export interface TgsVenta {
  id: number;
  numero: string;
  fecha_emision: string;
  estado: string;
  tipo_documento: string | null;
  tipo_factura: string | null;
  total: number;
  total_pagado: number;
  local_id: number | null;
  cliente_id: number | null;
  cliente: string | null;
  cae: string | null;
  tipo_operacion?: string | null;
  tipo_comprobante?: string | null;
  deposito_id?: number | null;
  lleva_envio?: string | boolean | null;
  etiquetas?: unknown;
  estado_woo_ml?: string | null;
  entrega?: string | null;
  fecha_vencimiento?: string | null;
  lista_precio?: string | null;
  lista_precio_id?: number | null;
  descuento_general?: number | null;
  al_cambiar_iva?: string | null;
  costo_envio?: number | null;
  cargos_extras?: number | null;
  percepcion_iva?: number | null;
  moneda?: string | null;
  observaciones?: string | null;
  items?: TgsLinea[];
  [key: string]: unknown;
}

export const TGS_SOLD_SORTS = [
  "fecha",
  "venta",
  "cliente",
  "producto",
  "cantidad",
  "precio",
  "subtotal",
  "estado",
  "entrega",
] as const;

export type TgsSoldSort = (typeof TGS_SOLD_SORTS)[number];

/** Una línea de venta, para el reporte Productos vendidos. */
export interface TgsProductoVendido {
  venta_id: number;
  venta_numero: string;
  fecha_emision: string;
  local_id: number | null;
  cliente_id: number | null;
  cliente: string | null;
  /** Estado de cobro del comprobante (pagada, pendiente…). */
  estado: string;
  /** Estado de entrega del producto. */
  estado_entrega: string | null;
  /** Clave real que mandó AcuStock para el estado de entrega (para el PATCH). */
  entrega_key: string | null;
  etiquetas: string[];
  proveedor: string | null;
  proveedor_id: number | null;
  item_id: number;
  producto_id: number | null;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface TgsProductosVendidosResult {
  items: TgsProductoVendido[];
  meta: TgsPageMeta;
  ventas: number;
  truncated: boolean;
}

export interface TgsCompra {
  id: number;
  numero: string;
  fecha_emision: string;
  estado: string;
  total: number;
  total_ars: number | null;
  moneda: string | null;
  local_id: number | null;
  proveedor_id: number | null;
  proveedor: string | null;
  tipo_comprobante?: string | null;
  deposito_id?: number | null;
  cotizacion?: number | null;
  observaciones?: string | null;
  items?: TgsLinea[];
  [key: string]: unknown;
}

export interface TgsMovimiento {
  id: number;
  tipo: string;
  monto: number;
  saldo_anterior: number;
  saldo_nuevo: number;
  concepto: string | null;
  referencia_tipo: string | null;
  referencia_id: number | null;
  fecha: string;
}

export interface TgsCuentaCorriente {
  tipo: "cliente" | "proveedor" | string;
  id: number;
  nombre: string;
  saldo: number;
  movimientos: TgsMovimiento[];
}

export interface TgsOrden {
  id: number;
  numero: string;
  estado: string;
  prioridad: string | null;
  local_id: number | null;
  cliente_id: number | null;
  cliente: string | null;
  tecnico_id: number | null;
  equipo_tipo: string | null;
  equipo_marca: string | null;
  equipo_modelo: string | null;
  equipo_serie: string | null;
  falla_reportada: string | null;
  diagnostico: string | null;
  solucion: string | null;
  presupuesto_monto: number | null;
  costo_final: number | null;
  garantia_dias: number | null;
  fecha_ingreso: string | null;
  fecha_presupuesto: string | null;
  fecha_completado: string | null;
  fecha_entrega: string | null;
  tracking_token: string | null;
  tracking_url: string | null;
  accesorios?: string | null;
  observaciones?: string | null;
  [key: string]: unknown;
}

export interface TgsRma {
  id: number;
  numero?: string | null;
  estado: string;
  falla_reportada?: string | null;
  producto_nombre?: string | null;
  producto_serie?: string | null;
  cliente_id?: number | null;
  cliente?: string | null;
  venta_id?: number | null;
  orden_trabajo_id?: number | null;
  [key: string]: unknown;
}

export interface TgsPatchStock {
  nombre?: string;
  precio?: number;
  stock?: number;
  [key: string]: unknown;
}

export interface TgsCreateRma {
  falla_reportada: string;
  producto_nombre?: string;
  producto_serie?: string;
  cliente_id?: number;
  venta_id?: number;
  venta_numero?: string;
  orden_trabajo_id?: number;
  [key: string]: unknown;
}
