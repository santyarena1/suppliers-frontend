import type { CatalogBoard, CatalogTerm } from "@/lib/api";

export type MenuNode = CatalogTerm & { kids: MenuNode[]; productCount: number };

export type LabelChoice = {
  label: string;
  count: number;
  hint?: string;
};

export function uniqueSorted(values: (string | null | undefined)[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.sort((a, b) => a.localeCompare(b, "es"));
}

/** Todas las escrituras de todos los proveedores, unificadas o no, con conteo de productos. */
export function aggregateLabelChoices(
  rows: { rawKey: string; count: number; provider: string; termLabel?: string | null }[],
  extra: string[] = []
): LabelChoice[] {
  const map = new Map<string, { label: string; count: number; providers: string[] }>();
  const add = (label: string, count: number, provider?: string) => {
    const v = label.trim();
    if (!v) return;
    const k = v.toLowerCase();
    const cur = map.get(k);
    if (!cur) {
      map.set(k, { label: v, count, providers: provider ? [provider] : [] });
      return;
    }
    cur.count += count;
    if (provider && !cur.providers.includes(provider)) cur.providers.push(provider);
  };
  for (const r of rows) add(r.rawKey, r.count, r.provider);
  for (const e of extra) add(e, 0);
  return [...map.values()]
    .map((x) => ({
      label: x.label,
      count: x.count,
      hint: x.providers.length ? x.providers.join(" · ") : undefined,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

export function productCountByTerm(board: CatalogBoard | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of board?.terms ?? []) map[t.id] = t.productCount;
  return map;
}

export function buildMenuTree(terms: CatalogTerm[], counts: Record<string, number> = {}): MenuNode[] {
  const cats = terms.filter((t) => (t.kind === "CATEGORY" || t.kind === "SUBCATEGORY") && t.inMenu);
  const nodes = new Map<string, MenuNode>();
  for (const t of cats) {
    nodes.set(t.id, { ...t, kids: [], productCount: counts[t.id] ?? 0 });
  }
  const roots: MenuNode[] = [];
  for (const n of nodes.values()) {
    if (n.parentId && nodes.has(n.parentId) && n.parentId !== n.id) {
      nodes.get(n.parentId)!.kids.push(n);
    } else {
      roots.push(n);
    }
  }
  const sort = (arr: MenuNode[]) => {
    arr.sort((a, b) => a.label.localeCompare(b.label, "es"));
    for (const k of arr) sort(k.kids);
  };
  sort(roots);
  return roots;
}

export function subtreeCount(node: MenuNode): number {
  return node.productCount + node.kids.reduce((s, k) => s + subtreeCount(k), 0);
}

export function descendantIds(node: MenuNode): Set<string> {
  const out = new Set<string>([node.id]);
  const walk = (n: MenuNode) => {
    for (const k of n.kids) {
      out.add(k.id);
      walk(k);
    }
  };
  walk(node);
  return out;
}
