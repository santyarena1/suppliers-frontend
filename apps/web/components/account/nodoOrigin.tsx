"use client";

/**
 * Separar, en las listas del portal de cada distribuidor, los pedidos que salieron
 * del carrito de NODO de los que el comercio hizo directo en el portal.
 *
 * El cruce es por número: los borradores de NODO guardan el número que devolvió el
 * distribuidor (`invidOrderNumber` / `invidWebOrderNumber`) y cada panel dice con qué
 * campo de su lista del portal se compara.
 */

/** De dónde salió un pedido: confirmado en el carrito de NODO o hecho directo en el portal. */
export type OrderOrigin = "all" | "nodo" | "portal";

type DraftNumbers = {
  invidOrderNumber?: string | null;
  invidWebOrderNumber?: string | null;
};

function clean(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/**
 * Números de los pedidos que NODO creó. Por defecto toma los dos campos del borrador;
 * `pick` permite elegir uno solo o normalizarlos (p. ej. sacar la extensión "/01").
 */
export function nodoOrderNumbers<D extends DraftNumbers>(
  drafts: D[] | null | undefined,
  pick: (d: D) => unknown[] = (d) => [d.invidOrderNumber, d.invidWebOrderNumber]
): Set<string> {
  const out = new Set<string>();
  for (const d of drafts ?? []) {
    for (const n of pick(d)) {
      const v = clean(n);
      if (v) out.add(v);
    }
  }
  return out;
}

/** Alguno de los números de la fila del portal está entre los de NODO. */
export function matchesNodoNumber(values: unknown[], numbers: Set<string>): boolean {
  return values.some((n) => {
    const v = clean(n);
    return v !== "" && numbers.has(v);
  });
}

export function rowsByOrigin<T>(rows: T[] | null, origin: OrderOrigin, isNodo: (row: T) => boolean): T[] | null {
  if (rows == null || origin === "all") return rows;
  return rows.filter((row) => isNodo(row) === (origin === "nodo"));
}

const ORIGIN_OPTIONS: readonly (readonly [OrderOrigin, string])[] = [
  ["all", "Todas"],
  ["nodo", "Desde NODO"],
  ["portal", "Hechas en el portal"],
];

/** Botones Todas / Desde NODO / Hechas en el portal con la cantidad de cada uno. */
export function OrderOriginFilter<T>({
  rows,
  isNodo,
  value,
  onChange,
}: {
  rows: T[];
  isNodo: (row: T) => boolean;
  value: OrderOrigin;
  onChange: (o: OrderOrigin) => void;
}) {
  const nodo = rows.filter(isNodo).length;
  const counts: Record<OrderOrigin, number> = { all: rows.length, nodo, portal: rows.length - nodo };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Origen del pedido">
      {ORIGIN_OPTIONS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`min-h-[32px] rounded-lg border px-3 text-xs font-semibold transition-colors ${
            value === id
              ? "border-brand-500 bg-brand-600/15 text-brand-300"
              : "border-surface-700 text-surface-400 hover:border-surface-500 hover:text-white"
          }`}
        >
          {label} <span className="tabular-nums opacity-70">{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}

/** Marca al lado del número de un pedido que salió del carrito de NODO. */
export function NodoOrderBadge() {
  return (
    <span className="ml-2 rounded-full bg-brand-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold text-brand-300">
      NODO
    </span>
  );
}
