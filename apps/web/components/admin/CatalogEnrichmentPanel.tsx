"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
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
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tags,
  AlertTriangle,
  X,
  Link2,
} from "lucide-react";

type MainTab = "categories" | "brands" | "incomplete" | "config";
type ListFilter = "unlinked" | "all" | "linked";

const NEW_TERM = "__new__";
const PAGE = 60;

function providerName(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

function rowKey(r: { provider: string; rawKey: string }) {
  return `${r.provider}:${r.rawKey}`;
}

function clusterFingerprint(c: CatalogMergeCluster) {
  return `cluster:${c.members.map((m) => rowKey(m)).sort().join("|")}`;
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
            Unificá categorías y marcas. Primero las sugerencias; después seleccioná y fusioná.
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
            { label: "Canónicas", value: overview.termCount },
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
          terms={terms.filter((t) => t.kind === (tab === "categories" ? "CATEGORY" : "BRAND"))}
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

function UnifyBoard({
  kind,
  board,
  terms,
  busy,
  setBusy,
  onReload,
  showToast,
}: {
  kind: CatalogAliasKind;
  board: CatalogBoard | null;
  terms: CatalogTerm[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  onReload: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const noun = kind === "BRAND" ? "marcas" : "categorías";
  const [listFilter, setListFilter] = useState<ListFilter>("unlinked");
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, CatalogPreviewProduct[]>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [clusters, setClusters] = useState<CatalogMergeCluster[]>([]);
  const [aiMeta, setAiMeta] = useState<{ usedAi: boolean; total: number; hasMore: boolean; offset: number } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [mergeLabel, setMergeLabel] = useState("");
  const [mergePick, setMergePick] = useState(NEW_TERM);

  // Reset al cambiar kind
  useEffect(() => {
    setSelected(new Set());
    setExpanded(null);
    setClusters([]);
    setAiMeta(null);
    setDismissed([]);
    setListFilter("unlinked");
    setQ("");
    setProvider("");
    setVisibleCount(PAGE);
    setMergeLabel("");
    setMergePick(NEW_TERM);
  }, [kind]);

  const providers = useMemo(() => {
    const set = new Set((board?.rows ?? []).map((r) => r.provider));
    return [...set].sort();
  }, [board]);

  const filtered = useMemo(() => {
    if (!board) return [];
    const query = q.trim().toLowerCase();
    return board.rows
      .filter((r) => {
        if (listFilter === "unlinked" && r.termId) return false;
        if (listFilter === "linked" && !r.termId) return false;
        if (provider && r.provider !== provider) return false;
        if (!query) return true;
        return (
          r.rawKey.toLowerCase().includes(query) ||
          providerName(r.provider).toLowerCase().includes(query) ||
          (r.termLabel ?? "").toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        a.rawKey.localeCompare(b.rawKey, "es", { sensitivity: "base" }) ||
        providerName(a.provider).localeCompare(providerName(b.provider), "es")
      );
  }, [board, listFilter, provider, q]);

  const visible = filtered.slice(0, visibleCount);
  const selectedRows = useMemo(
    () => (board?.rows ?? []).filter((r) => selected.has(rowKey(r))),
    [board, selected]
  );

  const termOptions = useMemo(() => {
    const labels = new Set(terms.map((t) => t.label));
    for (const r of board?.rows ?? []) {
      if (r.termLabel) labels.add(r.termLabel);
    }
    return [...labels].sort((a, b) => a.localeCompare(b, "es"));
  }, [terms, board]);

  async function loadSuggestions(nextPage = false, extraExclude: string[] = []) {
    setBusy(`ai-${kind}`);
    try {
      const offset = nextPage && aiMeta ? aiMeta.offset + 15 : 0;
      const excludeKeys = [
        ...dismissed,
        ...extraExclude,
        ...(nextPage ? clusters.map(clusterFingerprint) : []),
      ];
      const res = await catalogEnrichmentApi.aiSuggestMerges(kind, {
        excludeKeys,
        offset,
      });
      setClusters(nextPage ? [...clusters, ...res.data.clusters] : res.data.clusters);
      setAiMeta({
        usedAi: res.data.usedAi,
        total: res.data.total,
        hasMore: res.data.hasMore,
        offset: res.data.offset,
      });
      if (!res.data.clusters.length) {
        showToast(
          nextPage
            ? "No hay más sugerencias por ahora"
            : res.data.unlinkedCount === 0
              ? "Todo ya está unificado"
              : "No encontré grupos parecidos. Probá seleccionando a mano."
        );
      } else if (!nextPage) {
        showToast(
          `${res.data.total} grupo(s) posible(s)${res.data.usedAi ? " · IA" : " · automático"}`
        );
      }
    } catch {
      showToast("Error al sugerir", false);
    } finally {
      setBusy(null);
    }
  }

  // Auto-cargar sugerencias al entrar
  useEffect(() => {
    if (!board) return;
    void loadSuggestions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, board?.stats.linkedCount]);

  async function applyCluster(c: CatalogMergeCluster) {
    setBusy(clusterFingerprint(c));
    try {
      await catalogEnrichmentApi.link({
        kind,
        items: c.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
        label: c.label,
        source: "AI",
      });
      showToast(`Unificado como «${c.label}» (${c.members.length} filas)`);
      setClusters((prev) => prev.filter((x) => clusterFingerprint(x) !== clusterFingerprint(c)));
      await onReload();
    } catch {
      showToast("No se pudo unificar", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyAllHighConfidence() {
    const batch = clusters.filter((c) => c.confidence === "alta");
    if (batch.length === 0) return showToast("No hay sugerencias de alta confianza");
    setBusy("ai-batch");
    let ok = 0;
    try {
      for (const c of batch) {
        await catalogEnrichmentApi.link({
          kind,
          items: c.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
          label: c.label,
          source: "AI",
        });
        ok++;
      }
      showToast(`${ok} grupo(s) unificados`);
      setClusters((prev) => prev.filter((c) => c.confidence !== "alta"));
      await onReload();
    } catch {
      showToast(`Error tras unificar ${ok}`, false);
      await onReload();
    } finally {
      setBusy(null);
    }
  }

  function dismissCluster(c: CatalogMergeCluster) {
    setDismissed((d) => [...d, clusterFingerprint(c)]);
    setClusters((prev) => prev.filter((x) => clusterFingerprint(x) !== clusterFingerprint(c)));
  }

  function toggleSelect(r: CatalogBoardRow) {
    const k = rowKey(r);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function toggleExpand(r: CatalogBoardRow) {
    const k = rowKey(r);
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    setExpanded(k);
    if (products[k]) return;
    try {
      const res = await catalogEnrichmentApi.preview({
        kind,
        provider: r.provider,
        rawKey: r.rawKey,
        limit: 15,
      });
      setProducts((p) => ({ ...p, [k]: res.data }));
    } catch {
      showToast("No se pudieron cargar productos", false);
    }
  }

  async function mergeSelected() {
    if (selectedRows.length < 1) return;
    const label = mergePick === NEW_TERM ? mergeLabel.trim() : mergePick;
    if (!label) return showToast("Elegí o escribí el nombre canónico", false);
    setBusy("merge-sel");
    try {
      await catalogEnrichmentApi.link({
        kind,
        items: selectedRows.map((r) => ({ provider: r.provider, rawKey: r.rawKey })),
        label,
      });
      showToast(
        selectedRows.length > 1
          ? `${selectedRows.length} ${noun} → «${label}»`
          : `Vinculado a «${label}»`
      );
      setSelected(new Set());
      setMergeLabel("");
      setMergePick(NEW_TERM);
      await onReload();
    } catch {
      showToast("No se pudo fusionar", false);
    } finally {
      setBusy(null);
    }
  }

  async function toggleVisible(r: CatalogBoardRow) {
    setBusy(`vis-${rowKey(r)}`);
    try {
      await catalogEnrichmentApi.visibility({
        kind,
        provider: r.provider,
        rawKey: r.rawKey,
        visible: !r.visible,
      });
      await onReload();
    } catch {
      showToast("No se pudo cambiar visibilidad", false);
    } finally {
      setBusy(null);
    }
  }

  const unlinkedCount = board?.stats.rawCount != null
    ? board.stats.rawCount - board.stats.linkedCount
    : 0;

  return (
    <div className="space-y-5">
      <p className="text-xs text-surface-400 bg-surface-900/50 border border-surface-800 rounded-lg px-3 py-2">
        <strong className="text-surface-200">Cómo usar:</strong> las sugerencias ya agrupan la misma
        marca/categoría en <em>todos</em> los distribuidores (ej. ASUS). Confirmá arriba, o tildá
        varias filas (orden alfabético) y fusioná con la barra fija.
      </p>

      {/* Sugerencias */}
      <section className="rounded-xl border border-surface-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/60 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Sugerencias para unificar
            </h3>
            <p className="text-[11px] text-surface-500 mt-0.5">
              {aiMeta
                ? `${aiMeta.total} grupo(s) · ${aiMeta.usedAi ? "con IA" : "detección automática"} · ${unlinkedCount} sin unificar`
                : "Buscando parecidos…"}
            </p>
          </div>
          <div className="flex gap-2">
            {clusters.some((c) => c.confidence === "alta") && (
              <button
                type="button"
                disabled={busy === "ai-batch"}
                onClick={() => void applyAllHighConfidence()}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {busy === "ai-batch" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Confirmar todas (alta)
              </button>
            )}
            {aiMeta?.hasMore && (
              <button
                type="button"
                disabled={busy === `ai-${kind}`}
                onClick={() => void loadSuggestions(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-surface-700 text-surface-300 hover:bg-surface-800 disabled:opacity-50"
              >
                Ver más
              </button>
            )}
            <button
              type="button"
              disabled={busy === `ai-${kind}`}
              onClick={() => {
                const extra = clusters.map(clusterFingerprint);
                setDismissed((d) => [...d, ...extra]);
                void loadSuggestions(false, extra);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50"
            >
              {busy === `ai-${kind}` ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Otras sugerencias
            </button>
          </div>
        </div>

        {busy === `ai-${kind}` && clusters.length === 0 ? (
          <p className="px-4 py-8 text-sm text-surface-500 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando {noun}…
          </p>
        ) : clusters.length === 0 ? (
          <div className="px-4 py-8 text-center space-y-2">
            <p className="text-sm text-surface-400">No hay sugerencias pendientes.</p>
            <p className="text-xs text-surface-500">
              Seleccioná filas parecidas en la lista y usá «Fusionar».
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-800/80 max-h-[340px] overflow-y-auto">
            {clusters.map((c) => {
              const fp = clusterFingerprint(c);
              const total = c.members.reduce((s, m) => s + m.count, 0);
              return (
                <li key={fp} className="px-4 py-3 flex flex-wrap gap-3 items-center justify-between hover:bg-surface-900/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      Unificar como{" "}
                      <span className="font-semibold text-brand-300">«{c.label}»</span>
                      <span className="text-surface-500 text-xs ml-2 tabular-nums">
                        {c.members.length} {c.members.length === 1 ? "fila" : "filas"} · {total} prod.
                        {c.confidence ? ` · ${c.confidence}` : ""}
                      </span>
                    </p>
                    {c.reason && (
                      <p className="text-[11px] text-surface-500 mt-0.5">{c.reason}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {c.members.map((m) => (
                        <span
                          key={rowKey(m)}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-300"
                        >
                          {providerName(m.provider)} · {m.rawKey}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => dismissCluster(c)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-surface-700 text-surface-400 hover:text-white"
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      disabled={busy === fp}
                      onClick={() => void applyCluster(c)}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      {busy === fp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Confirmar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Lista compacta */}
      <section className="rounded-xl border border-surface-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/60 flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-surface-700 overflow-hidden text-[11px]">
            {(
              [
                ["unlinked", `Sin unificar (${unlinkedCount})`],
                ["all", `Todas (${board?.stats.rawCount ?? 0})`],
                ["linked", `Unificadas (${board?.stats.linkedCount ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setListFilter(key);
                  setVisibleCount(PAGE);
                }}
                className={`px-2.5 py-1.5 ${
                  listFilter === key ? "bg-surface-800 text-white" : "text-surface-500 hover:text-surface-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisibleCount(PAGE);
              }}
              placeholder={`Buscar ${noun}…`}
              className="w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 py-1.5 text-sm text-white"
            />
          </div>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setVisibleCount(PAGE);
            }}
            className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white"
          >
            <option value="">Todos los proveedores</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {providerName(p)}
              </option>
            ))}
          </select>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-surface-400 hover:text-white"
            >
              Limpiar selección ({selected.size})
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-surface-500 border-b border-surface-800">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every((r) => selected.has(rowKey(r)))}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const r of visible) {
                          if (e.target.checked) next.add(rowKey(r));
                          else next.delete(rowKey(r));
                        }
                        return next;
                      });
                    }}
                    className="rounded border-surface-600"
                    title="Seleccionar visibles"
                  />
                </th>
                <th className="px-2 py-2 font-medium">Proveedor</th>
                <th className="px-2 py-2 font-medium">Nombre</th>
                <th className="px-2 py-2 font-medium text-right">Productos</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800/70">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-surface-500 text-sm">
                    Nada que mostrar con estos filtros.
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const k = rowKey(r);
                  const isOpen = expanded === k;
                  return (
                    <tr key={k} className={selected.has(k) ? "bg-brand-500/5" : "hover:bg-surface-900/40"}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(k)}
                          onChange={() => toggleSelect(r)}
                          className="rounded border-surface-600 mt-1"
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 whitespace-nowrap">
                          {providerName(r.provider)}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(r)}
                          className="flex items-start gap-1 text-left group"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-surface-500 mt-0.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-surface-500 mt-0.5" />
                          )}
                          <span>
                            <span className="text-white font-medium group-hover:text-brand-300">
                              {r.rawKey}
                            </span>
                            {isOpen && (
                              <ul className="mt-2 space-y-1 max-w-lg">
                                {(products[k] ?? []).length === 0 ? (
                                  <li className="text-[11px] text-surface-500 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando…
                                  </li>
                                ) : (
                                  (products[k] ?? []).map((p) => (
                                    <li key={`${p.provider}:${p.externalId}`} className="text-[11px] text-surface-400 truncate">
                                      {p.name}
                                    </li>
                                  ))
                                )}
                              </ul>
                            )}
                          </span>
                        </button>
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums text-surface-300">
                        {r.count}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {r.termLabel ? (
                          <span className="text-[11px] text-brand-300">→ {r.termLabel}</span>
                        ) : (
                          <span className="text-[11px] text-amber-300/80">pendiente</span>
                        )}
                        {r.linked.length > 0 && (
                          <span className="block text-[10px] text-surface-500 mt-0.5">
                            +{r.linked.length} vinculadas
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-right">
                        <button
                          type="button"
                          onClick={() => void toggleVisible(r)}
                          disabled={busy === `vis-${k}`}
                          className="p-1.5 rounded-lg border border-surface-700 text-surface-400 hover:text-white"
                          title={r.visible ? "Ocultar del catálogo" : "Mostrar"}
                        >
                          {r.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-amber-300" />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > visibleCount && (
          <div className="px-4 py-3 border-t border-surface-800 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE)}
              className="text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              Mostrar más ({filtered.length - visibleCount} restantes)
            </button>
          </div>
        )}
      </section>

      {/* Barra de fusión */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-[1400px]">
          <div className="rounded-xl border border-brand-500/40 bg-surface-950/95 backdrop-blur shadow-2xl px-4 py-3 flex flex-wrap gap-2 items-center">
            <Link2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <span className="text-sm text-white font-medium">
              {selected.size} seleccionada{selected.size > 1 ? "s" : ""}
            </span>
            <span className="text-xs text-surface-500 hidden sm:inline">→ Fusionar como</span>
            <select
              value={mergePick}
              onChange={(e) => setMergePick(e.target.value)}
              className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[140px]"
            >
              <option value={NEW_TERM}>+ Nombre nuevo…</option>
              {termOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {mergePick === NEW_TERM && (
              <input
                value={mergeLabel}
                onChange={(e) => setMergeLabel(e.target.value)}
                placeholder="Ej. Periféricos"
                className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[140px]"
              />
            )}
            <button
              type="button"
              disabled={busy === "merge-sel"}
              onClick={() => void mergeSelected()}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {busy === "merge-sel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Fusionar
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="p-1.5 rounded-lg text-surface-400 hover:text-white ml-auto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
