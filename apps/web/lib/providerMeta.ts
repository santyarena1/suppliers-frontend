/** Prefijo de SKU fijo por proveedor — mismo criterio que usa AcuStock, no editable. */
export const SKU_PREFIX: Record<string, string> = {
  ELIT: "EL_",
  NEW_BYTES: "NB_",
  GRUPO_NUCLEO: "GN_",
  AIR: "AIR_",
  INVID: "IC_",
  CEVEN: "CV_",
  DIAPSTORE: "DS_",
  POLYTECH: "PT_",
  NEW_TREE: "NT_",
  SOLUTION_BOX: "SB_",
  DISTECNA: "DT_",
  GC: "GC_",
  MASNET: "MS_",
  MICROGLOBAL: "MG_",
  PC_ARTS: "PA_",
};

/**
 * Intervalo mínimo de sync automática (minutos). Espejo de
 * apps/api/src/providers/provider-rate-limits.ts: estos portales suspenden la
 * cuenta si se consultan seguido.
 */
export const MIN_SYNC_MINUTES: Record<string, number> = {
  GRUPO_NUCLEO: 720,
  SOLUTION_BOX: 720,
  MASNET: 120,
  MICROGLOBAL: 120,
  PC_ARTS: 120,
};

/** De estos el mínimo es porque suspendieron cuentas; del resto es prudencia (integraciones nuevas). */
export const SUSPENDS_ON_FREQUENT_SYNC: readonly string[] = ["GRUPO_NUCLEO", "SOLUTION_BOX"];

/** Espejo de `AIR_WAREHOUSES` de `packages/shared/src/air-warehouses.ts` (la web no depende de @nodo/shared). */
export const AIR_WAREHOUSES = [
  { id: "LUG", label: "Lugano (Buenos Aires)" },
  { id: "ROS", label: "Rosario" },
  { id: "CBA", label: "Córdoba" },
  { id: "MZA", label: "Mendoza" },
] as const;
