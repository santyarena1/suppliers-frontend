import { brandKeyOf, gtin14, nameSimilarity, pnKey } from "./keys";

/** Una ficha de distribuidor, ya con la marca canónica resuelta. */
export interface GroupingRow {
  provider: string;
  externalId: string;
  name: string;
  /** Marca canónica (alias del catálogo ya aplicados). */
  brand: string | null;
  partNumber: string | null;
  ean: string | null;
  category: string | null;
}

export type MatchKind = "EAN" | "PN" | "SINGLE";

export interface MasterGroup {
  key: string;
  matchKind: MatchKind;
  members: GroupingRow[];
  brand: string | null;
  brandKey: string | null;
  partNumber: string | null;
  ean: string | null;
  name: string;
  categoryRaw: string | null;
  doubtful: boolean;
  doubtReason: string | null;
}

/** Por debajo de esto, dos nombres del mismo grupo se consideran "muy distintos". */
export const MIN_NAME_SIMILARITY = 0.15;

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    let cur = i;
    while (this.parent[cur] !== root) {
      const next = this.parent[cur];
      this.parent[cur] = root;
      cur = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Nombre elegido: el más largo que no sea desmesurado (los distribuidores truncan). */
function pickName(rows: GroupingRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const la = a.name.length > 140 ? 0 : a.name.length;
    const lb = b.name.length > 140 ? 0 : b.name.length;
    return lb - la || a.name.localeCompare(b.name);
  });
  return sorted[0]?.name ?? "";
}

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && v < best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function memberSort(a: GroupingRow, b: GroupingRow): number {
  return a.provider.localeCompare(b.provider) || a.externalId.localeCompare(b.externalId);
}

/** Largo mínimo de una marca para tomarla como raíz de otra ("hp" no). */
const MIN_BRAND_ROOT = 4;

/**
 * Variantes de marca que cargan los distribuidores ("LENOVO COMPUTOS",
 * "HyperX Perifericos"): si comparten un part number o un EAN con una marca
 * que es su prefijo, son esa marca. Solo se aprende de códigos compartidos,
 * así "intellinet" no pasa a ser "intel".
 */
export function brandAliases(pairs: { brandKey: string | null; pn: string | null; gtin?: string | null }[]): Map<string, string> {
  const byPn = new Map<string, Set<string>>();
  for (const { brandKey, pn, gtin } of pairs) {
    if (!brandKey) continue;
    for (const code of [pn ? `pn:${pn}` : null, gtin ? `ean:${gtin}` : null]) {
      if (!code) continue;
      const set = byPn.get(code) ?? new Set<string>();
      set.add(brandKey);
      byPn.set(code, set);
    }
  }
  const alias = new Map<string, string>();
  for (const keys of byPn.values()) {
    if (keys.size < 2) continue;
    for (const k of keys) {
      for (const root of keys) {
        if (root !== k && root.length >= MIN_BRAND_ROOT && k.startsWith(root)) {
          const cur = alias.get(k);
          if (!cur || root.length < cur.length) alias.set(k, root);
        }
      }
    }
  }
  return alias;
}

/**
 * Agrupa fichas en productos maestros. Pura e idempotente: la misma entrada da
 * las mismas claves. Une por (1) GTIN válido y (2) marca + part number; lo que
 * no une queda solo. Una ficha sin marca se une a un part number solo si ese
 * part number pertenece a una única marca.
 */
