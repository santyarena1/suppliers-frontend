/**
 * Garantías comunes para el desplegable de la tienda. Primero van las que la
 * tienda ya usa (las más usadas arriba), después estas en su orden, y se puede
 * crear cualquier otra escribiéndola.
 */
export const WARRANTY_PRESETS = [
  "Sin garantía",
  "7 días por falla de fábrica",
  "30 días en el local",
  "3 meses en el local",
  "6 meses en el local",
  "12 meses en el local",
  "6 meses oficial",
  "12 meses oficial",
  "12 meses con el fabricante",
];

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function warrantyOptions(used: (string | null | undefined)[]): { value: string; count?: number }[] {
  const own = new Map<string, { value: string; count: number }>();
  for (const raw of used) {
    const v = raw?.replace(/\s+/g, " ").trim();
    if (!v) continue;
    const prev = own.get(key(v));
    own.set(key(v), { value: prev?.value ?? v, count: (prev?.count ?? 0) + 1 });
  }
  const mine = [...own.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "es"));
  return [...mine, ...WARRANTY_PRESETS.filter((p) => !own.has(key(p))).map((value) => ({ value }))];
}
