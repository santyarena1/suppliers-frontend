"use client";

import { useCallback, useEffect, useState } from "react";
import {
  catalogEnrichmentApi,
  type CatalogAliasKind,
  type CatalogEnrichmentOverview,
  type CatalogRawValueStat,
  type CatalogSuggestions,
} from "@/lib/api";
import { PROVIDER_LABELS, type Provider } from "@/lib/api";
import {
  Brain, Check, ChevronDown, Hash, KeyRound, Layers, Loader2, RefreshCw, Sparkles, Tags, Wand2,
} from "lucide-react";

type SubTab = "codes" | "unify" | "identities" | "ai";

const KIND_LABELS: Record<CatalogAliasKind, string> = {
  BRAND: "Marca",
  CATEGORY: "Categoría (Rubro)",
  SUBCATEGORY: "Subcategoría (Grupo)",
};

export default function CatalogEnrichmentPanel({
  showToast,
}: {
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("codes");
  const [overview, setOverview] = useState<CatalogEnrichmentOverview | null>(null);
  const [provider, setProvider] = useState<Provider>("AIR");
  const [kind, setKind] = useState<CatalogAliasKind>("CATEGORY");
  const [rawValues, setRawValues] = useState<CatalogRawValueStat[]>([]);
  const [suggestions, setSuggestions] = useState<CatalogSuggestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiClusters, setAiClusters] = useState<{ label: string; members: string[] }[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [openAiKey, setOpenAiKey] = useState("");
  const [savingOpenAi, setSavingOpenAi] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, sug] = await Promise.all([
        catalogEnrichmentApi.overview(),
        catalogEnrichmentApi.suggestions(provider),
      ]);
      setOverview(ov.data);
      setSuggestions(sug.data);
    } catch {
      showToast("No se pudo cargar el módulo de catálogo", false);
    } finally {
      setLoading(false);
    }
  }, [provider, showToast]);

  const loadRawValues = useCallback(async () => {
    try {
      const rows = await catalogEnrichmentApi.rawValues({
        kind,
        provider,
        codesOnly: subTab === "codes",
        limit: 100,
      });
      setRawValues(rows.data);
      const drafts: Record<string, string> = {};
      for (const row of rows.data) {
        drafts[`${row.kind}:${row.provider ?? ""}:${row.rawKey}`] = row.sampleNames[0]?.split(" ").slice(0, 4).join(" ") ?? row.rawKey;
      }
      setLabelDrafts((prev) => ({ ...drafts, ...prev }));
    } catch {
      showToast("Error al listar valores crudos", false);
    }
  }, [kind, provider, subTab, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (subTab === "codes") loadRawValues(); }, [subTab, loadRawValues]);

  async function saveCodeLabel(row: CatalogRawValueStat) {
    const key = `${row.kind}:${row.provider ?? ""}:${row.rawKey}`;
    const label = (labelDrafts[key] ?? "").trim();
    if (!label) return showToast("Escribí un nombre visible", false);
    setBusy(key);
    try {
      await catalogEnrichmentApi.upsertAlias({
        kind: row.kind,
        provider: row.provider,
        rawKeys: [row.rawKey],
        label,
        source: "MANUAL",
      });
      showToast(`"${label}" aplicado a ${row.count} productos`);
      await Promise.all([load(), loadRawValues()]);
    } catch {
      showToast("No se pudo guardar", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyAliasSuggestion(s: CatalogSuggestions["aliasSuggestions"][number]) {
    setBusy(s.rawKeys.join("|"));
    try {
      await catalogEnrichmentApi.applySuggestion({
        type: "alias",
        kind: s.kind,
        provider: s.provider,
        rawKeys: s.rawKeys,
        label: s.suggestedLabel,
        source: "AUTO",
      });
      showToast(`Unificado como "${s.suggestedLabel}"`);
      await load();
    } catch {
      showToast("Error al unificar", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyIdentitySuggestion(s: CatalogSuggestions["identitySuggestions"][number]) {
    setBusy(s.matchKey);
    try {
      await catalogEnrichmentApi.applySuggestion({
        type: "identity",
        matchKind: s.matchKind,
        matchKey: s.matchKey,
        displayBrand: s.suggestedBrand,
        displayCategory: s.suggestedCategory,
        source: "AUTO",
      });
      showToast(`Identidad ${s.matchKind} ${s.matchKey} guardada`);
      await load();
    } catch {
      showToast("Error al guardar identidad", false);
    } finally {
      setBusy(null);
    }
  }

  async function runAiClusters() {
    setBusy("ai-clusters");
    try {
      const res = await catalogEnrichmentApi.aiCategoryClusters(provider);
      setAiClusters(res.data.clusters);
      showToast(res.data.usedAi ? "Clusters sugeridos con IA" : "Clusters sugeridos (heurística — cargá API key de OpenAI)");
    } catch {
      showToast("Error en sugerencia IA", false);
    } finally {
      setBusy(null);
    }
  }

  async function applyAiCluster(cluster: { label: string; members: string[] }) {
    setBusy(cluster.label);
    try {
      await catalogEnrichmentApi.upsertAlias({
        kind: "CATEGORY",
        provider: null,
        rawKeys: cluster.members,
        label: cluster.label,
        source: "AI",
      });
      showToast(`Categorías unificadas bajo "${cluster.label}"`);
      await load();
    } catch {
      showToast("Error al aplicar cluster", false);
    } finally {
      setBusy(null);
    }
  }

  async function saveOpenAiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!openAiKey.trim()) return;
    setSavingOpenAi(true);
    try {
      await catalogEnrichmentApi.saveOpenAi(openAiKey.trim());
      setOpenAiKey("");
      showToast("API key de OpenAI guardada");
      await load();
    } catch {
      showToast("No se pudo guardar la clave de OpenAI", false);
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function clearOpenAiKey() {
    setSavingOpenAi(true);
    try {
      await catalogEnrichmentApi.clearOpenAi();
      showToast("Se quitó la API key de OpenAI");
      await load();
    } catch {
      showToast("No se pudo quitar la clave", false);
    } finally {
      setSavingOpenAi(false);
    }
  }

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-20 text-surface-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Tags className="w-5 h-5 text-brand-400" />
            Enriquecimiento de catálogo
          </h2>
          <p className="text-sm text-surface-500 mt-1 max-w-2xl">
            Unificá marcas y categorías a nivel plataforma. Los códigos numéricos de Air (Rubro/Grupo)
            se propagan a todos los productos con el mismo número. También podés unificar por EAN o part number.
          </p>
        </div>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-surface-700 text-surface-300 hover:bg-surface-800"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Alias activos", value: overview.aliasCount, icon: Layers },
            { label: "Identidades", value: overview.identityCount, icon: Hash },
            { label: "Productos en cache", value: overview.productCount, icon: Tags },
            { label: "IA", value: overview.aiConfigured ? "Configurada" : "Sin clave", icon: Brain },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border border-surface-800 bg-surface-900/50 px-4 py-3">
              <div className="flex items-center gap-2 text-surface-500 text-xs mb-1">
                <Icon className="w-3.5 h-3.5" /> {label}
              </div>
              <div className="text-lg font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-surface-800 p-4 bg-surface-900/30 space-y-3">
        <div className="flex items-start gap-3">
          <KeyRound className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-white">API key de OpenAI</h3>
            <p className="text-xs text-surface-500 mt-1">
              Se guarda cifrada en la base (igual que Serper). Nunca se muestra de nuevo.
              {overview?.aiConfigured ? (
                <span className="text-emerald-400"> Clave activa.</span>
              ) : (
                <span> Sin clave, las sugerencias usan heurística local.</span>
              )}
            </p>
          </div>
        </div>
        <form onSubmit={saveOpenAiKey} className="flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[220px] text-xs text-surface-500">
            sk-…
            <input
              type="password"
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
              placeholder="Pegá la API key"
              className="mt-1 block w-full rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-1.5 text-sm text-white font-mono"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={savingOpenAi || !openAiKey.trim()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
          >
            {savingOpenAi ? "Guardando…" : "Guardar"}
          </button>
          {overview?.aiConfigured && (
            <button
              type="button"
              disabled={savingOpenAi}
              onClick={() => void clearOpenAiKey()}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-surface-700 text-surface-400 hover:text-surface-200"
            >
              Quitar
            </button>
          )}
        </form>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-surface-800 pb-2">
        {([
          ["codes", "Códigos por proveedor", Hash],
          ["unify", "Unificación", Layers],
          ["identities", "EAN / Part number", Hash],
          ["ai", "IA", Sparkles],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${
              subTab === key ? "bg-brand-600/20 text-brand-300" : "text-surface-400 hover:text-surface-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {(subTab === "codes" || subTab === "ai") && (
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-surface-500">
            Proveedor
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="mt-1 block w-44 rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-white"
            >
              {(["AIR", "ELIT", "INVID", "NEW_BYTES", "GRUPO_NUCLEO", "CEVEN", "DIAPSTORE"] as Provider[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </label>
          {subTab === "codes" && (
            <label className="text-xs text-surface-500">
              Campo
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CatalogAliasKind)}
                className="mt-1 block w-52 rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-white"
              >
                {(Object.keys(KIND_LABELS) as CatalogAliasKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {subTab === "codes" && (
        <section className="rounded-xl border border-surface-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/40 text-xs text-surface-400">
            Asigná un nombre visible a cada código. Se aplica a <strong className="text-surface-200">todos</strong> los productos con ese número en {PROVIDER_LABELS[provider]}.
          </div>
          <div className="divide-y divide-surface-800/80 max-h-[520px] overflow-y-auto">
            {rawValues.length === 0 ? (
              <p className="px-4 py-8 text-sm text-surface-500 text-center">Sin códigos para este filtro.</p>
            ) : rawValues.map((row) => {
              const key = `${row.kind}:${row.provider ?? ""}:${row.rawKey}`;
              return (
                <div key={key} className="px-4 py-3 flex flex-wrap gap-3 items-center">
                  <div className="min-w-[80px]">
                    <span className="font-mono text-sm text-amber-300">{row.rawKey}</span>
                    <p className="text-[11px] text-surface-500">{row.count} productos</p>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-xs text-surface-500 truncate" title={row.sampleNames.join(" · ")}>
                      ej: {row.sampleNames[0] ?? "—"}
                    </p>
                    <input
                      value={labelDrafts[key] ?? ""}
                      onChange={(e) => setLabelDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      placeholder="Nombre visible"
                      className="mt-1 w-full rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-1.5 text-sm text-white"
                    />
                  </div>
                  <button
                    disabled={busy === key}
                    onClick={() => saveCodeLabel(row)}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
                  >
                    {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aplicar
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {subTab === "unify" && suggestions && (
        <div className="space-y-4">
          <SuggestionBlock
            title="Categorías / marcas escritas distinto"
            empty="No hay sugerencias de unificación por ahora."
            items={suggestions.aliasSuggestions.map((s) => ({
              id: s.rawKeys.join("|"),
              primary: s.suggestedLabel,
              detail: `${s.labels.join(" · ")} — ${s.reason}`,
              onApply: () => applyAliasSuggestion(s),
              busy: busy === s.rawKeys.join("|"),
            }))}
          />
          <SuggestionBlock
            title="Códigos sin etiqueta (muestra)"
            empty="Todos los códigos visibles ya tienen sugerencia o etiqueta."
            items={suggestions.codeSuggestions.slice(0, 20).map((s) => ({
              id: `${s.kind}-${s.rawKeys[0]}`,
              primary: `Código ${s.rawKeys[0]}`,
              detail: s.reason,
              onApply: async () => {
                setBusy(s.rawKeys[0]);
                try {
                  await catalogEnrichmentApi.applySuggestion({
                    type: "code",
                    kind: s.kind,
                    provider: s.provider,
                    rawKeys: s.rawKeys,
                    label: s.suggestedLabel,
                  });
                  showToast("Código etiquetado");
                  await load();
                } finally {
                  setBusy(null);
                }
              },
              busy: busy === s.rawKeys[0],
            }))}
          />
        </div>
      )}

      {subTab === "identities" && suggestions && (
        <SuggestionBlock
          title="Mismo EAN o part number en varios proveedores"
          empty="No se detectaron identificadores compartidos sin configurar."
          items={suggestions.identitySuggestions.map((s) => ({
            id: s.matchKey,
            primary: `${s.matchKind}: ${s.matchKey}`,
            detail: `${s.productCount} productos · marcas: ${s.brands.join(", ") || "—"} · cats: ${s.categories.join(", ") || "—"}`,
            onApply: () => applyIdentitySuggestion(s),
            busy: busy === s.matchKey,
          }))}
        />
      )}

      {subTab === "ai" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-800 p-4 bg-surface-900/30">
            <p className="text-sm text-surface-300 mb-3 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-brand-400" />
              Agrupá categorías semánticamente iguales y elegí el nombre visible del grupo.
              {overview?.aiConfigured ? " Usando OpenAI." : " Cargá la API key arriba para usar OpenAI."}
            </p>
            <button
              onClick={runAiClusters}
              disabled={busy === "ai-clusters"}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
            >
              {busy === "ai-clusters" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Sugerir clusters de categorías
            </button>
          </div>
          {aiClusters.length > 0 && (
            <div className="space-y-3">
              {aiClusters.map((cluster) => (
                <div key={cluster.label} className="rounded-xl border border-surface-800 px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{cluster.label}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{cluster.members.join(" · ")}</p>
                  </div>
                  <button
                    disabled={busy === cluster.label}
                    onClick={() => applyAiCluster(cluster)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg border border-surface-600 text-surface-200 hover:bg-surface-800 disabled:opacity-50"
                  >
                    Unificar como «{cluster.label}»
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionBlock({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; primary: string; detail: string; onApply: () => void; busy: boolean }[];
}) {
  return (
    <section className="rounded-xl border border-surface-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-800 bg-surface-900/40 text-sm font-medium text-white flex items-center gap-2">
        <ChevronDown className="w-4 h-4 text-surface-500" /> {title}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-surface-500">{empty}</p>
      ) : (
        <div className="divide-y divide-surface-800/80">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{item.primary}</p>
                <p className="text-xs text-surface-500 mt-0.5">{item.detail}</p>
              </div>
              <button
                disabled={item.busy}
                onClick={item.onApply}
                className="text-xs font-semibold px-3 py-2 rounded-lg bg-surface-800 hover:bg-surface-700 text-surface-100 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {item.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Aplicar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
