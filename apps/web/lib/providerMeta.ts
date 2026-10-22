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
};

/**
 * Intervalo mínimo de sync automática (minutos). Espejo de
 * apps/api/src/providers/provider-rate-limits.ts: estos portales suspenden la
 * cuenta si se consultan seguido.
 */
export const MIN_SYNC_MINUTES: Record<string, number> = {
  GRUPO_NUCLEO: 720,
  SOLUTION_BOX: 720,
};
