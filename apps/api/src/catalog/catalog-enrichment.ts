/**
 * Enriquecimiento de catálogo a nivel plataforma (superadmin).
 * Unifica marcas/categorías crudas y propaga por EAN, part number o código de proveedor.
 */

import type { CatalogAliasKind, CatalogMatchKind } from "@prisma/client";

export const CATALOG_ALIAS_KINDS = ["BRAND", "CATEGORY", "SUBCATEGORY"] as const;
export type CatalogAliasKindLiteral = (typeof CATALOG_ALIAS_KINDS)[number];

export const CATALOG_MATCH_KINDS = ["EAN", "PART_NUMBER"] as const;
export type CatalogMatchKindLiteral = (typeof CATALOG_MATCH_KINDS)[number];

export type CatalogAliasRow = {
  kind: CatalogAliasKind;
  provider: string | null;
  rawKey: string;
  groupId: string;
  label: string;
};

export type CatalogIdentityRow = {
  matchKind: CatalogMatchKind;
  matchKey: string;
  displayBrand: string | null;
  displayCategory: string | null;
  displaySubcategory: string | null;
};

export type CatalogOverrideRow = {
  provider: string;
  externalId: string;
  displayBrand: string | null;
  displayCategory: string | null;
  displaySubcategory: string | null;
};

/** provider:externalId → override */
export type CatalogOverrideIndex = Record<string, CatalogOverrideRow>;

export type CatalogTermMeta = {
  id: string;
  kind: CatalogAliasKind;
  label: string;
  parentId: string | null;
  visible: boolean;
};

export type CatalogEnrichmentContext = {
  aliases: CatalogAliasIndex;
  identities: CatalogIdentityIndex;
  overrides: CatalogOverrideIndex;
  /** Labels de categoría ocultos en el catálogo público. */
  hiddenCategoryLabels: Set<string>;
  hiddenBrandLabels: Set<string>;
};

export type CatalogAliasIndex = Partial<
  Record<CatalogAliasKind, Partial<Record<string, Record<string, { groupId: string; label: string }>>>>
>;

/** matchKind:normalizedKey → identity */
export type CatalogIdentityIndex = Record<string, CatalogIdentityRow>;

export type RawValueStat = {
  kind: CatalogAliasKind;
  provider: string | null;
  rawKey: string;
  count: number;
  sampleNames: string[];
  looksLikeCode: boolean;
};

export type AliasSuggestion = {
  kind: CatalogAliasKind;
  provider: string | null;
  rawKeys: string[];
  labels: string[];
  reason: string;
  suggestedLabel: string;
};

export type IdentitySuggestion = {
  matchKind: CatalogMatchKind;
  matchKey: string;
  productCount: number;
  brands: string[];
  categories: string[];
  suggestedBrand: string | null;
  suggestedCategory: string | null;
  reason: string;
};

export type ProductCatalogSlice = {
  provider: string;
  externalId?: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  ean: string | null;
  partNumber: string | null;
};

export function overrideIndexKey(provider: string, externalId: string) {
  return `${provider}:${externalId}`;
}

export function indexCatalogOverrides(rows: CatalogOverrideRow[]): CatalogOverrideIndex {
  const index: CatalogOverrideIndex = {};
  for (const row of rows) {
    index[overrideIndexKey(row.provider, row.externalId)] = row;
  }
  return index;
}

export function normalizeEan(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.replace(/^0+/, "") || digits;
}

export function normalizePartNumber(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  return t.length >= 3 ? t : null;
}

export function identityIndexKey(matchKind: CatalogMatchKind, matchKey: string) {
  return `${matchKind}:${matchKey}`;
}

export function indexCatalogAliases(rows: CatalogAliasRow[]): CatalogAliasIndex {
  const index: CatalogAliasIndex = {};
  for (const row of rows) {
    const providerKey = row.provider?.trim() ? row.provider.trim() : "*";
    const kindBucket = (index[row.kind] ??= {});
    const providerBucket = (kindBucket[providerKey] ??= {});
    providerBucket[row.rawKey] = { groupId: row.groupId, label: row.label };
  }
  return index;
}

