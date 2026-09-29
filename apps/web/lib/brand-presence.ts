import type { BrandModuleId } from "@/lib/api";

export const BRAND_MODULE_LABELS: Record<BrandModuleId, string> = {
  space: "Mi página",
  products: "Productos",
  actions: "Promociones",
  materials: "Materiales",
  trainings: "Capacitaciones",
  contact: "Contacto",
};

export const BRAND_MODULE_HINT: Record<BrandModuleId, string> = {
  space: "Identidad y presentación de la marca",
  products: "Stock de cada producto en cada distribuidor y precio de referencia",
  actions: "Objetivos de compra y rebates vigentes",
  materials: "Fichas, catálogos y piezas de venta",
  trainings: "Cursos, videos y argumentarios",
  contact: "Mail, teléfono o web de la marca",
};