export function groupRows(rows: GroupingRow[]): MasterGroup[] {
  const uf = new UnionFind(rows.length);
  const byGtin = new Map<string, number>();
  const byBrandPn = new Map<string, number>();
  const brandsByPn = new Map<string, Set<string>>();
  const gtins: (string | null)[] = [];
  const pns: (string | null)[] = [];
  const brandKeys: (string | null)[] = [];

  const aliases = brandAliases(rows.map((r) => ({ brandKey: brandKeyOf(r.brand), pn: pnKey(r.partNumber), gtin: gtin14(r.ean) })));

  rows.forEach((row, i) => {
    const g = gtin14(row.ean);
    const pn = pnKey(row.partNumber);
    const raw = brandKeyOf(row.brand);
    const bk = raw ? aliases.get(raw) ?? raw : null;
    gtins.push(g);
    pns.push(pn);
    brandKeys.push(bk);
    if (g) {
      const first = byGtin.get(g);
      if (first === undefined) byGtin.set(g, i);
      else uf.union(first, i);
    }
    if (pn && bk) {
      const k = `${bk}:${pn}`;
      const first = byBrandPn.get(k);
      if (first === undefined) byBrandPn.set(k, i);
      else uf.union(first, i);
      const set = brandsByPn.get(pn) ?? new Set<string>();
      set.add(bk);
      brandsByPn.set(pn, set);
    }
  });

  // Fichas sin marca: se suman al part number si hay una sola marca con ese código.
  rows.forEach((_, i) => {
    const pn = pns[i];
    if (!pn || brandKeys[i]) return;
    const brands = brandsByPn.get(pn);
    if (brands && brands.size === 1) {
      const target = byBrandPn.get(`${[...brands][0]}:${pn}`);
      if (target !== undefined) uf.union(target, i);
    }
  });

  const buckets = new Map<number, number[]>();
  rows.forEach((_, i) => {
    const root = uf.find(i);
    const list = buckets.get(root) ?? [];
    list.push(i);
    buckets.set(root, list);
  });

  const groups: MasterGroup[] = [];
  for (const idxs of buckets.values()) {
    const members = idxs.map((i) => rows[i]).sort(memberSort);
    const groupGtins = [...new Set(idxs.map((i) => gtins[i]).filter((g): g is string => !!g))].sort();
    const groupBrandKeys = [...new Set(idxs.map((i) => brandKeys[i]).filter((b): b is string => !!b))].sort();
    const brandKey = mostCommon(idxs.map((i) => brandKeys[i]));
    const pn = mostCommon(idxs.map((i) => (brandKeys[i] === brandKey || !brandKeys[i] ? pns[i] : null)));
    const brand = mostCommon(idxs.filter((i) => brandKeys[i] === brandKey).map((i) => rows[i].brand));

    const sharesGtin = groupGtins.some((g) => idxs.filter((i) => gtins[i] === g).length > 1);
    let matchKind: MatchKind;
    let key: string;
    if (members.length === 1) {
      matchKind = "SINGLE";
      key = `single:${members[0].provider}:${members[0].externalId}`;
    } else if (sharesGtin || !pn || !brandKey) {
      matchKind = "EAN";
      key = groupGtins[0] ? `ean:${groupGtins[0]}` : `single:${members[0].provider}:${members[0].externalId}`;
    } else {
      matchKind = "PN";
      key = `pn:${brandKey}:${pn}`;
    }

    const reasons: string[] = [];
    if (groupBrandKeys.length > 1) reasons.push(`marcas distintas en el grupo: ${groupBrandKeys.join(", ")}`);
    if (pn && (brandsByPn.get(pn)?.size ?? 0) > 1) {
      reasons.push(`el part number ${pn} aparece con otras marcas`);
    }
    if (members.length > 1) {
      let minSim = 1;
      for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
          minSim = Math.min(minSim, nameSimilarity(members[a].name, members[b].name));
        }
      }
      if (minSim < MIN_NAME_SIMILARITY) reasons.push("nombres muy distintos entre fichas");
    }

    groups.push({
      key,
      matchKind,
      members,
      brand,
      brandKey,
      partNumber: pn,
      ean: groupGtins[0] ?? null,
      name: pickName(members),
      categoryRaw: mostCommon(members.map((m) => m.category)),
      doubtful: reasons.length > 0,
      doubtReason: reasons.length > 0 ? reasons.join("; ") : null,
    });
  }

  // Dos grupos distintos no pueden compartir clave (p. ej. un EAN que quedó en
  // dos componentes): desempate estable agregando el primer miembro.
  const seen = new Set<string>();
  for (const g of groups.sort((a, b) => a.key.localeCompare(b.key) || memberSort(a.members[0], b.members[0]))) {
    if (seen.has(g.key)) g.key = `${g.key}#${g.members[0].provider}:${g.members[0].externalId}`;
    seen.add(g.key);
  }
  return groups;
}
