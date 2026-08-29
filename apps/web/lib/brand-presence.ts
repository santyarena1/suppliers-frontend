import type { BrandModuleId } from "@/lib/api";

export const BRAND_MODULE_LABELS: Record<BrandModuleId, string> = {
  space: "Espacio",
  products: "Productos",
  actions: "Acciones",
  materials: "Materiales",
  trainings: "Capacitaciones",
  contact: "Contacto",
};

export const BRAND_MODULE_HINT: Record<BrandModuleId, string> = {
  space: "Identidad y presentación de la marca",
  products: "Mapa comercial con semáforo y precio sugerido",
  actions: "Objetivos vigentes (unidades, USD o rebate)",
  materials: "Fichas, catálogos y piezas de venta",
  trainings: "Cursos, videos y argumentarios",
  contact: "Mail, teléfono o web de la marca",
};
