export type UnifyNameRow = {
  rawKey: string;
  termLabel?: string | null;
  count: number;
};

export function uniquePreserve(values: (string | null | undefined)[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Nombres entre los que se puede elegir: primero el del grupo (si ya existe), después los seleccionados. */
export function selectableUnifyNames(rows: UnifyNameRow[]) {
  return uniquePreserve([...rows.map((r) => r.termLabel), ...rows.map((r) => r.rawKey)]);
}

/** Uno de los nombres seleccionados: el del grupo más grande, o el que más productos tiene. */
export function defaultUnifyName(rows: UnifyNameRow[]) {
  if (rows.length === 0) return "";
  const score = (label: string) =>
    rows.filter((r) => r.termLabel === label || r.rawKey === label).reduce((s, r) => s + r.count, 0);
  const names = selectableUnifyNames(rows);
  return names.slice().sort((a, b) => score(b) - score(a) || a.localeCompare(b, "es"))[0] ?? rows[0].rawKey;
}
