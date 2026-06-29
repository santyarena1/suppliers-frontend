/** Estados de disponibilidad comercial por distribuidor — "Mapa de Disponibilidad" */
export const STOCK_STATUSES = [
  "HIGH_STOCK",
  "MEDIUM_STOCK",
  "LOW_STOCK",
  "CRITICAL_STOCK",
  "OUT_OF_STOCK",
  "INCOMING",
  "IN_TRANSIT",
  "PRE_SALE",
  "CONSULT",
  "DISCONTINUED",
  "SPOT_OFFER",
  "RECOMMENDED",
  "COMMERCIAL_PRIORITY",
  "FEW_UNITS",
  "DELAYED_ARRIVAL",
  "REPLACEMENT_AVAILABLE",
] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  HIGH_STOCK: "Alto stock",
  MEDIUM_STOCK: "Stock medio",
  LOW_STOCK: "Bajo stock",
  CRITICAL_STOCK: "Stock crítico",
  OUT_OF_STOCK: "Sin stock",
  INCOMING: "Próximo ingreso",
  IN_TRANSIT: "En tránsito",
  PRE_SALE: "En preventa",
  CONSULT: "Consultar",
  DISCONTINUED: "Discontinuado",
  SPOT_OFFER: "Oferta puntual",
  RECOMMENDED: "Recomendado",
  COMMERCIAL_PRIORITY: "Prioridad comercial",
  FEW_UNITS: "Pocas unidades",
  DELAYED_ARRIVAL: "Ingreso demorado",
  REPLACEMENT_AVAILABLE: "Reemplazo disponible",
};

export const STOCK_STATUS_COLORS: Record<StockStatus, string> = {
  HIGH_STOCK: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEDIUM_STOCK: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  LOW_STOCK: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CRITICAL_STOCK: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  OUT_OF_STOCK: "bg-red-500/15 text-red-400 border-red-500/30",
  INCOMING: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  IN_TRANSIT: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  PRE_SALE: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  CONSULT: "bg-surface-600/30 text-surface-300 border-surface-600",
  DISCONTINUED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  SPOT_OFFER: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  RECOMMENDED: "bg-brand-500/15 text-brand-400 border-brand-500/30",
  COMMERCIAL_PRIORITY: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  FEW_UNITS: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  DELAYED_ARRIVAL: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  REPLACEMENT_AVAILABLE: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

export const ACCESS_STATUSES = [
  "PENDING",
  "INVITATION_SENT",
  "ACCEPTED",
  "ACTIVE",
  "EXPIRED",
  "REJECTED",
  "REVOKED_BY_BRAND",
  "BLOCKED_BY_ADMIN",
] as const;

export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_STATUS_LABELS: Record<AccessStatus, string> = {
  PENDING: "Invitado pendiente",
  INVITATION_SENT: "Invitación enviada",
  ACCEPTED: "Invitación aceptada",
  ACTIVE: "Usuario activo",
  EXPIRED: "Invitación expirada",
  REJECTED: "Invitación rechazada",
  REVOKED_BY_BRAND: "Acceso revocado",
  BLOCKED_BY_ADMIN: "Bloqueado por admin",
};

export const NEWS_TYPES = [
  "INCOMING",
  "LAUNCH",
  "DISCONTINUED",
  "WARRANTY_CHANGE",
  "DISTRIBUTION_CHANGE",
  "COMMERCIAL_NOTICE",
  "PRE_SALE",
  "DELAY",
  "RECOMMENDED",
  "IMPORTANT_ALERT",
] as const;

export type NewsType = (typeof NEWS_TYPES)[number];

export const NEWS_TYPE_LABELS: Record<NewsType, string> = {
  INCOMING: "Próximo ingreso",
  LAUNCH: "Lanzamiento",
  DISCONTINUED: "Discontinuado",
  WARRANTY_CHANGE: "Cambio de garantía",
  DISTRIBUTION_CHANGE: "Cambio de distribución",
  COMMERCIAL_NOTICE: "Aviso comercial",
  PRE_SALE: "Preventa",
  DELAY: "Demora",
  RECOMMENDED: "Producto recomendado",
  IMPORTANT_ALERT: "Alerta importante",
};

export const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const MATERIAL_TYPES = [
  "BANNER",
  "IMAGE",
  "DATASHEET",
  "CATALOG",
  "VIDEO",
  "SOCIAL_TEXT",
  "PROMOTION",
  "PRESENTATION",
  "COMPARISON",
  "MANUAL",
  "WARRANTY",
  "COMMERCIAL",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  BANNER: "Banner",
  IMAGE: "Imagen oficial",
  DATASHEET: "Ficha técnica",
  CATALOG: "Catálogo",
  VIDEO: "Video",
  SOCIAL_TEXT: "Texto para redes",
  PROMOTION: "Promoción",
  PRESENTATION: "Presentación",
  COMPARISON: "Comparativa",
  MANUAL: "Manual",
  WARRANTY: "Garantía",
  COMMERCIAL: "Material comercial",
};

export const TRAINING_TYPES = [
  "VIDEO",
  "LINK",
  "PDF",
  "COURSE",
  "SALES_PITCH",
  "MODEL_COMPARISON",
  "TECH_DIFFERENTIAL",
  "CERTIFICATION",
  "SELLER_MATERIAL",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "BRAND_INVITATION",
  "ACCESS_ACTIVATED",
  "ACCESS_REVOKED",
  "NEW_LAUNCH",
  "NEW_INCOMING",
  "FAVORITE_STATUS_CHANGE",
  "FAVORITE_DISCONTINUED",
  "NEW_CAMPAIGN",
  "NEW_MATERIAL",
  "NEW_TRAINING",
  "BRAND_ALERT",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const IMPORT_STATUSES = ["PENDING", "PREVIEW", "PROCESSING", "COMPLETED", "FAILED", "REVERTED"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING: "Pendiente",
  PREVIEW: "En previsualización",
  PROCESSING: "Procesando",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  REVERTED: "Revertida",
};

/** Columnas de la plantilla estándar de importación */
export const IMPORT_TEMPLATE_COLUMNS = [
  "marca",
  "categoria",
  "subcategoria",
  "sku",
  "modelo",
  "nombre_comercial",
  "ean_upc",
  "distribuidor",
  "estado_stock",
  "cantidad_estimada",
  "fecha_ingreso_estimada",
  "estado_comercial",
  "etiquetas",
  "reemplazo_sugerido",
  "precio_sugerido",
  "accion_comercial",
  "observaciones",
  "fecha_actualizacion",
] as const;
