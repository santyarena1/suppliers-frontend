import { CASE_SCHEMA, COOLER_SCHEMA, CPU_SCHEMA, GPU_SCHEMA, MOTHERBOARD_SCHEMA, PSU_SCHEMA, RAM_SCHEMA } from "./components";
import { MONITOR_SCHEMA, NOTEBOOK_SCHEMA } from "./displays";
import { ROUTER_SCHEMA, SWITCH_SCHEMA } from "./networking";
import { HEADSET_SCHEMA, KEYBOARD_SCHEMA, MOUSE_SCHEMA } from "./peripherals";
import { PRINTER_SCHEMA } from "./printer";
import { HDD_SCHEMA, SSD_SCHEMA } from "./storage";
import { CategorySchema, GENERIC_ATTRIBUTES } from "./types";

export * from "./types";

/** Para categorías sin esquema propio: solo los atributos genéricos. */
export const GENERIC_SCHEMA: CategorySchema = { categoryKey: "generic", version: 1, attributes: GENERIC_ATTRIBUTES };

const SCHEMAS: readonly CategorySchema[] = [
  GPU_SCHEMA,
  MOTHERBOARD_SCHEMA,
  CPU_SCHEMA,
  RAM_SCHEMA,
  PSU_SCHEMA,
  CASE_SCHEMA,
  COOLER_SCHEMA,
  SSD_SCHEMA,
  HDD_SCHEMA,
  MONITOR_SCHEMA,
  NOTEBOOK_SCHEMA,
  MOUSE_SCHEMA,
  KEYBOARD_SCHEMA,
  HEADSET_SCHEMA,
  ROUTER_SCHEMA,
  SWITCH_SCHEMA,
  PRINTER_SCHEMA,
];

const BY_KEY: Record<string, CategorySchema> = Object.fromEntries(SCHEMAS.map((s) => [s.categoryKey, s]));

/** Esquema de la categoría unificada, o el genérico. */
export function schemaFor(categoryKey: string | null | undefined): CategorySchema {
  return (categoryKey && BY_KEY[categoryKey]) || GENERIC_SCHEMA;
}

export const ALL_SCHEMAS: readonly CategorySchema[] = [...SCHEMAS, GENERIC_SCHEMA];
