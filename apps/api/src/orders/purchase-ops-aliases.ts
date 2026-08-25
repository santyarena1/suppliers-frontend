/**
 * Unificación a mano de etiquetas operativas (dirección, pago, entrega, sucursal).
 * Cada distribuidor escribe distinto; el comercio decide cuál es la real.
 */

export const OPS_ALIAS_KINDS = ["ADDRESS", "PAYMENT", "DELIVERY", "WAREHOUSE"] as const;
export type OpsAliasKind = (typeof OPS_ALIAS_KINDS)[number];

export const OPS_GROUP_PREFIX = "group:";

export const UNALIASABLE = new Set([
  "Sin dirección",
  "Sin medio de pago",
  "Sin entrega cargada",
  "Sin asignar",
]);

export type OpsAliasHit = { groupId: string; label: string };
export type OpsAliasIndex = Partial<Record<OpsAliasKind, Record<string, OpsAliasHit>>>;

export type OpsAliasRow = {
  kind: OpsAliasKind;
  rawKey: string;
  groupId: string;
  label: string;
};

export type OpsSuggestion = {
  kind: OpsAliasKind;
  keys: string[];
  labels: string[];
  reason: string;
};

export function opsGroupKey(groupId: string) {
  return `${OPS_GROUP_PREFIX}${groupId}`;
}

export function parseOpsGroupKey(key: string): string | null {
  return key.startsWith(OPS_GROUP_PREFIX) ? key.slice(OPS_GROUP_PREFIX.length) : null;
}

export function isAliasable(raw: string) {
  const t = raw.trim();
  return t.length > 0 && !UNALIASABLE.has(t);
}

export function indexOpsAliases(rows: OpsAliasRow[]): OpsAliasIndex {
  const index: OpsAliasIndex = {};
  for (const row of rows) {
    const bucket = (index[row.kind] ??= {});
    bucket[row.rawKey] = { groupId: row.groupId, label: row.label };
  }
  return index;
}

export function resolveOpsAlias(kind: OpsAliasKind, raw: string, aliases?: OpsAliasIndex): {
  mapKey: string;
  label: string;
  groupId: string | null;
  raw: string;
} {
  const hit = aliases?.[kind]?.[raw];
  if (hit) return { mapKey: opsGroupKey(hit.groupId), label: hit.label, groupId: hit.groupId, raw };
  return { mapKey: raw, label: raw, groupId: null, raw };
}

/** Saca tildes, abreviaturas de calle y puntuación para detectar la misma dirección escrita distinto. */
export function normalizeOpsLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(av\.?|avenida|calle|pje\.?|pasaje|depto\.?|dto\.?|piso|nro\.?|n°|nº|numero|número)\b/gi, " ")
    .replace(/\b(de|del|la|el|los|las|y|e)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestOpsMerges(
  items: { kind: OpsAliasKind; raw: string }[],
  aliases?: OpsAliasIndex
): OpsSuggestion[] {
  const byKind = new Map<OpsAliasKind, Set<string>>();
  for (const item of items) {
    if (!isAliasable(item.raw)) continue;
    const set = byKind.get(item.kind) ?? new Set();
    set.add(item.raw);
    byKind.set(item.kind, set);
  }

  const out: OpsSuggestion[] = [];
  for (const [kind, raws] of byKind) {
    const groups = new Map<string, string[]>();
    for (const raw of raws) {
      const n = normalizeOpsLabel(raw);
      if (n.length < 4) continue;
      const arr = groups.get(n) ?? [];
      arr.push(raw);
      groups.set(n, arr);
    }
    for (const [, labels] of groups) {
      if (labels.length < 2) continue;
      const identities = new Set(labels.map((l) => aliases?.[kind]?.[l]?.groupId ?? l));
      if (identities.size <= 1) continue;
      out.push({
        kind,
        keys: labels,
        labels,
        reason: "Misma escritura, distinto formato",
      });
    }
  }
  return out.slice(0, 24);
}
