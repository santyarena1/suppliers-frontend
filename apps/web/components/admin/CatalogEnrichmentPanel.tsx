"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogBoard,
  type CatalogBoardRow,
  type CatalogIncompleteProduct,
  type CatalogMergeCluster,
  type CatalogPreviewProduct,
  type CatalogTerm,
  type Provider,
} from "@/lib/api";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GitMerge,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  MoveRight,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tags,
  AlertTriangle,
} from "lucide-react";

type MainTab = "categories" | "brands" | "incomplete" | "config" | "openai";

const NEW_TERM = "__new__";

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
    aiConfigured: boolean;
    productCount: number;
  } | null>(null);
  const [catBoard, setCatBoard] = useState<CatalogBoard | null>(null);
  const [brandBoard, setBrandBoard] = useState<CatalogBoard | null>(null);
  const [terms, setTerms] = useState<CatalogTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiClusters, setAiClusters] = useState<CatalogMergeCluster[]>([]);
  const [aiUsed, setAiUsed] = useState(false);
  const [openAiKey, setOpenAiKey] = useState("");
  const [filter, setFilter] = useState("");

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

  async function runAiSuggest(kind: CatalogAliasKind) {
    setBusy(`ai-${kind}`);
    try {
      const res = await catalogEnrichmentApi.aiSuggestMerges(kind);
      setAiClusters(res.data.clusters);
      setAiUsed(res.data.usedAi);
      showToast(
        res.data.clusters.length
          ? `${res.data.clusters.length} sugerencia(s)${res.data.usedAi ? " (IA)" : " (heurística)"}`
          : "Sin fusiones sugeridas"
      );
    } catch {
      showToast("Error al sugerir fusiones", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyCluster(cluster: CatalogMergeCluster, kind: CatalogAliasKind) {
    setBusy(`cluster-${cluster.label}`);
    try {
      await catalogEnrichmentApi.link({
        kind,
        items: cluster.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
        label: cluster.label,
        source: "AI",
      });
      showToast(`Fusionado como «${cluster.label}»`);
      setAiClusters((prev) => prev.filter((c) => c.label !== cluster.label));
      await load();
    } catch {
      showToast("No se pudo fusionar", false);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !catBoard) {
    return (
      <div className="flex items-center justify-center py-20 text-surface-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-400" />
            Catálogo
          </h2>
          <p className="text-sm text-surface-500 mt-1 max-w-2xl">
            Unificá categorías y marcas de todos los distribuidores, trasladá productos,
            definí jerarquías y completá lo que falta.
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Productos", value: overview.productCount },
            { label: "Términos", value: overview.termCount },
            { label: "Incompletos", value: overview.incompleteCount, warn: overview.incompleteCount > 0 },
            { label: "OpenAI", value: overview.aiConfigured ? "ON" : "OFF" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-xl border px-3 py-2.5 ${
                s.warn ? "border-amber-500/30 bg-amber-500/5" : "border-surface-800 bg-surface-900/40"
              }`}
            >
              <p className="text-[10px] text-surface-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-semibold text-white tabular-nums">{s.value}</p>
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
            ["config", "Configuración", Settings2],
            ["openai", "OpenAI", KeyRound],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setAiClusters([]);
              setFilter("");
            }}
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
        <BoardTab
          kind={tab === "categories" ? "CATEGORY" : "BRAND"}
          board={tab === "categories" ? catBoard : brandBoard}
          terms={terms.filter((t) => t.kind === (tab === "categories" ? "CATEGORY" : "BRAND") || (tab === "categories" && t.kind === "SUBCATEGORY"))}
          filter={filter}
          onFilterChange={setFilter}
          busy={busy}
          aiClusters={aiClusters}
          aiUsed={aiUsed}
          onAiSuggest={() => void runAiSuggest(tab === "categories" ? "CATEGORY" : "BRAND")}
          onApplyCluster={(c) => void applyCluster(c, tab === "categories" ? "CATEGORY" : "BRAND")}
          onReload={load}
          showToast={showToast}
          setBusy={setBusy}
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

      {tab === "openai" && (
        <OpenAiTab
          configured={overview?.aiConfigured ?? false}
          openAiKey={openAiKey}
          setOpenAiKey={setOpenAiKey}
          onSaved={async () => {
            setOpenAiKey("");
            await load();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function BoardTab({
  kind,
  board,
  terms,
  filter,
  onFilterChange,
  busy,
  aiClusters,
  aiUsed,
  onAiSuggest,
  onApplyCluster,
  onReload,
  showToast,
  setBusy,
}: {
  kind: CatalogAliasKind;
  board: CatalogBoard | null;
  terms: CatalogTerm[];
  filter: string;
  onFilterChange: (v: string) => void;
  busy: string | null;
  aiClusters: CatalogMergeCluster[];
  aiUsed: boolean;
  onAiSuggest: () => void;
  onApplyCluster: (c: CatalogMergeCluster) => void;
  onReload: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
  setBusy: (v: string | null) => void;
}) {
  const noun = kind === "BRAND" ? "marcas" : "categorías";
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!board) return [];
    if (!q) return board.rows;
    return board.rows.filter(
      (r) =>
        r.rawKey.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        (r.termLabel ?? "").toLowerCase().includes(q) ||
        providerName(r.provider).toLowerCase().includes(q)
    );
  }, [board, filter]);

  const termOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const t of terms.filter((t) => t.kind === kind)) labels.add(t.label);
    for (const r of board?.rows ?? []) {
      if (r.termLabel) labels.add(r.termLabel);
      labels.add(r.rawKey);
    }
    return [...labels].sort((a, b) => a.localeCompare(b, "es"));
  }, [terms, board, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={`Buscar ${noun}…`}
            className="w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="button"
          disabled={busy === `ai-${kind}`}
          onClick={onAiSuggest}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50"
        >
          {busy === `ai-${kind}` ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          Sugerir con IA
        </button>
      </div>

      {board && (
        <p className="text-xs text-surface-500">
          {board.stats.rawCount} {noun} · {board.stats.linkedCount} vinculadas ·{" "}
          {board.stats.termCount} canónicas · {board.stats.hiddenCount} ocultas
        </p>
      )}

      {aiClusters.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-brand-400" />
            Sugerencias de fusión {aiUsed ? "(IA)" : "(heurística)"}
          </h3>
          {aiClusters.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3 flex flex-wrap gap-3 items-center justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm text-white font-medium">→ «{c.label}»</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {c.members.map((m) => (
                    <span
                      key={`${m.provider}:${m.rawKey}`}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-300"
                    >
                      {providerName(m.provider)}: {m.rawKey} ({m.count})
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === `cluster-${c.label}`}
                onClick={() => onApplyCluster(c)}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
              >
                {busy === `cluster-${c.label}` ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Fusionar
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        <div className="divide-y divide-surface-800/80 max-h-[640px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-sm text-surface-500 text-center">Sin resultados.</p>
          ) : (
            filtered.map((row) => (
              <RawRow
                key={row.id}
                kind={kind}
                row={row}
                termOptions={termOptions}
                busy={busy}
                setBusy={setBusy}
                onReload={onReload}
                showToast={showToast}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function RawRow({
  kind,
  row,
  termOptions,
  busy,
  setBusy,
  onReload,
  showToast,
}: {
  kind: CatalogAliasKind;
  row: CatalogBoardRow;
  termOptions: string[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  onReload: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [products, setProducts] = useState<CatalogPreviewProduct[] | null>(null);
  const [target, setTarget] = useState(row.termLabel ?? NEW_TERM);
  const [newLabel, setNewLabel] = useState(row.rawKey);
  const [deleteEmpty, setDeleteEmpty] = useState(false);
  const [mode, setMode] = useState<"link" | "move">("link");

  useEffect(() => {
    setTarget(row.termLabel ?? NEW_TERM);
    setNewLabel(row.rawKey);
  }, [row.termLabel, row.rawKey]);

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (products) return;
    try {
      const res = await catalogEnrichmentApi.preview({
        kind,
        provider: row.provider,
        rawKey: row.rawKey,
        limit: 20,
      });
      setProducts(res.data);
    } catch {
      showToast("No se pudieron cargar productos", false);
    }
  }

  async function toggleVisible() {
    setBusy(`vis-${row.id}`);
    try {
      await catalogEnrichmentApi.visibility({
        kind,
        provider: row.provider,
        rawKey: row.rawKey,
        visible: !row.visible,
      });
      await onReload();
    } catch {
      showToast("No se pudo cambiar visibilidad", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyAction() {
    const label = target === NEW_TERM ? newLabel.trim() : target;
    if (!label) return showToast("Elegí o escribí un destino", false);
    setBusy(row.id);
    try {
      if (mode === "link") {
        await catalogEnrichmentApi.link({
          kind,
          items: [{ provider: row.provider, rawKey: row.rawKey }],
          label,
        });
        showToast(`Vinculado a «${label}»`);
      } else {
        const res = await catalogEnrichmentApi.move({
          kind,
          from: { provider: row.provider, rawKey: row.rawKey },
          toLabel: label,
          deleteEmptySourceTerm: deleteEmpty,
        });
        showToast(`Trasladados ${res.data.moved} producto(s) → «${label}»`);
      }
      await onReload();
    } catch {
      showToast("No se pudo aplicar", false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => void toggleExpand()}
          className="p-1 rounded text-surface-400 hover:text-white hover:bg-surface-800"
          title="Ver productos"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-800 text-surface-300">
          {providerName(row.provider)}
        </span>
        <span className="text-sm text-white font-medium">{row.rawKey}</span>
        <span className="text-xs text-surface-500 tabular-nums">{row.count} prod.</span>
        {row.termLabel && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-300">
            → {row.termLabel}
          </span>
        )}
        {row.parentLabel && (
          <span className="text-[11px] text-surface-500">sub de {row.parentLabel}</span>
        )}
        {row.linked.length > 0 && (
          <span className="text-[11px] text-surface-400" title={row.linked.map((l) => `${providerName(l.provider)}:${l.rawKey}`).join(", ")}>
            +{row.linked.length} vinculadas
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => void toggleVisible()}
          disabled={busy === `vis-${row.id}`}
          className={`p-1.5 rounded-lg border ${
            row.visible
              ? "border-surface-700 text-surface-300 hover:bg-surface-800"
              : "border-amber-500/40 text-amber-300 bg-amber-500/10"
          }`}
          title={row.visible ? "Ocultar del catálogo" : "Mostrar en catálogo"}
        >
          {row.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center pl-7">
        <div className="flex rounded-lg border border-surface-700 overflow-hidden text-[11px]">
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`px-2.5 py-1.5 flex items-center gap-1 ${mode === "link" ? "bg-surface-800 text-white" : "text-surface-500"}`}
          >
            <Link2 className="w-3 h-3" /> Vincular
          </button>
          <button
            type="button"
            onClick={() => setMode("move")}
            className={`px-2.5 py-1.5 flex items-center gap-1 ${mode === "move" ? "bg-surface-800 text-white" : "text-surface-500"}`}
          >
            <MoveRight className="w-3 h-3" /> Trasladar
          </button>
        </div>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[160px]"
        >
          <option value={NEW_TERM}>+ Crear nueva…</option>
          {termOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {target === NEW_TERM && (
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nombre canónico"
            className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[140px]"
          />
        )}
        {mode === "move" && (
          <label className="flex items-center gap-1.5 text-[11px] text-surface-400">
            <input
              type="checkbox"
              checked={deleteEmpty}
              onChange={(e) => setDeleteEmpty(e.target.checked)}
              className="rounded border-surface-600"
            />
            Eliminar origen vacío
          </label>
        )}
        <button
          type="button"
          disabled={busy === row.id}
          onClick={() => void applyAction()}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
        >
          {busy === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Aplicar
        </button>
      </div>

      {expanded && (
        <div className="ml-7 rounded-lg border border-surface-800 bg-surface-950/50 overflow-hidden">
          {!products ? (
            <p className="px-3 py-4 text-xs text-surface-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
            </p>
          ) : products.length === 0 ? (
            <p className="px-3 py-4 text-xs text-surface-500">Sin productos.</p>
          ) : (
            <ul className="divide-y divide-surface-800/60 max-h-56 overflow-y-auto">
              {products.map((p) => (
                <li key={`${p.provider}:${p.externalId}`} className="px-3 py-2 text-xs">
                  <p className="text-surface-200 truncate">{p.name}</p>
                  <p className="text-surface-500 mt-0.5">
                    {p.sku || p.partNumber || p.externalId}
                    {p.brand ? ` · ${p.brand}` : ""}
                    {p.category ? ` · ${p.category}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
        <p className="text-xs text-surface-500">{total} sin marca o categoría</p>
      </div>

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        {loading ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-sm text-surface-500 text-center">Todos los productos tienen marca y categoría.</p>
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
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">sin marca</span>
                      )}
                      {p.missingCategory && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">sin categoría</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
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
                      onChange={(v) => setDrafts((prev) => ({ ...prev, [key]: { ...d, subcategory: v } }))}
                      optional
                    />
                    <button
                      type="button"
                      disabled={busy === `ai-${key}`}
                      onClick={() => void suggestAi(p)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {busy === `ai-${key}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      IA
                    </button>
                    <button
                      type="button"
                      disabled={busy === key || (!d.brand && !d.category)}
                      onClick={() => void save(p)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                    >
                      {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
    <div className="space-y-5 max-w-3xl">
      <form onSubmit={create} className="rounded-xl border border-surface-800 p-4 space-y-3 bg-surface-900/30">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand-400" /> Crear término
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
        <p className="text-[11px] text-surface-500">
          Ejemplo: subcategoría «Mouse» con padre «Periféricos».
        </p>
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
                  {t.parent && (
                    <span className="text-[11px] text-surface-500">← {t.parent.label}</span>
                  )}
                  <span className="text-[11px] text-surface-500">{t._count?.aliases ?? 0} vínculos</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => void toggleVis(t)}
                    className="p-1.5 rounded-lg border border-surface-700 text-surface-300"
                  >
                    {t.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-300" />}
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

function OpenAiTab({
  configured,
  openAiKey,
  setOpenAiKey,
  onSaved,
  showToast,
}: {
  configured: boolean;
  openAiKey: string;
  setOpenAiKey: (v: string) => void;
  onSaved: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!openAiKey.trim()) return;
    setSaving(true);
    try {
      await catalogEnrichmentApi.saveOpenAi(openAiKey.trim());
      showToast("API key guardada");
      await onSaved();
    } catch {
      showToast("No se pudo guardar", false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-surface-800 p-4 bg-surface-900/30 space-y-3 max-w-lg">
      <h3 className="text-sm font-medium text-white">API key de OpenAI</h3>
      <p className="text-xs text-surface-500">
        Opcional. Mejora sugerencias de fusión y completado de productos.
        {configured && <span className="text-emerald-400"> Activa.</span>}
      </p>
      <form onSubmit={save} className="flex gap-2">
        <input
          type="password"
          value={openAiKey}
          onChange={(e) => setOpenAiKey(e.target.value)}
          placeholder="sk-…"
          className="flex-1 rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-2 text-sm text-white font-mono"
        />
        <button
          type="submit"
          disabled={saving || !openAiKey.trim()}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </form>
    </section>
  );
}