export function indexCatalogIdentities(rows: CatalogIdentityRow[]): CatalogIdentityIndex {
  const index: CatalogIdentityIndex = {};
  for (const row of rows) {
    index[identityIndexKey(row.matchKind, row.matchKey)] = row;
  }
  return index;
}

function resolveAlias(
  aliases: CatalogAliasIndex | undefined,
  kind: CatalogAliasKind,
  provider: string | null,
  raw: string | null | undefined
): { groupId: string; label: string } | null {
  if (!raw?.trim() || !aliases) return null;
  const key = raw.trim();
  if (provider) {
    const scoped = aliases[kind]?.[provider]?.[key];
    if (scoped) return scoped;
  }
  return aliases[kind]?.["*"]?.[key] ?? null;
}

function resolveIdentity(
  identities: CatalogIdentityIndex | undefined,
  matchKind: CatalogMatchKind,
  raw: string | null | undefined,
  normalizer: (v: string) => string | null
): CatalogIdentityRow | null {
  if (!raw?.trim() || !identities) return null;
  const key = normalizer(raw.trim());
  if (!key) return null;
  return identities[identityIndexKey(matchKind, key)] ?? null;
}

export function resolveCatalogDisplay(
  product: ProductCatalogSlice,
  ctx?: CatalogEnrichmentContext
): { displayBrand: string | null; displayCategory: string | null; displaySubcategory: string | null } {
  const override =
    product.externalId && ctx?.overrides
      ? ctx.overrides[overrideIndexKey(product.provider, product.externalId)]
      : undefined;

  const identity =
    resolveIdentity(ctx?.identities, "EAN", product.ean, normalizeEan) ??
    resolveIdentity(ctx?.identities, "PART_NUMBER", product.partNumber, normalizePartNumber);

  const brandAlias =
    resolveAlias(ctx?.aliases, "BRAND", product.provider, product.brand) ??
    resolveAlias(ctx?.aliases, "BRAND", null, product.brand);

  const categoryAlias =
    resolveAlias(ctx?.aliases, "CATEGORY", product.provider, product.category) ??
    resolveAlias(ctx?.aliases, "CATEGORY", null, product.category);

  const subcategoryAlias =
    resolveAlias(ctx?.aliases, "SUBCATEGORY", product.provider, product.subcategory) ??
    resolveAlias(ctx?.aliases, "SUBCATEGORY", null, product.subcategory);

  return {
    displayBrand:
      override?.displayBrand ??
      identity?.displayBrand ??
      brandAlias?.label ??
      product.brand ??
      null,
    displayCategory:
      override?.displayCategory ??
      identity?.displayCategory ??
      categoryAlias?.label ??
      product.category ??
      null,
    displaySubcategory:
      override?.displaySubcategory ??
      identity?.displaySubcategory ??
      subcategoryAlias?.label ??
      product.subcategory ??
      null,
  };
}

export function normalizeCatalogLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(de|del|la|el|los|las|y|e|para|con|sin)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clave agresiva para marcas: ignora mayúsculas, guiones, espacios y puntuación.
 * "TP-LINK" = "TP LINK" = "Tplink" = "tp-link".
 */
export function normalizeBrandKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export type MergeRow = {
  provider: string;
  rawKey: string;
  count: number;
};

export type RowMergeSuggestion = {
  label: string;
  confidence: "alta" | "media" | "baja";
  reason: string;
  members: MergeRow[];
};

/**
 * Agrupa filas (proveedor + nombre) para unificar.
 * Marcas: misma clave sin guiones/espacios → un solo grupo (ASUS en todos los distros).
 * Categorías: normalización + similaridad laxa.
 */
export function suggestRowMerges(
  rows: MergeRow[],
  kind: CatalogAliasKind
): RowMergeSuggestion[] {
  if (kind === "BRAND") {
    return suggestBrandRowMerges(rows);
  }
  return suggestCategoryRowMerges(rows);
}

