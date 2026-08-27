"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogIncompleteProduct,
  type Provider,
} from "@/lib/api";
import { uniqueSorted } from "@/lib/catalog-menu";
import { Check, Loader2, Plus, Search, Sparkles } from "lucide-react";

function providerName(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

type MissingFilter = "all" | "brand" | "category";

export default function IncompleteTab({
  brandOptions,
  categoryOptions,
  showToast,
  onChanged,
}: {
  brandOptions: string[];
  categoryOptions: string[];
  showToast: (msg: string, ok?: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<CatalogIncompleteProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState<MissingFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { brand: string; category: string; subcategory: string }>
  >({});
  const [extraBrands, setExtraBrands] = useState<string[]>([]);
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const [newBrand, setNewBrand] = useState("");
  const [newCat, setNewCat] = useState("");
  const limit = 30;

  const brands = useMemo(() => uniqueSorted([...brandOptions, ...extraBrands]), [brandOptions, extraBrands]);
  const categories = useMemo(
    () => uniqueSorted([...categoryOptions, ...extraCats]),
    [categoryOptions, extraCats]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await catalogEnrichmentApi.incomplete({ limit, offset, q: q || undefined });
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
  }, [offset, q, showToast]);

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
      if (kind === "BRAND") setExtraBrands((p) => uniqueSorted([...p, name]));
      else setExtraCats((p) => uniqueSorted([...p, name]));
      showToast(`${kind === "BRAND" ? "Marca" : "Categoría"} «${name}» creada`);
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
        Productos sin marca o categoría (Air casi siempre entra acá: el CSV no trae marca).
        Escribí <strong className="text-surface-200">cualquier nombre</strong> — no hace falta que
        esté unificado. Si no existe, se crea al guardar o con «Crear».
      </p>

      <div className="rounded-xl border border-surface-800 bg-surface-900/40 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-white">Crear acá, sin ir a Marcas o Categorías</p>
        <div className="flex flex-wrap gap-2">
          <QuickCreate
            placeholder="Nueva marca…"
            value={newBrand}
            onChange={setNewBrand}
            busy={busy === "create-BRAND"}
            onCreate={async () => {
              const name = await createTerm("BRAND", newBrand);
              if (name) setNewBrand("");
            }}
          />
          <QuickCreate
            placeholder="Nueva categoría…"
            value={newCat}
            onChange={setNewCat}
            busy={busy === "create-CATEGORY"}
            onCreate={async () => {
              const name = await createTerm("CATEGORY", newCat);
              if (name) setNewCat("");
            }}
          />
        </div>
      </div>

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
        <p className="text-xs text-surface-500">{total} en total</p>
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
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-end">
                    <CreatableTermField
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
                    <CreatableTermField
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
                    <CreatableTermField
                      label="Subcategoría"
                      value={d.subcategory}
                      options={categories}
                      onChange={(v) =>
                        setDrafts((prev) => ({ ...prev, [key]: { ...d, subcategory: v } }))
                      }
                      optional
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

function QuickCreate({
  placeholder,
  value,
  onChange,
  onCreate,
  busy,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCreate();
          }
        }}
        placeholder={placeholder}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-1.5 text-sm text-white min-w-[160px]"
      />
      <button
        type="button"
        disabled={busy || !value.trim()}
        onClick={onCreate}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Crear
      </button>
    </div>
  );
}

function CreatableTermField({
  label,
  value,
  options,
  onChange,
  onCreate,
  optional,
  creating,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onCreate?: (name: string) => Promise<void>;
  optional?: boolean;
  creating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLLabelElement>(null);
  const q = value.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.toLowerCase().includes(q)).slice(0, 12)
    : options.slice(0, 12);
  const exact = options.some((o) => o.toLowerCase() === q);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <label ref={wrapRef} className="flex flex-col gap-0.5 min-w-[180px] relative">
      <span className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={optional ? "Opcional — escribí cualquiera" : "Escribí o elegí…"}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-700 bg-surface-950 shadow-xl">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className="block w-full text-left px-2.5 py-1.5 text-xs text-surface-200 hover:bg-surface-800"
            >
              {o}
            </button>
          ))}
          {q && !exact && onCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={() => {
                void onCreate(value.trim()).then(() => setOpen(false));
              }}
              className="flex w-full items-center gap-1 text-left px-2.5 py-1.5 text-xs font-medium text-brand-300 hover:bg-surface-800 border-t border-surface-800"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Crear «{value.trim()}»
            </button>
          )}
          {filtered.length === 0 && !(q && !exact && onCreate) && (
            <p className="px-2.5 py-2 text-[11px] text-surface-500">
              Escribí un nombre y guardá el producto — se crea solo.
            </p>
          )}
        </div>
      )}
    </label>
  );
}
