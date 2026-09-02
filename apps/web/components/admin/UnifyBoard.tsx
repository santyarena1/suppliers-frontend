"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { defaultUnifyName, selectableUnifyNames, uniquePreserve } from "@/lib/unify-names";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CatalogBoard,
  type CatalogBoardRow,
  type CatalogMergeCluster,
  type CatalogPreviewProduct,
  type CatalogTerm,
  type CatalogTermCard,
  type Provider,
} from "@/lib/api";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import CatalogMenuPreview from "./CatalogMenuPreview";
import SendToMenuDialog, { type MenuTarget } from "./SendToMenuDialog";
import { aggregateLabelChoices, productCountByTerm } from "@/lib/catalog-menu";

type ListFilter = "unlinked" | "linked";

const NEW_NAME = "__new__";
const PAGE = 60;

function providerName(provider: string) {
  return PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
}

function rowKey(r: { provider: string; rawKey: string }) {
  return `${r.provider}:${r.rawKey}`;
}

type ClusterMember = CatalogMergeCluster["members"][number];
type EditableCluster = CatalogMergeCluster & { id: string };

function clusterFingerprint(c: { members: ClusterMember[] }) {
  return `cluster:${c.members.map((m) => rowKey(m)).sort().join("|")}`;
}

function withClusterId(c: CatalogMergeCluster): EditableCluster {
  return { ...c, id: clusterFingerprint(c) };
}

function clusterNameOptions(c: CatalogMergeCluster) {
  return uniquePreserve(
    [...c.members].sort((a, b) => b.count - a.count).map((m) => m.rawKey)
  );
}

function defaultClusterName(c: CatalogMergeCluster) {
  const options = clusterNameOptions(c);
  const hit = options.find((o) => o.toLowerCase() === c.label.toLowerCase());
  return hit ?? options[0] ?? c.label;
}