function suggestBrandRowMerges(rows: MergeRow[]): RowMergeSuggestion[] {
  const byKey = new Map<string, MergeRow[]>();
  for (const row of rows) {
    const key = normalizeBrandKey(row.rawKey);
    if (key.length < 2) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(row);
    byKey.set(key, arr);
  }

  const out: RowMergeSuggestion[] = [];
  for (const [, members] of byKey) {
    // Misma marca en 2+ proveedores, o 2+ escrituras distintas
    const providers = new Set(members.map((m) => m.provider));
    const spellings = new Set(members.map((m) => m.rawKey));
    if (providers.size < 2 && spellings.size < 2) continue;

    out.push({
      label: pickCanonicalBrandLabel(members.map((m) => m.rawKey)),
      confidence: "alta",
      reason:
        providers.size > 1
          ? `Misma marca en ${providers.size} distribuidores`
          : "Misma marca escrita distinto",
      members: members.sort((a, b) => a.provider.localeCompare(b.provider) || a.rawKey.localeCompare(b.rawKey, "es")),
    });
  }

  return out.sort(
    (a, b) =>
      b.members.reduce((s, m) => s + m.count, 0) - a.members.reduce((s, m) => s + m.count, 0)
  );
}

function suggestCategoryRowMerges(rows: MergeRow[]): RowMergeSuggestion[] {
  const byNorm = new Map<string, MergeRow[]>();
  for (const row of rows) {
    const n = normalizeCatalogLabel(row.rawKey);
    if (n.length < 2) continue;
    const arr = byNorm.get(n) ?? [];
    arr.push(row);
    byNorm.set(n, arr);
  }

  const out: RowMergeSuggestion[] = [];
  const used = new Set<string>();

  for (const [, members] of byNorm) {
    const providers = new Set(members.map((m) => m.provider));
    const spellings = new Set(members.map((m) => m.rawKey));
    if (providers.size < 2 && spellings.size < 2) continue;
    for (const m of members) used.add(`${m.provider}:${m.rawKey}`);
    out.push({
      label: pickBestCatalogLabel([...spellings]),
      confidence: "alta",
      reason:
        providers.size > 1
          ? `Misma categoría en ${providers.size} distribuidores`
          : "Misma categoría escrita distinto",
      members: members.sort((a, b) => a.rawKey.localeCompare(b.rawKey, "es")),
    });
  }

  // Similaridad laxa entre grupos restantes (solo nombres distintos)
  const remaining = rows.filter((r) => !used.has(`${r.provider}:${r.rawKey}`));
  const byLabel = new Map<string, MergeRow[]>();
  for (const r of remaining) {
    const arr = byLabel.get(r.rawKey) ?? [];
    arr.push(r);
    byLabel.set(r.rawKey, arr);
  }
  const labels = [...byLabel.keys()];
  const norms = labels.map((raw) => ({ raw, n: normalizeCatalogLabel(raw) }));
  const claimed = new Set<string>();

  for (let i = 0; i < norms.length; i++) {
    if (claimed.has(norms[i].raw)) continue;
    const groupLabels = [norms[i].raw];
    for (let j = i + 1; j < norms.length; j++) {
      if (claimed.has(norms[j].raw)) continue;
      if (labelsLikelySame(norms[i].n, norms[j].n)) groupLabels.push(norms[j].raw);
    }
    if (groupLabels.length < 2) continue;
    const members = groupLabels.flatMap((l) => byLabel.get(l) ?? []);
    if (members.length < 2) continue;
    for (const l of groupLabels) claimed.add(l);
    out.push({
      label: pickBestCatalogLabel(groupLabels),
      confidence: "media",
      reason: "Nombres parecidos",
      members,
    });
  }

  return out.sort(
    (a, b) =>
      b.members.reduce((s, m) => s + m.count, 0) - a.members.reduce((s, m) => s + m.count, 0)
  );
}

