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

export type CatalogEnrichmentContext = {
  aliases: CatalogAliasIndex;
  identities: CatalogIdentityIndex;
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
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  ean: string | null;
  partNumber: string | null;
};

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
    displayBrand: identity?.displayBrand ?? brandAlias?.label ?? product.brand ?? null,
    displayCategory: identity?.displayCategory ?? categoryAlias?.label ?? product.category ?? null,
    displaySubcategory: identity?.displaySubcategory ?? subcategoryAlias?.label ?? product.subcategory ?? null,
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

export function looksLikeProviderCode(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (/^[A-Z0-9]{1,4}$/i.test(t) && !/[aeiouáéíóú]/i.test(t)) return true;
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

export type CategoryMergeMember = {
  provider: string;
  rawKey: string;
  count: number;
  sampleNames: string[];
};

export type GlobalCategorySuggestion = {
  id: string;
  members: CategoryMergeMember[];
  suggestedLabel: string;
  reason: string;
};

export function resolveCategoryAlias(
  provider: string,
  rawKey: string,
  aliases?: CatalogAliasIndex
): { label: string; groupId: string } | null {
  return resolveKindAlias("CATEGORY", provider, rawKey, aliases);
}

export function resolveSubcategoryAlias(
  provider: string,
  rawKey: string,
  aliases?: CatalogAliasIndex
): { label: string; groupId: string } | null {
  return resolveKindAlias("SUBCATEGORY", provider, rawKey, aliases);
}

function resolveKindAlias(
  kind: CatalogAliasKind,
  provider: string,
  rawKey: string,
  aliases?: CatalogAliasIndex
): { label: string; groupId: string } | null {
  const hit =
    aliases?.[kind]?.[provider]?.[rawKey] ?? aliases?.[kind]?.["*"]?.[rawKey] ?? null;
  return hit ?? null;
}

/** Agrupa categorías de texto de todos los proveedores (no códigos numéricos). */
export function suggestGlobalCategoryMerges(
  stats: RawValueStat[],
  aliases?: CatalogAliasIndex
): GlobalCategorySuggestion[] {
  const rows = stats.filter((s) => s.kind === "CATEGORY" && !looksLikeProviderCode(s.rawKey));
  const byNorm = new Map<string, RawValueStat[]>();
  for (const row of rows) {
    const n = normalizeCatalogLabel(row.rawKey);
    if (n.length < 3) continue;
    const arr = byNorm.get(n) ?? [];
    arr.push(row);
    byNorm.set(n, arr);
  }

  const out: GlobalCategorySuggestion[] = [];
  for (const [, members] of byNorm) {
    if (members.length < 2) continue;

    const mapped = members.map((m) =>
      resolveCategoryAlias(m.provider ?? "", m.rawKey, aliases)
    );
    const mappedGroups = new Set(mapped.filter(Boolean).map((m) => m!.groupId));
    if (mappedGroups.size === 1 && mapped.every(Boolean)) continue;

    const providers = new Set(members.map((m) => m.provider).filter(Boolean));
    const labels = [...new Set(members.map((m) => m.rawKey))];
    out.push({
      id: members.map((m) => `${m.provider}:${m.rawKey}`).join("|"),
      members: members.map((m) => ({
        provider: m.provider ?? "",
        rawKey: m.rawKey,
        count: m.count,
        sampleNames: m.sampleNames,
      })),
      suggestedLabel: labels.sort((a, b) => b.length - a.length)[0] ?? members[0].rawKey,
      reason:
        providers.size > 1
          ? "Misma categoría en distintos proveedores"
          : "Misma categoría escrita distinto",
    });
  }

  return out.sort((a, b) => {
    const ca = a.members.reduce((s, m) => s + m.count, 0);
    const cb = b.members.reduce((s, m) => s + m.count, 0);
    return cb - ca;
  }).slice(0, 60);
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

export function heuristicCategoryClusters(categories: string[]): { label: string; members: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const cat of categories) {
    const n = normalizeCatalogLabel(cat);
    if (n.length < 3) continue;
    const arr = groups.get(n) ?? [];
    arr.push(cat);
    groups.set(n, arr);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([, members]) => ({
      label: members.sort((a, b) => b.length - a.length)[0] ?? members[0],
      members: [...new Set(members)],
    }))
    .slice(0, 30);
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