export default function UnifyBoard({
  kind,
  board,
  terms = [],
  busy,
  setBusy,
  onReload,
  showToast,
}: {
  kind: CatalogAliasKind;
  board: CatalogBoard | null;
  terms?: CatalogTerm[];
  busy: string | null;
  setBusy: (v: string | null) => void;
  onReload: () => Promise<void>;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const noun = kind === "BRAND" ? "marca" : "categoría";
  const nounPlural = kind === "BRAND" ? "marcas" : "categorías";
  const [listFilter, setListFilter] = useState<ListFilter>("unlinked");
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [products, setProducts] = useState<Record<string, CatalogPreviewProduct[]>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [clusters, setClusters] = useState<EditableCluster[]>([]);
  const [clusterPicks, setClusterPicks] = useState<Record<string, string>>({});
  const [aiMeta, setAiMeta] = useState<{ usedAi: boolean; total: number; hasMore: boolean; offset: number } | null>(
    null
  );
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [mergePick, setMergePick] = useState("");
  const [mergeLabel, setMergeLabel] = useState("");
  const [mergeExistingId, setMergeExistingId] = useState("");
  const [highlightTermId, setHighlightTermId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setExpanded(null);
    setClusters([]);
    setClusterPicks({});
    setAiMeta(null);
    setDismissed([]);
    setListFilter("unlinked");
    setQ("");
    setProvider("");
    setVisibleCount(PAGE);
    setMergePick("");
    setMergeLabel("");
    setMergeExistingId("");
    setHighlightTermId(null);
  }, [kind]);

  const providers = useMemo(() => {
    const set = new Set((board?.rows ?? []).map((r) => r.provider));
    return [...set].sort();
  }, [board]);

  const selectedRows = useMemo(
    () => (board?.rows ?? []).filter((r) => selected.has(rowKey(r))),
    [board, selected]
  );

  const nameChoices = useMemo(() => selectableUnifyNames(selectedRows), [selectedRows]);

  useEffect(() => {
    if (selectedRows.length === 0) {
      setMergePick("");
      setMergeLabel("");
      setMergeExistingId("");
      return;
    }
    setMergePick((prev) => {
      if (prev === NEW_NAME) return prev;
      if (prev && nameChoices.includes(prev)) return prev;
      return defaultUnifyName(selectedRows);
    });
  }, [selectedRows, nameChoices]);

  const filteredRows = useMemo(() => {
    if (!board) return [];
    const query = q.trim().toLowerCase();
    return board.rows
      .filter((r) => {
        if (listFilter === "unlinked" && r.termId) return false;
        if (provider && r.provider !== provider) return false;
        if (!query) return true;
        return (
          r.rawKey.toLowerCase().includes(query) ||
          providerName(r.provider).toLowerCase().includes(query)
        );
      })
      .sort(
        (a, b) =>
          a.rawKey.localeCompare(b.rawKey, "es", { sensitivity: "base" }) ||
          providerName(a.provider).localeCompare(providerName(b.provider), "es")
      );
  }, [board, listFilter, provider, q]);

  const unifiedGroups = useMemo(() => {
    if (!board) return [];
    const query = q.trim().toLowerCase();
    return board.terms
      .filter((t) => t.members.length > 0)
      .filter((t) => {
        if (provider && !t.members.some((m) => m.provider === provider)) return false;
        if (!query) return true;
        return (
          t.label.toLowerCase().includes(query) ||
          t.members.some(
            (m) =>
              m.rawKey.toLowerCase().includes(query) ||
              providerName(m.provider).toLowerCase().includes(query)
          )
        );
      });
  }, [board, provider, q]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const visibleGroups = unifiedGroups.slice(0, visibleCount);

  const unlinkedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of board?.rows ?? []) {
      if (!r.termId) set.add(rowKey(r));
    }
    return set;
  }, [board]);

  const liveClusters = useMemo(
    () =>
      clusters
        .map((c) => ({
          ...c,
          members: c.members.filter((m) => unlinkedKeys.has(rowKey(m))),
        }))
        .filter((c) => c.members.length >= 1),
    [clusters, unlinkedKeys]
  );

  const addCandidates = useMemo(
    () => (board?.rows ?? []).filter((r) => !r.termId),
    [board]
  );

  const existingGroups = useMemo(
    () => (board?.terms ?? []).filter((t) => t.members.length > 0),
    [board]
  );

  const groupCount = board?.stats.groupCount ?? existingGroups.length;
  const unlinkedCount =
    board?.stats.rawCount != null ? board.stats.rawCount - board.stats.linkedCount : 0;

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
      const incoming = res.data.clusters.map(withClusterId);
      const nextClusters = nextPage ? [...clusters, ...incoming] : incoming;
      setClusters(nextClusters);
      setClusterPicks((prev) => {
        const next = nextPage ? { ...prev } : {};
        for (const c of incoming) {
          if (!next[c.id]) next[c.id] = defaultClusterName(c);
        }
        return next;
      });
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

  useEffect(() => {
    if (!board) return;
    void loadSuggestions(false);
    // Solo al cambiar de categorías/marcas. Reconsultar IA después de cada
    // unificación rehacía el tablero y hacía reaparecer lo recién unificado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function goToUnified(termId: string) {
    setListFilter("linked");
    setHighlightTermId(termId);
    setQ("");
    setProvider("");
    setVisibleCount(PAGE);
    setExpanded(`term:${termId}`);
    setProducts((p) => {
      const next = { ...p };
      delete next[`term:${termId}`];
      return next;
    });
    window.setTimeout(() => {
      document.getElementById(`unify-group-${termId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    void catalogEnrichmentApi
      .preview({ kind, termId, limit: 20 })
      .then((res) => setProducts((p) => ({ ...p, [`term:${termId}`]: res.data })))
      .catch(() => setProducts((p) => ({ ...p, [`term:${termId}`]: [] })));
  }

  async function applyCluster(c: EditableCluster) {
    if (c.members.length < 2) return showToast(`Elegí al menos dos ${nounPlural} para unificar`);
    const label = (clusterPicks[c.id] || defaultClusterName(c)).trim();
    if (!label) return showToast("Elegí el nombre que queda", false);
    setBusy(c.id);
    try {
      const res = await catalogEnrichmentApi.link({
        kind,
        items: c.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
        label,
        source: "AI",
      });
      showToast(`Quedó «${label}» con ${c.members.length} nombres`);
      setClusters((prev) => prev.filter((x) => x.id !== c.id));
      await onReload();
      goToUnified(res.data.term.id);
    } catch {
      showToast("No se pudo unificar", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyAllHighConfidence() {
    const batch = liveClusters.filter((c) => c.confidence === "alta" && c.members.length >= 2);
    if (batch.length === 0) return showToast("No hay sugerencias de alta confianza");
    setBusy("ai-batch");
    let ok = 0;
    let lastTermId: string | null = null;
    try {
      for (const c of batch) {
        const label = (clusterPicks[c.id] || defaultClusterName(c)).trim();
        const res = await catalogEnrichmentApi.link({
          kind,
          items: c.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
          label,
          source: "AI",
        });
        lastTermId = res.data.term.id;
        ok++;
      }
      showToast(`${ok} grupo(s) unificados`);
      setClusters((prev) => prev.filter((c) => c.confidence !== "alta"));
      await onReload();
      if (lastTermId) goToUnified(lastTermId);
    } catch {
      showToast(`Error tras unificar ${ok}`, false);
      await onReload();
    } finally {
      setBusy(null);
    }
  }

  function dismissCluster(c: EditableCluster) {
    setDismissed((d) => [...d, c.id]);
    setClusters((prev) => prev.filter((x) => x.id !== c.id));
  }

  function dropClusterMember(c: EditableCluster, key: string) {
    setClusters((prev) =>
      prev
        .map((x) =>
          x.id === c.id ? { ...x, members: x.members.filter((m) => rowKey(m) !== key) } : x
        )
        .filter((x) => x.members.length > 0)
    );
    setClusterPicks((prev) => {
      const current = prev[c.id];
      const remaining = c.members.filter((m) => rowKey(m) !== key);
      if (!current || remaining.some((m) => m.rawKey === current)) return prev;
      return { ...prev, [c.id]: defaultClusterName({ ...c, members: remaining, label: c.label }) };
    });
  }

  function addClusterMember(c: EditableCluster, row: CatalogBoardRow) {
    const key = rowKey(row);
    if (c.members.some((m) => rowKey(m) === key)) return;
    const member: ClusterMember = { provider: row.provider, rawKey: row.rawKey, count: row.count };
    setClusters((prev) =>
      prev
        .map((x) => {
          if (x.id === c.id) return { ...x, members: [...x.members, member] };
          return { ...x, members: x.members.filter((m) => rowKey(m) !== key) };
        })
        .filter((x) => x.members.length > 0)
    );
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

  function toggleSelectGroup(term: CatalogTermCard) {
    const keys = term.members.map((m) => rowKey(m));
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.length > 0 && keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  async function loadPreview(key: string, params: { rawKey?: string; termId?: string; provider?: string }) {
    if (products[key]) return;
    try {
      const res = await catalogEnrichmentApi.preview({
        kind,
        rawKey: params.rawKey,
        termId: params.termId,
        provider: params.provider,
        limit: 20,
      });
      setProducts((p) => ({ ...p, [key]: res.data }));
    } catch {
      setProducts((p) => ({ ...p, [key]: [] }));
      showToast("No se pudieron cargar productos", false);
    }
  }

  async function toggleExpandRow(r: CatalogBoardRow) {
    const k = rowKey(r);
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    setExpanded(k);
    await loadPreview(k, { rawKey: r.rawKey, provider: r.provider });
  }

  async function toggleExpandGroup(term: CatalogTermCard) {
    const k = `term:${term.id}`;
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    setExpanded(k);
    await loadPreview(k, { termId: term.id });
  }

  async function mergeSelected() {
    if (selectedRows.length < 1) return;
    const label = mergeExistingId
      ? existingGroups.find((t) => t.id === mergeExistingId)?.label
      : mergePick === NEW_NAME
        ? mergeLabel.trim()
        : mergePick.trim();
    if (!label) return showToast("Elegí el nombre que queda", false);
    setBusy("merge-sel");
    try {
      const res = await catalogEnrichmentApi.link({
        kind,
        items: selectedRows.map((r) => ({ provider: r.provider, rawKey: r.rawKey })),
        ...(mergeExistingId ? { termId: mergeExistingId } : { label }),
      });
      showToast(
        selectedRows.length > 1
          ? `${selectedRows.length} ${nounPlural} → «${label}»`
          : `Quedó como «${label}»`
      );
      setSelected(new Set());
      setMergeLabel("");
      setMergePick("");
      setMergeExistingId("");
      await onReload();
      goToUnified(res.data.term.id);
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

  const countsByTerm = useMemo(() => productCountByTerm(board), [board]);
  const menuParentChoices = useMemo(
    () =>
      aggregateLabelChoices(board?.rows ?? [], terms.filter((t) => t.kind === "CATEGORY").map((t) => t.label)),
    [board, terms]
  );

  async function confirmSendToMenu(role: "parent" | "child", parentLabel: string | null) {
    if (!menuTarget) return;
    setBusy("send-menu");
    try {
      let termId = menuTarget.termId ?? null;
      if (!termId) {
        const res = await catalogEnrichmentApi.link({
          kind: "CATEGORY",
          items: menuTarget.items,
          label: menuTarget.label,
        });
        termId = res.data.term.id;
      }
      if (role === "parent") {
        await catalogEnrichmentApi.updateTerm(termId, { inMenu: true, parentId: null });
      } else {
        const parentName = (parentLabel ?? "").trim();
        if (!parentName) throw new Error("Falta padre");
        const parent = await catalogEnrichmentApi.createTerm({
          kind: "CATEGORY",
          label: parentName,
          inMenu: true,
          parentId: null,
        });
        if (parent.data.id === termId) {
          showToast("No puede ser hija de sí misma", false);
          return;
        }
        await catalogEnrichmentApi.updateTerm(termId, { inMenu: true, parentId: parent.data.id });
      }
      showToast(
        role === "parent"
          ? `«${menuTarget.label}» quedó como padre (${menuTarget.count} prod.)`
          : `«${menuTarget.label}» quedó como hija de «${parentLabel}»`
      );
      setMenuTarget(null);
      await onReload();
    } catch {
      showToast("No se pudo mandar al menú", false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-surface-300 bg-surface-900/50 border border-surface-800 rounded-lg px-3 py-2.5 leading-relaxed">
        <strong className="text-white">Cómo funciona:</strong> en <em>Sin unificar</em> ves el nombre que
        puso cada proveedor. Marcás las que son lo mismo, elegís <em>cuál de esos nombres queda</em> y
        unificás. En <em>Ya unificadas</em> ves <strong>un grupo por nombre</strong> — no las filas sueltas
        — con todos los productos adentro.
        {kind === "CATEGORY" && (
          <>
            {" "}
            <strong className="text-white">Al menú</strong> manda esa categoría (unificada o no) como padre o
            como hija.
          </>
        )}
      </p>

      {kind === "CATEGORY" && (
        <CatalogMenuPreview
          terms={terms}
          counts={countsByTerm}
          busy={busy}
          onChanged={onReload}
          showToast={showToast}
        />
      )}

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/60 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Sugerencias
            </h3>
            <p className="text-[11px] text-surface-500 mt-0.5">
              {aiMeta
                ? `${aiMeta.total} grupo(s) · ${aiMeta.usedAi ? "con IA" : "detección automática"} · ${unlinkedCount} sin unificar`
                : "Buscando parecidos…"}
              {" · "}
              Tocá un nombre para sacarlo si no va. Con la lupa buscás otra {noun} para sumar.
            </p>
          </div>
          <div className="flex gap-2">
            {liveClusters.some((c) => c.confidence === "alta") && (
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
                const extra = clusters.map((c) => c.id);
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

        {busy === `ai-${kind}` && liveClusters.length === 0 && clusters.length === 0 ? (
          <p className="px-4 py-8 text-sm text-surface-500 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Analizando {nounPlural}…
          </p>
        ) : liveClusters.length === 0 ? (
          <div className="px-4 py-8 text-center space-y-2">
            <p className="text-sm text-surface-400">No hay sugerencias pendientes.</p>
            <p className="text-xs text-surface-500">
              En Sin unificar, marcá las que son lo mismo y usá Unificar.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-800/80 max-h-[480px] overflow-y-auto">
            {liveClusters.map((c) => {
              const total = c.members.reduce((s, m) => s + m.count, 0);
              const options = clusterNameOptions(c);
              const pick = clusterPicks[c.id] ?? defaultClusterName(c);
              const inGroup = new Set(c.members.map((m) => rowKey(m)));
              const searchPool = addCandidates.filter((r) => !inGroup.has(rowKey(r)));
              return (
                <li key={c.id} className="px-4 py-3 flex flex-wrap gap-3 items-start justify-between hover:bg-surface-900/40">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm text-white">
                      Parecen la misma {noun}
                      <span className="text-surface-500 text-xs ml-2 tabular-nums">
                        {c.members.length} nombre{c.members.length === 1 ? "" : "s"} · {total} prod.
                        {c.confidence ? ` · ${c.confidence}` : ""}
                      </span>
                    </p>
                    {c.reason && <p className="text-[11px] text-surface-500">{c.reason}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {c.members.map((m) => (
                        <button
                          key={rowKey(m)}
                          type="button"
                          onClick={() => dropClusterMember(c, rowKey(m))}
                          title="Sacar: no va con este grupo"
                          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-300 hover:bg-red-500/20 hover:text-red-200"
                        >
                          {m.rawKey}
                          <span className="text-surface-500"> · {providerName(m.provider)}</span>
                          <X className="w-3 h-3 text-surface-500" />
                        </button>
                      ))}
                    </div>
                    <ClusterAddSearch
                      noun={noun}
                      nounPlural={nounPlural}
                      candidates={searchPool}
                      onAdd={(row) => addClusterMember(c, row)}
                    />
                    <label className="flex flex-wrap items-center gap-2 text-xs text-surface-400">
                      Nombre que queda
                      <select
                        value={options.includes(pick) ? pick : options[0] ?? ""}
                        onChange={(e) => setClusterPicks((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1 text-xs text-white"
                      >
                        {options.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
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
                      disabled={busy === c.id || c.members.length < 2}
                      onClick={() => void applyCluster(c)}
                      title={c.members.length < 2 ? `Sumá al menos otra ${noun} con la lupa` : undefined}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Unificar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-surface-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/60 flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-surface-700 overflow-hidden text-[11px]">
            {(
              [
                ["unlinked", `Sin unificar (${unlinkedCount})`],
                ["linked", `Ya unificadas (${groupCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setListFilter(key);
                  setVisibleCount(PAGE);
                  setExpanded(null);
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
              placeholder={listFilter === "linked" ? "Buscar grupo…" : `Buscar ${nounPlural}…`}
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

        {listFilter === "linked" ? (
          <UnifiedGroups
            groups={visibleGroups}
            total={unifiedGroups.length}
            visibleCount={visibleCount}
            onMore={() => setVisibleCount((n) => n + PAGE)}
            selected={selected}
            expanded={expanded}
            products={products}
            highlightTermId={highlightTermId}
            onToggleGroup={toggleSelectGroup}
            onToggleSelectAll={(on) => {
              setSelected((prev) => {
                const next = new Set(prev);
                for (const g of visibleGroups) {
                  for (const m of g.members) {
                    if (on) next.add(rowKey(m));
                    else next.delete(rowKey(m));
                  }
                }
                return next;
              });
            }}
            onExpand={(t) => void toggleExpandGroup(t)}
            onSendToMenu={
              kind === "CATEGORY"
                ? (t) =>
                    setMenuTarget({
                      label: t.label,
                      count: t.productCount,
                      termId: t.id,
                      items: t.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
                    })
                : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wide text-surface-500 border-b border-surface-800">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(rowKey(r)))}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            for (const r of visibleRows) {
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
                    <th className="px-2 py-2 font-medium">Nombre del proveedor</th>
                <th className="px-2 py-2 font-medium text-right">Productos</th>
                <th className="w-28 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800/70">
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-surface-500 text-sm">
                        {unlinkedCount === 0
                          ? "No queda nada sin unificar."
                          : "Nada que mostrar con estos filtros."}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((r) => {
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
                              onClick={() => void toggleExpandRow(r)}
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
                                  <ProductPreviewList items={products[k]} />
                                )}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-2 align-top text-right tabular-nums text-surface-300">
                            {r.count}
                          </td>
                          <td className="px-2 py-2 align-top text-right">
                            <div className="flex justify-end gap-1">
                              {kind === "CATEGORY" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMenuTarget({
                                      label: r.rawKey,
                                      count: r.count,
                                      termId: r.termId,
                                      items: [{ provider: r.provider, rawKey: r.rawKey }],
                                    })
                                  }
                                  className="text-[10px] font-medium px-2 py-1 rounded-lg border border-surface-700 text-surface-300 hover:text-white"
                                >
                                  Al menú
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void toggleVisible(r)}
                                disabled={busy === `vis-${k}`}
                                className="p-1.5 rounded-lg border border-surface-700 text-surface-400 hover:text-white"
                                title={r.visible ? "Ocultar del catálogo" : "Mostrar"}
                              >
                                {r.visible ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredRows.length > visibleCount && (
              <div className="px-4 py-3 border-t border-surface-800 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE)}
                  className="text-xs font-medium text-brand-300 hover:text-brand-200"
                >
                  Mostrar más ({filteredRows.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-[1400px]">
          <div className="rounded-xl border border-brand-500/40 bg-surface-950/95 backdrop-blur shadow-2xl px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <Link2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
              <span className="text-sm text-white font-medium">
                {selected.size} seleccionada{selected.size > 1 ? "s" : ""}
              </span>
              <span className="text-xs text-surface-400">
                Elegí el nombre que queda (uno de los que marcaste)
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="p-1.5 rounded-lg text-surface-400 hover:text-white ml-auto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {nameChoices.map((name) => (
                <label
                  key={name}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                    mergePick === name && !mergeExistingId
                      ? "border-brand-500 bg-brand-500/15 text-white"
                      : "border-surface-700 text-surface-300 hover:border-surface-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="merge-name"
                    className="sr-only"
                    checked={mergePick === name && !mergeExistingId}
                    onChange={() => {
                      setMergePick(name);
                      setMergeExistingId("");
                    }}
                  />
                  {name}
                </label>
              ))}
              <label
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${
                  mergePick === NEW_NAME && !mergeExistingId
                    ? "border-brand-500 bg-brand-500/15 text-white"
                    : "border-surface-700 text-surface-300 hover:border-surface-500"
                }`}
              >
                <input
                  type="radio"
                  name="merge-name"
                  className="sr-only"
                  checked={mergePick === NEW_NAME && !mergeExistingId}
                  onChange={() => {
                    setMergePick(NEW_NAME);
                    setMergeExistingId("");
                  }}
                />
                Otro…
              </label>
              {mergePick === NEW_NAME && !mergeExistingId && (
                <input
                  value={mergeLabel}
                  onChange={(e) => setMergeLabel(e.target.value)}
                  placeholder="Escribí el nombre"
                  className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[140px]"
                />
              )}
              {existingGroups.length > 0 && (
                <select
                  value={mergeExistingId}
                  onChange={(e) => setMergeExistingId(e.target.value)}
                  className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[180px]"
                >
                  <option value="">O meterlas en un grupo ya unificado…</option>
                  {existingGroups.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.productCount} prod.)
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={busy === "merge-sel"}
                onClick={() => void mergeSelected()}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
              >
                {busy === "merge-sel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Unificar
              </button>
            </div>
          </div>
        </div>
      )}
      {menuTarget && (
        <SendToMenuDialog
          target={menuTarget}
          parentChoices={menuParentChoices}
          parentCounts={Object.fromEntries(menuParentChoices.map((c) => [c.label, c.count]))}
          busy={busy === "send-menu"}
          onClose={() => setMenuTarget(null)}
          onConfirm={confirmSendToMenu}
        />
      )}
    </div>
  );
}

function ClusterAddSearch({
  noun,
  nounPlural,
  candidates,
  onAdd,
}: {
  noun: string;
  nounPlural: string;
  candidates: CatalogBoardRow[];
  onAdd: (row: CatalogBoardRow) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const query = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!query) return [];
    return candidates
      .filter(
        (r) =>
          r.rawKey.toLowerCase().includes(query) ||
          providerName(r.provider).toLowerCase().includes(query)
      )
      .sort((a, b) => {
        const aStart = a.rawKey.toLowerCase().startsWith(query) ? 0 : 1;
        const bStart = b.rawKey.toLowerCase().startsWith(query) ? 0 : 1;
        return aStart - bStart || b.count - a.count || a.rawKey.localeCompare(b.rawKey, "es");
      })
      .slice(0, 15);
  }, [candidates, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative max-w-sm">
      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={`Buscar otra ${noun} para sumar…`}
        className="w-full rounded-lg border border-surface-700 bg-surface-900 pl-8 pr-3 py-1.5 text-xs text-white"
      />
      {open && query.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-surface-700 bg-surface-950 shadow-xl">
          {hits.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] text-surface-500">
              No hay {nounPlural} sin unificar que coincidan.
            </p>
          ) : (
            hits.map((r) => (
              <button
                key={rowKey(r)}
                type="button"
                onClick={() => {
                  onAdd(r);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-2 text-left px-2.5 py-1.5 text-xs hover:bg-surface-800"
              >
                <span className="text-surface-100 truncate">
                  {r.rawKey}
                  <span className="text-surface-500"> · {providerName(r.provider)}</span>
                </span>
                <span className="text-surface-500 tabular-nums flex-shrink-0">{r.count} prod.</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProductPreviewList({ items }: { items?: CatalogPreviewProduct[] }) {
  if (!items) {
    return (
      <p className="mt-2 text-[11px] text-surface-500 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Cargando productos…
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="mt-2 text-[11px] text-surface-500">Sin productos para mostrar.</p>;
  }
  return (
    <ul className="mt-2 space-y-1 max-w-lg">
      {items.map((p) => (
        <li key={`${p.provider}:${p.externalId}`} className="text-[11px] text-surface-400 truncate">
          {p.name}
        </li>
      ))}
    </ul>
  );
}

function UnifiedGroups({
  groups,
  total,
  visibleCount,
  onMore,
  selected,
  expanded,
  products,
  highlightTermId,
  onToggleGroup,
  onToggleSelectAll,
  onExpand,
  onSendToMenu,
}: {
  groups: CatalogTermCard[];
  total: number;
  visibleCount: number;
  onMore: () => void;
  selected: Set<string>;
  expanded: string | null;
  products: Record<string, CatalogPreviewProduct[]>;
  highlightTermId: string | null;
  onToggleGroup: (t: CatalogTermCard) => void;
  onToggleSelectAll: (on: boolean) => void;
  onExpand: (t: CatalogTermCard) => void;
  onSendToMenu?: (t: CatalogTermCard) => void;
}) {
  const allSelected =
    groups.length > 0 &&
    groups.every((g) => g.members.length > 0 && g.members.every((m) => selected.has(rowKey(m))));

  if (groups.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-surface-500">
        Todavía no unificaste nada. En <strong className="text-surface-300">Sin unificar</strong>, marcá las
        que son lo mismo y tocá Unificar. Acá vas a ver <em>un grupo</em> con ese nombre y todos los
        productos adentro.
      </p>
    );
  }

  return (
    <>
      <div className="px-4 py-2 border-b border-surface-800/80 flex items-center gap-2 text-[11px] text-surface-500">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => onToggleSelectAll(e.target.checked)}
          className="rounded border-surface-600"
          title="Seleccionar grupos visibles"
        />
        <span>Un renglón = el nombre que eligió · adentro, los nombres de cada proveedor y los productos</span>
      </div>
      <ul className="divide-y divide-surface-800/80">
        {groups.map((term) => {
          const keys = term.members.map((m) => rowKey(m));
          const isSelected = keys.length > 0 && keys.every((k) => selected.has(k));
          const isOpen = expanded === `term:${term.id}`;
          const highlighted = highlightTermId === term.id;
          return (
            <li
              key={term.id}
              id={`unify-group-${term.id}`}
              className={`px-4 py-3 ${
                highlighted
                  ? "bg-brand-500/10 ring-1 ring-inset ring-brand-500/40"
                  : isSelected
                    ? "bg-brand-500/5"
                    : "hover:bg-surface-900/40"
              }`}
            >
              <div className="flex gap-3 items-start">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleGroup(term)}
                  className="rounded border-surface-600 mt-1.5"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onExpand(term)}
                    className="flex items-start gap-1.5 text-left w-full group"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-surface-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-surface-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-base font-semibold text-white group-hover:text-brand-300">
                          {term.label}
                        </span>
                        <span className="text-xs text-surface-400 tabular-nums">
                          {term.productCount} producto{term.productCount === 1 ? "" : "s"}
                          {" · "}
                          {term.members.length} nombre{term.members.length === 1 ? "" : "s"} distinto
                          {term.members.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {term.members.map((m) => (
                          <span
                            key={rowKey(m)}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-surface-800 text-surface-300"
                          >
                            {m.rawKey}
                            <span className="text-surface-500">
                              {" "}
                              · {providerName(m.provider)} · {m.count}
                            </span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-3 ml-6 rounded-lg border border-surface-800 bg-surface-950/50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-surface-500 mb-1">
                        Productos de este grupo
                      </p>
                      <ProductPreviewList items={products[`term:${term.id}`]} />
                    </div>
                  )}
                </div>
                {onSendToMenu && (
                  <button
                    type="button"
                    onClick={() => onSendToMenu(term)}
                    className="text-[10px] font-medium px-2 py-1 rounded-lg border border-surface-700 text-surface-300 hover:text-white flex-shrink-0"
                  >
                    Al menú
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {total > visibleCount && (
        <div className="px-4 py-3 border-t border-surface-800 text-center">
          <button type="button" onClick={onMore} className="text-xs font-medium text-brand-300 hover:text-brand-200">
            Mostrar más ({total - visibleCount} restantes)
          </button>
        </div>
      )}
    </>
  );
}
