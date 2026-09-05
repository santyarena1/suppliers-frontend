"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogIncompleteProduct,
  type Provider,
} from "@/lib/api";
import type { LabelChoice } from "@/lib/catalog-menu";
import SearchablePick from "./SearchablePick";
import { Check, Loader2, Search, Sparkles } from "lucide-react";

function providerName(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

type MissingFilter = "all" | "brand" | "category";

export default function IncompleteTab({
  brandChoices,
  categoryChoices,
  showToast,
  onChanged,
}: {
  brandChoices: LabelChoice[];
  categoryChoices: LabelChoice[];
  showToast: (msg: string, ok?: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<CatalogIncompleteProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState<MissingFilter>("all");
  const [provider, setProvider] = useState("");
  const [byProvider, setByProvider] = useState<{ provider: string; count: number }[]>([]);
  const [autoBusy, setAutoBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { brand: string; category: string; subcategory: string }>
  >({});
  const [extraBrands, setExtraBrands] = useState<LabelChoice[]>([]);
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set());
  const [aiBusy, setAiBusy] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [extraCats, setExtraCats] = useState<LabelChoice[]>([]);
  const limit = 30;

  const brands = useMemo(() => mergeChoices(brandChoices, extraBrands), [brandChoices, extraBrands]);
  const categories = useMemo(
    () => mergeChoices(categoryChoices, extraCats),
    [categoryChoices, extraCats]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await catalogEnrichmentApi.incomplete({ limit, offset, q: q || undefined , provider: provider || undefined });
      setItems(res.data.items);
      setTotal(res.data.total);
      const next: Record<string, { brand: string; category: string; subcategory: string }> = {};
      for (const p of res.data.items) {
        const key = `${p.provider}:${p.externalId}`;
        next[key] = {
          brand: p.displayBrand ?? "",
          category: p.displayCategory ?? "",
          subcategory: p.displaySubcategory ?? "",
        };
      }
      setDrafts(next);
    } catch {
      showToast("No se pudieron cargar incompletos", false);
    } finally {
      setLoading(false);
    }
  }, [offset, q, provider, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (missing === "brand") return items.filter((p) => p.missingBrand);
    if (missing === "category") return items.filter((p) => p.missingCategory);
    return items;
  }, [items, missing]);

  async function createTerm(kind: CatalogAliasKind, label: string) {
    const name = label.trim();
    if (!name) return null;
    setBusy(`create-${kind}`);
    try {
      await catalogEnrichmentApi.createTerm({ kind, label: name });
      const choice = { label: name, count: 0 };
      if (kind === "BRAND") setExtraBrands((p) => mergeChoices(p, [choice]));
      else setExtraCats((p) => mergeChoices(p, [choice]));
      showToast(`${kind === "BRAND" ? "Marca" : "Categoría"} «${name}» lista`);
      await onChanged();
      return name;
    } catch {
      showToast("No se pudo crear. ¿Ya existe?", false);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function save(p: CatalogIncompleteProduct) {
    const key = `${p.provider}:${p.externalId}`;
    const d = drafts[key];
    if (!d) return;
    setBusy(key);
    try {
      await catalogEnrichmentApi.assignProduct({
        provider: p.provider,
        externalId: p.externalId,
        displayBrand: d.brand || null,
        displayCategory: d.category || null,
        displaySubcategory: d.subcategory || null,
      });
      showToast("Asignado");
      await load();
      await onChanged();
    } catch {
      showToast("No se pudo guardar", false);
    } finally {
      setBusy(null);
    }
  }

  /** Cierra con IA todo lo incompleto del proveedor elegido, sin revisión: solo marcas y categorías ya conocidas. */
  async function autoComplete() {
    if (!provider) return;
    setAutoBusy(true);
    try {
      const res = await catalogEnrichmentApi.aiAutoComplete({ provider });
      showToast(
        res.data.completed
          ? `${res.data.completed} de ${res.data.considered} completados${res.data.usedAi ? "" : " (heurística, sin IA)"}. Lo que queda necesita una marca o categoría nueva.`
          : "La IA no pudo cerrar ninguno con lo que ya existe: revisalos abajo o creá la marca desde Marcas faltantes.",
        res.data.completed > 0
      );
      await load();
      await onChanged();
    } catch {
      showToast("No se pudo autocompletar", false);
    } finally {
      setAutoBusy(false);
    }
  }

  /** IA para toda la página: una llamada por tanda, deja las sugerencias cargadas para revisar. */
  async function suggestAiPage() {
    if (visible.length === 0) return;
    setAiBusy(true);
    try {
      const res = await catalogEnrichmentApi.aiProductHints(visible.map((p) => ({ provider: p.provider, externalId: p.externalId })));
      const next = { ...drafts };
      const keys = new Set(aiKeys);
      let filled = 0;
      for (const h of res.data.items) {
        const key = `${h.provider}:${h.externalId}`;
        const p = visible.find((v) => v.provider === h.provider && v.externalId === h.externalId);
        if (!p) continue;
        const brand = p.missingBrand ? h.displayBrand ?? "" : next[key]?.brand ?? "";
        const category = p.missingCategory ? h.displayCategory ?? "" : next[key]?.category ?? "";
        const subcategory = h.displaySubcategory ?? next[key]?.subcategory ?? "";
        if (!brand && !category && !subcategory) continue;
        next[key] = { brand, category, subcategory };
        keys.add(key);
        filled++;
      }
      setDrafts(next);
      setAiKeys(keys);
      showToast(filled ? `${filled} sugerencias listas para revisar${res.data.usedAi ? "" : " (heurística, sin IA)"}` : "La IA no encontró nada claro", filled > 0);
    } catch {
      showToast("No se pudieron pedir sugerencias", false);
    } finally {
      setAiBusy(false);
    }
  }

  /** Guarda todas las filas de la página que tienen sugerencia cargada. */
  async function saveSuggested() {
    const targets = visible.filter((p) => {
      const d = drafts[`${p.provider}:${p.externalId}`];
      return aiKeys.has(`${p.provider}:${p.externalId}`) && d && (d.brand || d.category);
    });
    if (targets.length === 0) return;
    setSavingAll(true);
    let ok = 0;
    try {
      for (const p of targets) {
        const d = drafts[`${p.provider}:${p.externalId}`];
        await catalogEnrichmentApi.assignProduct({
          provider: p.provider,
          externalId: p.externalId,
          displayBrand: d.brand || null,
          displayCategory: d.category || null,
          displaySubcategory: d.subcategory || null,
          source: "AI",
        });
        ok++;
      }
      showToast(`${ok} productos completados`);
      setAiKeys(new Set());
      await load();
      await onChanged();
    } catch {
      showToast(`Se guardaron ${ok}; el resto falló`, false);
    } finally {
      setSavingAll(false);
    }
  }

  async function suggestAi(p: CatalogIncompleteProduct) {
    const key = `${p.provider}:${p.externalId}`;
    setBusy(`ai-${key}`);
    try {
      const res = await catalogEnrichmentApi.aiProductHint(p.provider, p.externalId);
      setDrafts((prev) => ({
        ...prev,
        [key]: {
          brand: res.data.displayBrand ?? prev[key]?.brand ?? "",
          category: res.data.displayCategory ?? prev[key]?.category ?? "",
          subcategory: res.data.displaySubcategory ?? prev[key]?.subcategory ?? "",
        },
      }));
      showToast(res.data.reasoning || "Sugerencia lista");
    } catch {
      showToast("Sin sugerencia IA", false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-sm text-surface-400 leading-relaxed">
        Tocá marca o categoría y buscá <strong className="text-surface-200">cualquiera</strong> de
        cualquier proveedor — no hace falta que esté unificada. Si no aparece, escribila y se crea.
      </p>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={q}
            onChange={(e) => {
              setOffset(0);
              setQ(e.target.value);
            }}
            placeholder="Buscar productos incompletos…"
            className="w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 py-2 text-sm text-white"
          />
        </div>
        <div className="flex rounded-lg border border-surface-700 overflow-hidden text-[11px]">
          {(
            [
              ["all", "Todos"],
              ["brand", "Sin marca"],
              ["category", "Sin categoría"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMissing(key)}
              className={`px-2.5 py-1.5 ${
                missing === key ? "bg-surface-800 text-white" : "text-surface-500 hover:text-surface-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={provider}
          onChange={(e) => {
            setOffset(0);
            setProvider(e.target.value);
          }}
          className="bg-surface-900 border border-surface-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
        >
          <option value="">Todos los proveedores</option>
          {byProvider.map((b) => (
            <option key={b.provider} value={b.provider}>{providerName(b.provider)} ({b.count})</option>
          ))}
        </select>
        <p className="text-xs text-surface-500">{total} en total</p>
        <div className="flex items-center gap-2">
          {provider && (
            <button
              type="button"
              onClick={() => void autoComplete()}
              disabled={autoBusy || loading}
              className="flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5"
              title="Completa con IA todo lo incompleto de este proveedor usando solo marcas y categorías ya conocidas"
            >
              {autoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Completar {providerName(provider)} con IA
            </button>
          )}
          <button
            type="button"
            onClick={() => void suggestAiPage()}
            disabled={aiBusy || loading || visible.length === 0}
            className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
            title="Pide a la IA marca, categoría y subcategoría para todos los productos de esta página"
          >
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-brand-400" />}
            Sugerir con IA (página)
          </button>
          {aiKeys.size > 0 && (
            <button
              type="button"
              onClick={() => void saveSuggested()}
              disabled={savingAll}
              className="flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5"
            >
              {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar sugeridas ({aiKeys.size})
            </button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        {loading ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center">
            {items.length === 0
              ? "Todos los productos tienen marca y categoría."
              : "Nada con ese filtro."}
          </p>
        ) : (
          <div className="divide-y divide-surface-800/80">
            {visible.map((p) => {
              const key = `${p.provider}:${p.externalId}`;
              const d = drafts[key] ?? { brand: "", category: "", subcategory: "" };
              return (
                <div key={key} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap gap-2 items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        {providerName(p.provider)} · {p.sku || p.partNumber || p.externalId}
                        {p.brand ? ` · marca cruda: ${p.brand}` : ""}
                        {p.category ? ` · cat. cruda: ${p.category}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {p.missingBrand && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          sin marca
                        </span>
                      )}
                      {p.missingCategory && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          sin categoría
                        </span>
                      )}
                      {aiKeys.has(key) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300">
                          sugerido por IA
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-end">
                    <SearchablePick
                      label="Marca"
                      value={d.brand}
                      options={brands}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: { ...d, brand: v } }))}
                      onCreate={async (name) => {
                        const created = await createTerm("BRAND", name);
                        if (created) {
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? d), brand: created },
                          }));
                        }
                      }}
                      creating={busy === "create-BRAND"}
                    />
                    <SearchablePick
                      label="Categoría"
                      value={d.category}
                      options={categories}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: { ...d, category: v } }))}
                      onCreate={async (name) => {
                        const created = await createTerm("CATEGORY", name);
                        if (created) {
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? d), category: created },
                          }));
                        }
                      }}
                      creating={busy === "create-CATEGORY"}
                    />
                    <SearchablePick
                      label="Subcategoría"
                      value={d.subcategory}
                      options={categories}
                      optional
                      onChange={(v) =>
                        setDrafts((prev) => ({ ...prev, [key]: { ...d, subcategory: v } }))
                      }
                      onCreate={async (name) => {
                        const created = await createTerm("SUBCATEGORY", name);
                        if (created) {
                          setDrafts((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? d), subcategory: created },
                          }));
                        }
                      }}
                      creating={busy === "create-SUBCATEGORY"}
                    />
                    <button
                      type="button"
                      disabled={busy === `ai-${key}`}
                      onClick={() => void suggestAi(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {busy === `ai-${key}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      IA
                    </button>
                    <button
                      type="button"
                      disabled={busy === key || (!d.brand && !d.category)}
                      onClick={() => void save(p)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                    >
                      {busy === key ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Guardar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {total > limit && (
        <div className="flex items-center justify-between text-xs text-surface-400">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 rounded-lg border border-surface-700 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} / {total}
          </span>
          <button
            type="button"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 rounded-lg border border-surface-700 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

function mergeChoices(a: LabelChoice[], b: LabelChoice[]): LabelChoice[] {
  const map = new Map<string, LabelChoice>();
  for (const x of [...a, ...b]) {
    const k = x.label.toLowerCase();
    const cur = map.get(k);
    if (!cur || x.count > cur.count) map.set(k, x);
  }
  return [...map.values()].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label, "es"));
}