/** Prefiere la forma más “de marca”: con guiones/mayúsculas consistentes si aparece. */
export function pickCanonicalBrandLabel(spellings: string[]): string {
  const uniq = [...new Set(spellings.map((s) => s.trim()).filter(Boolean))];
  if (uniq.length === 0) return "";
  if (uniq.length === 1) return uniq[0];

  // Contar frecuencia case-insensitive
  const freq = new Map<string, { sample: string; count: number }>();
  for (const s of spellings) {
    const k = s.trim();
    if (!k) continue;
    const cur = freq.get(k) ?? { sample: k, count: 0 };
    cur.count++;
    freq.set(k, cur);
  }
  const ranked = [...freq.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Preferir con guión / mayúsculas tipo marca (TP-LINK)
    const score = (s: string) =>
      (/-/.test(s) ? 2 : 0) + (/[A-Z]/.test(s) && /[a-z]/.test(s) ? 0 : /[A-Z]{2,}/.test(s) ? 1 : 0);
    return score(b.sample) - score(a.sample) || a.sample.localeCompare(b.sample, "es");
  });
  return ranked[0]?.sample ?? uniq[0];
}

export function looksLikeProviderCode(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (looksLikeAirCatalogCode(t)) return true;
  if (/^[A-Z0-9]{1,4}$/i.test(t) && !/[aeiouáéíóú]/i.test(t)) return true;
  return false;
}

/**
 * Ids que Air metía en categoría/marca antes de resolver nombres:
 * grupo numérico (`63`) o rubro tipo `001-0010`. No usa el detector
 * corto (HP, IBM) para no borrar marcas reales.
 */
export function looksLikeAirCatalogCode(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (/^\d{2,4}-\d{3,4}$/.test(t)) return true;
  return false;
}

function majority(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function suggestAliasMerges(
  stats: RawValueStat[],
  aliases?: CatalogAliasIndex
): AliasSuggestion[] {
  const out: AliasSuggestion[] = [];

  const byBucket = new Map<string, RawValueStat[]>();
  for (const stat of stats) {
    if (looksLikeProviderCode(stat.rawKey)) continue;
    const bucket = `${stat.kind}::${stat.provider ?? "*"}`;
    const arr = byBucket.get(bucket) ?? [];
    arr.push(stat);
    byBucket.set(bucket, arr);
  }

  for (const [bucket, rows] of byBucket) {
    const [kind, providerRaw] = bucket.split("::");
    const provider = providerRaw === "*" ? null : providerRaw;
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const n = normalizeCatalogLabel(row.rawKey);
      if (n.length < 3) continue;
      const arr = groups.get(n) ?? [];
      arr.push(row.rawKey);
      groups.set(n, arr);
    }
    for (const [, rawKeys] of groups) {
      if (rawKeys.length < 2) continue;
      const identities = new Set(
        rawKeys.map((k) => aliases?.[kind as CatalogAliasKind]?.[provider ?? "*"]?.[k]?.groupId ?? k)
      );
      if (identities.size <= 1) continue;
      const labels = [...new Set(rawKeys)];
      out.push({
        kind: kind as CatalogAliasKind,
        provider,
        rawKeys,
        labels,
        reason: "Misma categoría/marca escrita distinto",
        suggestedLabel: labels.sort((a, b) => b.length - a.length)[0] ?? rawKeys[0],
      });
    }
  }

  return out.slice(0, 40);
}

export function suggestProviderCodeLabels(stats: RawValueStat[]): AliasSuggestion[] {
  return stats
    .filter((s) => s.looksLikeCode && s.count >= 1)
    .slice(0, 60)
    .map((s) => ({
      kind: s.kind,
      provider: s.provider,
      rawKeys: [s.rawKey],
      labels: [s.rawKey],
      reason: `Código de proveedor (${s.count} productos)`,
      suggestedLabel: s.sampleNames[0]?.split(" ").slice(0, 3).join(" ") ?? s.rawKey,
    }));
}

