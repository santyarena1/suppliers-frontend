/**
 * Esquema de atributos de una categoría. Es código versionado: si cambia un
 * atributo (clave, tipo, valores), se sube `version` y las propuestas viejas
 * quedan marcadas con la versión con la que se generaron.
 */
export type AttributeType = "text" | "number" | "enum" | "bool";

export interface AttributeDef {
  key: string;
  label: string;
  type: AttributeType;
  /** Unidad canónica para `number` (GB, MHz, W, mm, pulgadas, Hz...). */
  unit?: string;
  /** Valores permitidos para `enum` (canónicos). */
  values?: readonly string[];
  /**
   * Nombres con que la fuente trae este dato (Icecat en español e inglés,
   * fichas de fabricante). Se comparan normalizados (sin tildes, minúsculas).
   */
  aliases?: readonly string[];
}

export interface CategorySchema {
  categoryKey: string;
  version: number;
  attributes: readonly AttributeDef[];
}

/** Atributos que valen para cualquier categoría. */
export const GENERIC_ATTRIBUTES: readonly AttributeDef[] = [
  { key: "brand", label: "Marca", type: "text", aliases: ["marca", "brand", "fabricante", "manufacturer"] },
  { key: "model", label: "Modelo", type: "text", aliases: ["modelo", "model", "nombre del producto", "product name"] },
  { key: "color", label: "Color", type: "text", aliases: ["color del producto", "color", "product colour", "colour"] },
  { key: "warranty_months", label: "Garantía", type: "number", unit: "meses", aliases: ["garantia", "warranty", "periodo de garantia"] },
  { key: "connectivity", label: "Conectividad", type: "text", aliases: ["conectividad", "tecnologia de conectividad", "connectivity technology"] },
  { key: "weight_g", label: "Peso", type: "number", unit: "g", aliases: ["peso", "weight"] },
];
