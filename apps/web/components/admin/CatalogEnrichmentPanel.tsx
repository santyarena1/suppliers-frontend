"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogBoard,
  type CatalogIncompleteProduct,
  type CatalogTerm,
  type Provider,
} from "@/lib/api";
import {
  Check,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tags,
  AlertTriangle,
} from "lucide-react";
import UnifyBoard from "./UnifyBoard";

type MainTab = "categories" | "brands" | "incomplete" | "config";

function providerName(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

export default function CatalogEnrichmentPanel({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [tab, setTab] = useState<MainTab>("categories");
  const [overview, setOverview] = useState<{
    incompleteCount: number;
    termCount: number;
    productCount: number;
  } | null>(null);
  const [catBoard, setCatBoard] = useState<CatalogBoard | null>(null);
  const [brandBoard, setBrandBoard] = useState<CatalogBoard | null>(null);
  const [terms, setTerms] = useState<CatalogTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, cats, brands, allTerms] = await Promise.all([
        catalogEnrichmentApi.overview(),
        catalogEnrichmentApi.board("CATEGORY"),
        catalogEnrichmentApi.board("BRAND"),
        catalogEnrichmentApi.terms(),
      ]);
      setOverview(ov.data);
      setCatBoard(cats.data);
      setBrandBoard(brands.data);
      setTerms(allTerms.data);
    } catch {
      showToast("No se pudo cargar el catálogo", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !catBoard) {
    return (
      <div className="flex items-center justify-center py-20 text-surface-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-400" />
            Catálogo
          </h2>
          <p className="text-sm text-surface-500 mt-1">
            Unificá categorías y marcas que son lo mismo. El grupo queda con el nombre que elijas y todos los productos adentro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-surface-700 text-surface-300 hover:bg-surface-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </header>

      {overview && (
        <div className="grid grid-cols-3 gap-2 max-w-xl">
          {[
            { label: "Productos", value: overview.productCount },
            { label: "Grupos", value: overview.termCount },
            { label: "Incompletos", value: overview.incompleteCount, warn: overview.incompleteCount > 0 },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border px-3 py-2 ${
                s.warn ? "border-amber-500/30 bg-amber-500/5" : "border-surface-800 bg-surface-900/40"
              }`}
            >
              <p className="text-[10px] text-surface-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-semibold text-white tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-surface-800 pb-px">
        {(
          [
            ["categories", "Categorías", Layers],
            ["brands", "Marcas", Tags],
            ["incomplete", "Incompletos", AlertTriangle],
            ["config", "Términos", Settings2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2.5 border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-brand-500 text-brand-300"
                : "border-transparent text-surface-500 hover:text-surface-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {key === "incomplete" && overview && overview.incompleteCount > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                {overview.incompleteCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {(tab === "categories" || tab === "brands") && (
        <UnifyBoard
          kind={tab === "categories" ? "CATEGORY" : "BRAND"}
          board={tab === "categories" ? catBoard : brandBoard}
          busy={busy}
          setBusy={setBusy}
          onReload={load}
          showToast={showToast}
        />
      )}

      {tab === "incomplete" && (
        <IncompleteTab
          brandOptions={terms.filter((t) => t.kind === "BRAND").map((t) => t.label)}
          categoryOptions={terms.filter((t) => t.kind === "CATEGORY").map((t) => t.label)}
          subcategoryOptions={terms.filter((t) => t.kind === "SUBCATEGORY").map((t) => t.label)}
          showToast={showToast}
          onChanged={load}
        />
      )}

      {tab === "config" && (
        <ConfigTab terms={terms} onChanged={load} showToast={showToast} busy={busy} setBusy={setBusy} />
      )}
    </div>
  );
}


function IncompleteTab({
  brandOptions,
  categoryOptions,
  subcategoryOptions,
  showToast,
  onChanged,
}: {
  brandOptions: string[];
  categoryOptions: string[];
  subcategoryOptions: string[];
  showToast: (msg: string, ok?: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [items, setItems] = useState<CatalogIncompleteProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { brand: string; category: string; subcategory: string }>
  >({});
  const limit = 30;

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
        <p className="text-xs text-surface-500">
          {total} sin marca o categoría ·{" "}
          <Link href="/configuracion?tab=credentials" className="text-brand-400 hover:underline">
            Credenciales API
          </Link>
        </p>
      </div>

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        {loading ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center">
            Todos los productos tienen marca y categoría.
          </p>
        ) : (
          <div className="divide-y divide-surface-800/80">
            {items.map((p) => {
              const key = `${p.provider}:${p.externalId}`;
              const d = drafts[key] ?? { brand: "", category: "", subcategory: "" };
              return (
                <div key={key} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap gap-2 items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        {providerName(p.provider)} · {p.sku || p.partNumber || p.externalId}
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
                    <TermSelect
                      label="Marca"
                      value={d.brand}
                      options={brandOptions}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: { ...d, brand: v } }))}
                    />
                    <TermSelect
                      label="Categoría"
                      value={d.category}
                      options={categoryOptions}
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: { ...d, category: v } }))}
                    />
                    <TermSelect
                      label="Subcategoría"
                      value={d.subcategory}
                      options={subcategoryOptions}
                      onChange={(v) =>
                        setDrafts((prev) => ({ ...prev, [key]: { ...d, subcategory: v } }))
                      }
                      optional
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

function TermSelect({
  label,
  value,
  options,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="flex flex-col gap-0.5 min-w-[140px]">
      <span className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white"
      >
        <option value="">{optional ? "—" : `Elegir ${label.toLowerCase()}…`}</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConfigTab({
  terms,
  onChanged,
  showToast,
  busy,
  setBusy,
}: {
  terms: CatalogTerm[];
  onChanged: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
  busy: string | null;
  setBusy: (v: string | null) => void;
}) {
  const [kind, setKind] = useState<CatalogAliasKind>("CATEGORY");
  const [label, setLabel] = useState("");
  const [parentId, setParentId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editParent, setEditParent] = useState("");

  const filtered = terms.filter((t) => t.kind === kind);
  const parentOptions = terms.filter((t) => t.kind === "CATEGORY");

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy("create-term");
    try {
      await catalogEnrichmentApi.createTerm({
        kind,
        label: label.trim(),
        parentId: parentId || null,
      });
      setLabel("");
      setParentId("");
      showToast("Término creado");
      await onChanged();
    } catch {
      showToast("No se pudo crear", false);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(id: string) {
    setBusy(`edit-${id}`);
    try {
      await catalogEnrichmentApi.updateTerm(id, {
        label: editLabel.trim() || undefined,
        parentId: editParent || null,
      });
      setEditId(null);
      showToast("Actualizado");
      await onChanged();
    } catch {
      showToast("No se pudo actualizar", false);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del-${id}`);
    try {
      await catalogEnrichmentApi.deleteTerm(id, true);
      showToast("Eliminado");
      await onChanged();
    } catch {
      showToast("No se pudo eliminar", false);
    } finally {
      setBusy(null);
    }
  }

  async function toggleVis(t: CatalogTerm) {
    setBusy(`vis-${t.id}`);
    try {
      await catalogEnrichmentApi.updateTerm(t.id, { visible: !t.visible });
      await onChanged();
    } catch {
      showToast("Error de visibilidad", false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full space-y-5">
      <form
        onSubmit={create}
        className="rounded-xl border border-surface-800 p-4 space-y-3 bg-surface-900/30"
      >
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand-400" /> Crear término canónico
        </h3>
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CatalogAliasKind)}
            className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-2 text-xs text-white"
          >
            <option value="CATEGORY">Categoría</option>
            <option value="SUBCATEGORY">Subcategoría</option>
            <option value="BRAND">Marca</option>
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre"
            className="flex-1 min-w-[160px] rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-2 text-sm text-white"
          />
          {(kind === "CATEGORY" || kind === "SUBCATEGORY") && (
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-2 text-xs text-white min-w-[160px]"
            >
              <option value="">Sin padre</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={busy === "create-term" || !label.trim()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-50"
          >
            Crear
          </button>
        </div>
      </form>

      <div className="flex gap-1">
        {(["CATEGORY", "SUBCATEGORY", "BRAND"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`text-xs px-3 py-1.5 rounded-lg ${
              kind === k ? "bg-surface-800 text-white" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            {k === "CATEGORY" ? "Categorías" : k === "SUBCATEGORY" ? "Subcategorías" : "Marcas"}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-surface-800 divide-y divide-surface-800/80">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-surface-500 text-center">Sin términos aún.</p>
        ) : (
          filtered.map((t) => (
            <div key={t.id} className="px-4 py-3 flex flex-wrap gap-2 items-center">
              {editId === t.id ? (
                <>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-white"
                  />
                  <select
                    value={editParent}
                    onChange={(e) => setEditParent(e.target.value)}
                    className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Sin padre</option>
                    {parentOptions
                      .filter((p) => p.id !== t.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveEdit(t.id)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white"
                  >
                    Guardar
                  </button>
                  <button type="button" onClick={() => setEditId(null)} className="text-xs text-surface-400">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-white font-medium">{t.label}</span>
                  {t.parent && <span className="text-[11px] text-surface-500">← {t.parent.label}</span>}
                  <span className="text-[11px] text-surface-500">{t._count?.aliases ?? 0} vínculos</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void toggleVis(t)}
                    className="p-1.5 rounded-lg border border-surface-700 text-surface-300"
                  >
                    {t.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(t.id);
                      setEditLabel(t.label);
                      setEditParent(t.parentId ?? "");
                    }}
                    className="text-xs px-2 py-1 rounded-lg border border-surface-700 text-surface-300"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={busy === `del-${t.id}`}
                    onClick={() => void remove(t.id)}
                    className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-300"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
