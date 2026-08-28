import api from "./api";

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
}

export interface TgsLinea {
  id: number;
  producto_id: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
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
  items?: TgsLinea[];
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
  items?: TgsLinea[];
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
  tipo: string;
  id: number;
  nombre: string;
  saldo: number;
  movimientos: TgsMovimiento[];
  meta?: TgsPageMeta;
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

export interface TgsProductoVendido {
  venta_id: number;
  venta_numero: string;
  fecha_emision: string;
  local_id: number | null;
  cliente_id: number | null;
  cliente: string | null;
  estado: string;
  item_id: number;
  producto_id: number | null;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface TgsProductosVendidos {
  items: TgsProductoVendido[];
  meta: TgsPageMeta;
  ventas: number;
  truncated: boolean;
}

export interface TgsCreateRma {
  falla_reportada: string;
  producto_nombre?: string;
  producto_serie?: string;
  cliente_id?: number;
  venta_id?: number;
  venta_numero?: string;
  orden_trabajo_id?: number;
}

export const tgsApi = {
  enabled: () => api.get<{ enabled: boolean }>("/tgs/enabled"),
  keys: () => api.get<TgsKeysStatus>("/tgs/keys"),
  saveKeys: (data: { apiKey: string; apiSecret: string; baseUrl?: string }) =>
    api.put<TgsKeysStatus>("/tgs/keys", data),
  clearKeys: () => api.delete<TgsKeysStatus>("/tgs/keys"),
  me: () => api.get<TgsMe>("/tgs/me"),
  clientes: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsCliente>>("/tgs/clientes", { params }),
  cliente: (id: string | number) => api.get<TgsCliente>(`/tgs/clientes/${id}`),
  createCliente: (data: Record<string, unknown>) => api.post<TgsCliente>("/tgs/clientes", data),
  patchCliente: (id: string | number, data: Record<string, unknown>) =>
    api.patch<TgsCliente>(`/tgs/clientes/${id}`, data),
  stock: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsStockItem>>("/tgs/stock", { params }),
  stockOne: (id: string | number) => api.get<TgsStockItem>(`/tgs/stock/${encodeURIComponent(String(id))}`),
  createStock: (data: Record<string, unknown>) => api.post<TgsStockItem>("/tgs/stock", data),
  patchStock: (id: string | number, data: { nombre?: string; precio?: number; stock?: number }) =>
    api.patch<TgsStockItem>(`/tgs/stock/${encodeURIComponent(String(id))}`, data),
  ventas: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsVenta>>("/tgs/ventas", { params }),
  productosVendidos: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsProductosVendidos>("/tgs/productos-vendidos", { params }),
  venta: (id: string | number) => api.get<TgsVenta>(`/tgs/ventas/${id}`),
  createVenta: (data: Record<string, unknown>) => api.post<TgsVenta>("/tgs/ventas", data),
  patchVenta: (id: string | number, data: Record<string, unknown>) => api.patch<TgsVenta>(`/tgs/ventas/${id}`, data),
  compras: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsCompra>>("/tgs/compras", { params }),
  compra: (id: string | number) => api.get<TgsCompra>(`/tgs/compras/${id}`),
  createCompra: (data: Record<string, unknown>) => api.post<TgsCompra>("/tgs/compras", data),
  patchCompra: (id: string | number, data: Record<string, unknown>) =>
    api.patch<TgsCompra>(`/tgs/compras/${id}`, data),
  ctacteCliente: (id: string | number, params?: Record<string, string | number | undefined>) =>
    api.get<TgsCuentaCorriente>(`/tgs/ctacte/clientes/${id}`, { params }),
  ctacteProveedor: (id: string | number, params?: Record<string, string | number | undefined>) =>
    api.get<TgsCuentaCorriente>(`/tgs/ctacte/proveedores/${id}`, { params }),
  postCtaCliente: (id: string | number, data: Record<string, unknown>) =>
    api.post<TgsCuentaCorriente>(`/tgs/ctacte/clientes/${id}`, data),
  postCtaProveedor: (id: string | number, data: Record<string, unknown>) =>
    api.post<TgsCuentaCorriente>(`/tgs/ctacte/proveedores/${id}`, data),
  ordenes: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsOrden>>("/tgs/ordenes", { params }),
  orden: (id: string | number) => api.get<TgsOrden>(`/tgs/ordenes/${id}`),
  createOrden: (data: Record<string, unknown>) => api.post<TgsOrden>("/tgs/ordenes", data),
  patchOrden: (id: string | number, data: Record<string, unknown>) => api.patch<TgsOrden>(`/tgs/ordenes/${id}`, data),
  rma: (params?: Record<string, string | number | undefined>) =>
    api.get<TgsList<TgsRma>>("/tgs/rma", { params }),
  rmaOne: (id: string | number) => api.get<TgsRma>(`/tgs/rma/${id}`),
  createRma: (data: TgsCreateRma) => api.post<TgsRma>("/tgs/rma", data),
  patchRma: (id: string | number, data: Record<string, unknown>) => api.patch<TgsRma>(`/tgs/rma/${id}`, data),
};