export function suggestIdentityMerges(
  products: (ProductCatalogSlice & { name?: string })[],
  existing?: CatalogIdentityIndex
): IdentitySuggestion[] {
  const byKey = new Map<string, { matchKind: CatalogMatchKind; matchKey: string; items: typeof products }>();

  for (const p of products) {
    const ean = p.ean ? normalizeEan(p.ean) : null;
    if (ean) {
      const k = identityIndexKey("EAN", ean);
      const bucket = byKey.get(k) ?? { matchKind: "EAN" as const, matchKey: ean, items: [] };
      bucket.items.push(p);
      byKey.set(k, bucket);
    }
    const pn = p.partNumber ? normalizePartNumber(p.partNumber) : null;
    if (pn) {
      const k = identityIndexKey("PART_NUMBER", pn);
      const bucket = byKey.get(k) ?? { matchKind: "PART_NUMBER" as const, matchKey: pn, items: [] };
      bucket.items.push(p);
      byKey.set(k, bucket);
    }
  }

  const out: IdentitySuggestion[] = [];
  for (const { matchKind, matchKey, items } of byKey.values()) {
    if (items.length < 2) continue;
    if (existing?.[identityIndexKey(matchKind, matchKey)]) continue;
    const brands = items.map((i) => i.brand).filter(Boolean) as string[];
    const categories = items.map((i) => i.category).filter(Boolean) as string[];
    const providers = new Set(items.map((i) => i.provider));
    out.push({
      matchKind,
      matchKey,
      productCount: items.length,
      brands: [...new Set(brands)],
      categories: [...new Set(categories)],
      suggestedBrand: majority(brands),
      suggestedCategory: majority(categories),
      reason:
        providers.size > 1
          ? `Mismo identificador en ${providers.size} proveedores`
          : "Varios productos comparten identificador",
    });
  }

  return out.sort((a, b) => b.productCount - a.productCount).slice(0, 40);
}

export function heuristicCategoryClusters(categories: string[]): { label: string; members: string[]; confidence?: string }[] {
  const unique = [...new Set(categories.filter(Boolean))];
  const byNorm = new Map<string, string[]>();
  for (const cat of unique) {
    const n = normalizeCatalogLabel(cat);
    if (n.length < 2) continue;
    const arr = byNorm.get(n) ?? [];
    arr.push(cat);
    byNorm.set(n, arr);
  }

  const clusters: { label: string; members: string[]; confidence?: string }[] = [];
  const used = new Set<string>();

  for (const [, members] of byNorm) {
    const uniq = [...new Set(members)];
    if (uniq.length < 2) continue;
    clusters.push({
      label: pickBestCatalogLabel(uniq),
      members: uniq,
      confidence: "alta",
    });
    for (const m of uniq) used.add(m);
  }

  const remaining = unique.filter((c) => !used.has(c));
  const norms = remaining.map((c) => ({ raw: c, n: normalizeCatalogLabel(c) })).filter((x) => x.n.length >= 4);
  for (let i = 0; i < norms.length; i++) {
    if (used.has(norms[i].raw)) continue;
    const group = [norms[i].raw];
    for (let j = i + 1; j < norms.length; j++) {
      if (used.has(norms[j].raw)) continue;
      if (labelsLikelySame(norms[i].n, norms[j].n)) group.push(norms[j].raw);
    }
    if (group.length >= 2) {
      clusters.push({
        label: pickBestCatalogLabel(group),
        members: [...new Set(group)],
        confidence: "media",
      });
      for (const m of group) used.add(m);
    }
  }

  return clusters
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, 80);
}

function pickBestCatalogLabel(members: string[]): string {
  return [...members].sort((a, b) => b.length - a.length || a.localeCompare(b, "es"))[0] ?? members[0];
}

