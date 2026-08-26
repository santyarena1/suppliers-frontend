"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  catalogEnrichmentApi,
  PROVIDER_LABELS,
  type CatalogAliasKind,
  type CategoryMergeSuggestion,
  type CategoryRawRow,
  type CategoryWorkspace,
  type Provider,
} from "@/lib/api";
import {
  Check,
  ChevronRight,
  Hash,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

type MainTab = "unify" | "codes" | "config";

const NEW_OPTION = "__new__";

export default function CatalogEnrichmentPanel({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [tab, setTab] = useState<MainTab>("unify");
  const [ws, setWs] = useState<CategoryWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openAiKey, setOpenAiKey] = useState("");
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const [draftPick, setDraftPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workspace, overview] = await Promise.all([
        catalogEnrichmentApi.categoryWorkspace(),
        catalogEnrichmentApi.overview(),
      ]);
      setWs(workspace.data);
      setAiConfigured(overview.data.aiConfigured);
      const picks: Record<string, string> = {};
      const labels: Record<string, string> = {};
      for (const s of workspace.data.suggestions) {
        picks[s.id] = workspace.data.canonicalCategories.some((c) => c.label === s.suggestedLabel)
          ? s.suggestedLabel
          : NEW_OPTION;
        labels[s.id] = s.suggestedLabel;
      }
      for (const row of workspace.data.pendingText) {
        picks[row.id] = NEW_OPTION;
        labels[row.id] = row.rawKey;
      }
      for (const row of workspace.data.providerCodes.filter((r) => !r.mappedLabel)) {
        picks[row.id] = NEW_OPTION;
        labels[row.id] = row.sampleNames[0]?.split(" ").slice(0, 3).join(" ") ?? row.rawKey;
      }
      setDraftPick(picks);
      setDraftLabels(labels);
    } catch {
      showToast("No se pudo cargar el unificador", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const canonicalCategoryLabels = useMemo(
    () => ws?.canonicalCategories.map((c) => c.label) ?? [],
    [ws]
  );
  const canonicalSubLabels = useMemo(
    () => ws?.canonicalSubcategories.map((c) => c.label) ?? [],
    [ws]
  );

  async function confirmMapping(
    key: string,
    items: { provider: string; rawKey: string }[],
    kind: CatalogAliasKind,
    pickKey: string
  ) {
    const pick = draftPick[pickKey] ?? NEW_OPTION;
    const label = pick === NEW_OPTION ? (draftLabels[pickKey] ?? "").trim() : pick;
    if (!label) return showToast("Elegí o escribí un nombre de categoría", false);

    setBusy(key);
    try {
      await catalogEnrichmentApi.confirmCategories({ label, items, kind, source: "MANUAL" });
      showToast(`Confirmado como «${label}»`);
      await load();
    } catch {
      showToast("No se pudo confirmar", false);
    } finally {
      setBusy(null);
    }
  }

  async function confirmSuggestion(s: CategoryMergeSuggestion) {
    await confirmMapping(
      s.id,
      s.members.map((m) => ({ provider: m.provider, rawKey: m.rawKey })),
      "CATEGORY",
      s.id
    );
  }

  async function confirmSingleRow(row: CategoryRawRow) {
    await confirmMapping(
      row.id,
      [{ provider: row.provider, rawKey: row.rawKey }],
      row.kind,
      row.id
    );
  }

  async function runAiSuggestions() {
    setBusy("ai");
    try {
      const res = await catalogEnrichmentApi.aiCategoryClusters();
      let applied = 0;
      for (const cluster of res.data.clusters) {
        const items: { provider: string; rawKey: string }[] = [];
        for (const member of cluster.members) {
          const rows = ws?.allText.filter((r) => r.rawKey === member) ?? [];
          for (const r of rows) {
            items.push({ provider: r.provider, rawKey: r.rawKey });
          }
        }
        if (items.length === 0) continue;
        await catalogEnrichmentApi.confirmCategories({
          label: cluster.label,
          items,
          kind: "CATEGORY",
          source: "AI",
        });
        applied++;
      }
      showToast(
        applied > 0
          ? `IA: ${applied} grupo(s) aplicados`
          : res.data.usedAi
            ? "IA no encontró grupos nuevos"
            : "Heurística: sin grupos nuevos"
      );
      await load();
    } catch {
      showToast("Error en sugerencia IA", false);
    } finally {
      setBusy(null);
    }
  }

  async function saveOpenAiKey(e: FormEvent) {
    e.preventDefault();
    if (!openAiKey.trim()) return;
    setSavingOpenAi(true);
    try {
      await catalogEnrichmentApi.saveOpenAi(openAiKey.trim());
      setOpenAiKey("");
      setAiConfigured(true);
      showToast("API key guardada");
    } catch {
      showToast("No se pudo guardar", false);
    } finally {
      setSavingOpenAi(false);
    }
  }

  if (loading && !ws) {
    return (
      <div className="flex items-center justify-center py-20 text-surface-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando categorías…
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-400" />
            Unificador de categorías
          </h2>
          <p className="text-sm text-surface-500 mt-1 max-w-xl">
            Primero unificá las categorías de todos los distribuidores. Después mapeá códigos
            numéricos (Air) a una categoría canónica existente o creá una nueva.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-surface-700 text-surface-300 hover:bg-surface-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </header>

      {ws && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Pendientes (texto)", value: ws.stats.pendingText, accent: ws.stats.pendingText > 0 },
            { label: "Canónicas", value: ws.stats.canonicalCount, accent: false },
            { label: "Códigos sin mapear", value: ws.stats.pendingCodes, accent: ws.stats.pendingCodes > 0 },
            { label: "Ya mapeadas", value: ws.stats.mappedText + ws.stats.mappedCodes, accent: false },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={`rounded-xl border px-3 py-2.5 ${accent ? "border-amber-500/30 bg-amber-500/5" : "border-surface-800 bg-surface-900/40"}`}
            >
              <p className="text-[10px] text-surface-500 uppercase tracking-wide">{label}</p>
              <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      <nav className="flex gap-1 border-b border-surface-800 pb-px">
        {([
          ["unify", "1. Unificar categorías", Layers],
          ["codes", "2. Códigos de proveedor", Hash],
          ["config", "OpenAI", KeyRound],
        ] as const).map(([key, label, Icon]) => (
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
          </button>
        ))}
      </nav>

      {tab === "unify" && ws && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <p className="text-xs text-surface-500">
              {ws.suggestions.length} sugerencias · {ws.pendingText.length} sin mapear
            </p>
            <button
              type="button"
              disabled={busy === "ai"}
              onClick={() => void runAiSuggestions()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50"
            >
              {busy === "ai" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Sugerir grupos con IA
            </button>
          </div>

          {ws.suggestions.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-white">Sugerencias para confirmar</h3>
              {ws.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  busy={busy === s.id}
                  pick={draftPick[s.id] ?? NEW_OPTION}
                  label={draftLabels[s.id] ?? s.suggestedLabel}
                  canonicals={canonicalCategoryLabels}
                  onPickChange={(v) => setDraftPick((d) => ({ ...d, [s.id]: v }))}
                  onLabelChange={(v) => setDraftLabels((d) => ({ ...d, [s.id]: v }))}
                  onConfirm={() => void confirmSuggestion(s)}
                />
              ))}
            </section>
          )}

          <section className="rounded-xl border border-surface-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/50">
              <h3 className="text-sm font-medium text-white">Categorías crudas (todos los distribuidores)</h3>
              <p className="text-xs text-surface-500 mt-0.5">
                Asigná cada una a una canónica existente o creá una nueva.
              </p>
            </div>
            <div className="divide-y divide-surface-800/80 max-h-[480px] overflow-y-auto">
              {ws.pendingText.length === 0 ? (
                <p className="px-4 py-8 text-sm text-surface-500 text-center">Sin pendientes de texto.</p>
              ) : (
                ws.pendingText.map((row) => (
                  <RawCategoryRow
                    key={row.id}
                    row={row}
                    busy={busy === row.id}
                    pick={draftPick[row.id] ?? NEW_OPTION}
                    label={draftLabels[row.id] ?? row.rawKey}
                    canonicals={canonicalCategoryLabels}
                    onPickChange={(v) => setDraftPick((d) => ({ ...d, [row.id]: v }))}
                    onLabelChange={(v) => setDraftLabels((d) => ({ ...d, [row.id]: v }))}
                    onConfirm={() => void confirmSingleRow(row)}
                  />
                ))
              )}
            </div>
          </section>

          {canonicalCategoryLabels.length > 0 && (
            <details className="rounded-xl border border-surface-800 px-4 py-3">
              <summary className="text-xs font-medium text-surface-400 cursor-pointer">
                {canonicalCategoryLabels.length} categorías canónicas definidas
              </summary>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ws.canonicalCategories.map((c) => (
                  <span
                    key={c.groupId}
                    className="text-[11px] px-2 py-1 rounded-full bg-surface-800 text-surface-300"
                  >
                    {c.label}
                    <span className="text-surface-500 ml-1">({c.productCount})</span>
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {tab === "codes" && ws && (
        <section className="rounded-xl border border-surface-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/50">
            <h3 className="text-sm font-medium text-white">Códigos → categoría canónica</h3>
            <p className="text-xs text-surface-500 mt-0.5">
              Rubros/grupos de Air y otros códigos numéricos.
            </p>
          </div>
          <div className="divide-y divide-surface-800/80 max-h-[560px] overflow-y-auto">
            {ws.providerCodes.filter((r) => !r.mappedLabel).length === 0 ? (
              <p className="px-4 py-8 text-sm text-surface-500 text-center">Todos los códigos mapeados.</p>
            ) : (
              ws.providerCodes
                .filter((r) => !r.mappedLabel)
                .map((row) => (
                  <CodeMapRow
                    key={row.id}
                    row={row}
                    busy={busy === row.id}
                    pick={draftPick[row.id] ?? NEW_OPTION}
                    label={draftLabels[row.id] ?? ""}
                    canonicals={
                      row.kind === "SUBCATEGORY" ? canonicalSubLabels : canonicalCategoryLabels
                    }
                    onPickChange={(v) => setDraftPick((d) => ({ ...d, [row.id]: v }))}
                    onLabelChange={(v) => setDraftLabels((d) => ({ ...d, [row.id]: v }))}
                    onConfirm={() => void confirmSingleRow(row)}
                  />
                ))
            )}
          </div>
        </section>
      )}

      {tab === "config" && (
        <section className="rounded-xl border border-surface-800 p-4 bg-surface-900/30 space-y-3 max-w-lg">
          <h3 className="text-sm font-medium text-white">API key de OpenAI</h3>
          <p className="text-xs text-surface-500">
            Opcional. Mejora sugerencias de agrupamiento.
            {aiConfigured && <span className="text-emerald-400"> Activa.</span>}
          </p>
          <form onSubmit={saveOpenAiKey} className="flex gap-2">
            <input
              type="password"
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
              placeholder="sk-…"
              className="flex-1 rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-2 text-sm text-white font-mono"
            />
            <button
              type="submit"
              disabled={savingOpenAi || !openAiKey.trim()}
              className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-50"
            >
              Guardar
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function ProviderPill({ provider }: { provider: string }) {
  const name = PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
  return (
    <span className="inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-800 text-surface-300">
      {name}
    </span>
  );
}

function CategoryPicker({
  pick,
  label,
  canonicals,
  onPickChange,
  onLabelChange,
}: {
  pick: string;
  label: string;
  canonicals: string[];
  onPickChange: (v: string) => void;
  onLabelChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center min-w-[240px] flex-1">
      <select
        value={pick}
        onChange={(e) => onPickChange(e.target.value)}
        className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white min-w-[160px]"
      >
        <option value={NEW_OPTION}>+ Crear nueva…</option>
        {canonicals.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      {pick === NEW_OPTION && (
        <input
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Nombre canónico"
          className="flex-1 min-w-[140px] rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-xs text-white"
        />
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  busy,
  pick,
  label,
  canonicals,
  onPickChange,
  onLabelChange,
  onConfirm,
}: {
  suggestion: CategoryMergeSuggestion;
  busy: boolean;
  pick: string;
  label: string;
  canonicals: string[];
  onPickChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-medium">
            Sugerencia: «{suggestion.suggestedLabel}»
          </p>
          <p className="text-xs text-surface-500 mt-0.5">{suggestion.reason}</p>
          <div className="mt-2 space-y-1.5">
            {suggestion.members.map((m) => (
              <div key={`${m.provider}:${m.rawKey}`} className="flex flex-wrap items-center gap-2 text-xs">
                <ProviderPill provider={m.provider} />
                <span className="text-surface-200 font-medium">{m.rawKey}</span>
                <span className="text-surface-500">({m.count})</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-surface-800/60">
        <CategoryPicker
          pick={pick}
          label={label}
          canonicals={canonicals}
          onPickChange={onPickChange}
          onLabelChange={onLabelChange}
        />
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Confirmar
        </button>
      </div>
    </div>
  );
}

function RawCategoryRow(props: {
  row: CategoryRawRow;
  busy: boolean;
  pick: string;
  label: string;
  canonicals: string[];
  onPickChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const { row, busy, pick, label, canonicals, onPickChange, onLabelChange, onConfirm } = props;
  return (
    <div className="px-4 py-3 flex flex-wrap gap-3 items-center">
      <div className="min-w-[140px]">
        <div className="flex items-center gap-2">
          <ProviderPill provider={row.provider} />
          <span className="text-sm text-white font-medium">{row.rawKey}</span>
        </div>
        <p className="text-[11px] text-surface-500 mt-0.5">{row.count} productos</p>
      </div>
      <CategoryPicker pick={pick} label={label} canonicals={canonicals} onPickChange={onPickChange} onLabelChange={onLabelChange} />
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Asignar
      </button>
    </div>
  );
}

function CodeMapRow(props: {
  row: CategoryRawRow;
  busy: boolean;
  pick: string;
  label: string;
  canonicals: string[];
  onPickChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onConfirm: () => void;
}) {
  const { row, busy, pick, label, canonicals, onPickChange, onLabelChange, onConfirm } = props;
  const fieldLabel = row.kind === "SUBCATEGORY" ? "Grupo" : "Rubro";
  return (
    <div className="px-4 py-3 flex flex-wrap gap-3 items-center">
      <div className="min-w-[120px]">
        <div className="flex items-center gap-2">
          <ProviderPill provider={row.provider} />
          <span className="text-[10px] text-surface-500">{fieldLabel}</span>
        </div>
        <span className="font-mono text-lg text-amber-300">{row.rawKey}</span>
        <p className="text-[11px] text-surface-500">{row.count} prod. · {row.sampleNames[0] ?? "—"}</p>
      </div>
      <CategoryPicker pick={pick} label={label} canonicals={canonicals} onPickChange={onPickChange} onLabelChange={onLabelChange} />
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Mapear
      </button>
    </div>
  );
}
