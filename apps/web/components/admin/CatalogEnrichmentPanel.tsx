"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogBoard,
  type CatalogTerm,
  type Provider,
} from "@/lib/api";
import {
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Tags,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import UnifyBoard from "./UnifyBoard";
import IncompleteTab from "./IncompleteTab";
import { aggregateLabelChoices } from "@/lib/catalog-menu";

type MainTab = "categories" | "brands" | "incomplete" | "config";

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      if (!opts?.silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const purged = await catalogEnrichmentApi.purgeAirCodes();
        if (cancelled) return;
        const n = purged.data.productsCleared + purged.data.aliasesDeleted + purged.data.termsDeleted;
        if (n > 0) {
          showToast(
            `Se sacaron códigos viejos de Air (${purged.data.productsCleared} productos, ${purged.data.aliasesDeleted} vínculos)`
          );
        }
      } catch {
        // Si falla la limpieza, igual se carga el tablero.
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, showToast]);

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
          terms={terms.filter((t) =>
            tab === "categories" ? t.kind === "CATEGORY" || t.kind === "SUBCATEGORY" : t.kind === "BRAND"
          )}
          busy={busy}
          setBusy={setBusy}
          onReload={() => load({ silent: true })}
          showToast={showToast}
        />
      )}

      {tab === "incomplete" && (
        <IncompleteTab
          brandChoices={aggregateLabelChoices(
            (brandBoard?.rows ?? []).map((r) => ({
              ...r,
              provider: PROVIDER_LABELS[r.provider as Provider] ?? r.provider.replace(/_/g, " "),
            })),
            terms.filter((t) => t.kind === "BRAND").map((t) => t.label)
          )}
          categoryChoices={aggregateLabelChoices(
            (catBoard?.rows ?? []).map((r) => ({
              ...r,
              provider: PROVIDER_LABELS[r.provider as Provider] ?? r.provider.replace(/_/g, " "),
            })),
            terms.filter((t) => t.kind === "CATEGORY" || t.kind === "SUBCATEGORY").map((t) => t.label)
          )}
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