/** Similaridad laxa: mismo stem, contención o tokens compartidos. */
export function labelsLikelySame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const ta = a.split(" ").filter((t) => t.length > 2);
  const tb = b.split(" ").filter((t) => t.length > 2);
  if (ta.length && tb.length) {
    const setB = new Set(tb);
    const shared = ta.filter((t) => setB.has(t));
    if (shared.length >= 1 && shared.length >= Math.min(ta.length, tb.length)) return true;
    if (ta[0] && ta[0] === tb[0] && ta[0].length >= 5) return true;
  }
  if (Math.abs(a.length - b.length) <= 2 && a.length <= 18 && catalogEditDistance(a, b) <= 2) return true;
  return false;
}

function catalogEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function matchingRawCategories(
  target: string,
  ctx?: CatalogEnrichmentContext
): string[] {
  const out = new Set<string>([target]);
  for (const providerBucket of Object.values(ctx?.aliases.CATEGORY ?? {})) {
    if (!providerBucket) continue;
    for (const [rawKey, hit] of Object.entries(providerBucket)) {
      if (hit.label === target) out.add(rawKey);
    }
  }
  return [...out];
}

export function groupCategoriesByDisplay(
  rows: { rawCategory: string; count: number }[],
  ctx?: CatalogEnrichmentContext
): { category: string; count: number }[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const display = resolveCatalogDisplay(
      { provider: "", brand: null, category: row.rawCategory, subcategory: null, ean: null, partNumber: null },
      ctx
    ).displayCategory ?? row.rawCategory;
    if (ctx?.hiddenCategoryLabels?.has(display)) continue;
    merged.set(display, (merged.get(display) ?? 0) + row.count);
  }
  return [...merged.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function matchesDisplayCategory(
  product: ProductCatalogSlice,
  targetCategory: string,
  ctx?: CatalogEnrichmentContext
): boolean {
  const display = resolveCatalogDisplay(product, ctx).displayCategory;
  return display === targetCategory;
}

export function matchingRawBrands(
  target: string,
  ctx?: CatalogEnrichmentContext
): string[] {
  const out = new Set<string>([target]);
  const targetKey = normalizeBrandKey(target);
  for (const providerBucket of Object.values(ctx?.aliases.BRAND ?? {})) {
    if (!providerBucket) continue;
    for (const [rawKey, hit] of Object.entries(providerBucket)) {
      if (hit.label === target || normalizeBrandKey(hit.label) === targetKey) {
        out.add(rawKey);
      }
    }
  }
  return [...out];
}

export function groupBrandsByDisplay(
  rows: { rawBrand: string; count: number }[],
  ctx?: CatalogEnrichmentContext
): { brand: string; count: number }[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    let display =
      resolveCatalogDisplay(
        {
          provider: "",
          brand: row.rawBrand,
          category: null,
          subcategory: null,
          ean: null,
          partNumber: null,
        },
        ctx
      ).displayBrand ?? row.rawBrand;
    // Sin proveedor en el GROUP BY SQL: buscar alias de esta rawKey en cualquier distro.
    if (ctx?.aliases.BRAND) {
      for (const bucket of Object.values(ctx.aliases.BRAND)) {
        const hit = bucket?.[row.rawBrand];
        if (hit?.label) {
          display = hit.label;
          break;
        }
      }
    }
    if (ctx?.hiddenBrandLabels?.has(display)) continue;
    merged.set(display, (merged.get(display) ?? 0) + row.count);
  }
  return [...merged.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);
}

export function matchesDisplayBrand(
  product: ProductCatalogSlice,
  targetBrand: string,
  ctx?: CatalogEnrichmentContext
): boolean {
  const display = resolveCatalogDisplay(product, ctx).displayBrand;
  if (!display) return false;
  if (display === targetBrand) return true;
  return normalizeBrandKey(display) === normalizeBrandKey(targetBrand);
}

/** True si poner `id` debajo de `newParentId` formaría un ciclo. */
export function parentWouldCycle(
  id: string,
  newParentId: string | null | undefined,
  parentOf: Record<string, string | null | undefined>
): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  const seen = new Set<string>([id]);
  let cur: string | null | undefined = newParentId;
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf[cur];
  }
  return false;
}
