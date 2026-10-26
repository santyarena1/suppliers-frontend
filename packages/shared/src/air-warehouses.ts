/**
 * Depósitos de Air. El catálogo que baja NODO trae, por depósito, el stock
 * físico menos lo reservado (columnas ROS, MZA, CBA y LUG del CSV), igual que
 * el portal (`stock[].fisico - stock[].reserva`). Cada comercio elige cuáles
 * ve; sin elegir, se suman todos.
 */
export const AIR_WAREHOUSES = [
  { id: "LUG", label: "Lugano (Buenos Aires)" },
  { id: "ROS", label: "Rosario" },
  { id: "CBA", label: "Córdoba" },
  { id: "MZA", label: "Mendoza" },
] as const;

export type AirWarehouseId = (typeof AIR_WAREHOUSES)[number]["id"];

export const AIR_WAREHOUSE_IDS: readonly AirWarehouseId[] = AIR_WAREHOUSES.map((w) => w.id);

export function isAirWarehouseId(value: unknown): value is AirWarehouseId {
  return typeof value === "string" && (AIR_WAREHOUSE_IDS as readonly string[]).includes(value);
}

/**
 * Stock de Air para los depósitos elegidos (vacío = todos). Un depósito con más
 * reservado que físico viene negativo: cuenta como 0, no le resta a los demás.
 */
export function airWarehouseStock(raw: unknown, warehouses: readonly string[] = []): number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const chosen = warehouses.filter(isAirWarehouseId);
  const ids = chosen.length > 0 ? chosen : AIR_WAREHOUSE_IDS;
  let total = 0;
  let seen = false;
  for (const id of ids) {
    const value = Number(rec[id]);
    if (rec[id] == null || rec[id] === "" || !Number.isFinite(value)) continue;
    seen = true;
    total += Math.max(0, value);
  }
  return seen ? total : undefined;
}
