import type { CatalogTerm } from "@/lib/api";

export type MenuNode = CatalogTerm & { kids: MenuNode[] };

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

export function buildCategoryTree(terms: CatalogTerm[]): MenuNode[] {
  const cats = terms.filter((t) => t.kind === "CATEGORY" || t.kind === "SUBCATEGORY");
  const nodes = new Map<string, MenuNode>();
  for (const t of cats) nodes.set(t.id, { ...t, kids: [] });
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
