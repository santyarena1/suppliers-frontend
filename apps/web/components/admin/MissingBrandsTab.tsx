"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, Loader2, RefreshCw, Sparkles, Tag } from "lucide-react";
import { catalogEnrichmentApi, type BrandSuggestion, type BrandSuggestionsResponse } from "@/lib/api";
import type { LabelChoice } from "@/lib/catalog-menu";
import SearchablePick from "./SearchablePick";
import { providerLabel } from "@/components/ProviderBadge";

const SAFE_SCORE = 0.7;

/**
 * Marcas faltantes: productos sin marca agrupados por proveedor, con las
 * palabras repetidas en sus nombres que parecen marca. Se aprueba una por una,
 * corrigiendo el nombre si hace falta, o todas las seguras de un golpe.
 */
export default function MissingBrandsTab({
  brandChoices,
  showToast,
  onChanged,
}: {
  brandChoices: LabelChoice[];
  showToast: (msg: string, ok?: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [data, setData] = useState<BrandSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [extraChoices, setExtraChoices] = useState<LabelChoice[]>([]);

  const load = useCallback(async (ai = false) => {
    if (ai) setAiLoading(true);
    else setLoading(true);
    try {
      const res = await catalogEnrichmentApi.brandSuggestions({ ai });
      setData(res.data);
    } catch {
      showToast("No se pudieron cargar las sugerencias", false);
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load(false);
  }, [load]);

  function keyOf(provider: string, s: BrandSuggestion) {
    return `${provider}:${s.normalized}`;
  }

  async function apply(provider: string, s: BrandSuggestion) {
    const key = keyOf(provider, s);
    const brand = (names[key] ?? s.brand).trim();
    if (!brand) return;
    setBusy(key);
    try {
      const res = await catalogEnrichmentApi.applyBrandSuggestion({
        provider,
        brand,
        externalIds: s.externalIds,
        source: s.aiConfirmed ? "AI" : "MANUAL",
      });
      showToast(`${res.data.updated} productos ahora son ${res.data.brand}`, true);
      await load(false);
      await onChanged();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || "No se pudo asignar la marca", false);
    } finally {
      setBusy(null);
    }
  }

  async function applySafe(provider: string, suggestions: BrandSuggestion[]) {
    const safe = suggestions.filter((s) => s.aiConfirmed === true || (s.aiConfirmed === null && (s.known || s.score >= SAFE_SCORE)));
    if (safe.length === 0) return;
    setBusy(`all:${provider}`);
    let total = 0;
    try {
      for (const s of safe) {
        const res = await catalogEnrichmentApi.applyBrandSuggestion({
          provider,
          brand: (names[keyOf(provider, s)] ?? s.brand).trim(),
          externalIds: s.externalIds,
          source: s.aiConfirmed ? "AI" : "AUTO",
        });
        total += res.data.updated;
      }
      showToast(`${total} productos con marca asignada`, true);
      await load(false);
      await onChanged();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(msg || "Se interrumpió la asignación", false);
    } finally {
      setBusy(null);
    }
  }

  const choices = [...brandChoices, ...extraChoices];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-surface-500 flex-1 min-w-[240px]">
          Si una palabra se repite en los nombres de un proveedor y parece un nombre propio, es la marca. Las marcas que no existían
          (por ejemplo una nueva que trae un distribuidor) se crean al aprobarlas. Corregí el nombre antes de asignar si hace falta.
        </p>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={aiLoading || loading}
          className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-brand-400" />} Validar con IA
        </button>
        <button type="button" onClick={() => void load(false)} disabled={loading} className="text-surface-400 hover:text-white" title="Actualizar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : !data || data.providers.length === 0 ? (
        <p className="text-sm text-surface-400 py-8 text-center">No hay productos sin marca.</p>
      ) : (
        data.providers.map((p) => (
          <section key={p.provider} className="border border-surface-800 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-900">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold text-white">{providerLabel(p.provider)}</p>
                <p className="text-[11px] text-surface-500">
                  {p.missingCount.toLocaleString("es-AR")} productos sin marca · {p.suggestions.length} candidatas
                  {p.usedAi ? " · validadas con IA" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void applySafe(p.provider, p.suggestions)}
                disabled={busy !== null || !p.suggestions.some((s) => s.aiConfirmed === true || (s.aiConfirmed === null && (s.known || s.score >= SAFE_SCORE)))}
                className="flex items-center gap-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5"
              >
                {busy === `all:${p.provider}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Asignar las seguras
              </button>
            </div>
            {p.suggestions.length === 0 ? (
              <p className="text-xs text-surface-500 px-4 py-4">Ninguna palabra se repite lo suficiente. Asignalos a mano desde Incompletos.</p>
            ) : (
              <div className="divide-y divide-surface-800">
                {p.suggestions.map((s) => {
                  const key = keyOf(p.provider, s);
                  const safe = s.aiConfirmed === true || (s.aiConfirmed === null && (s.known || s.score >= SAFE_SCORE));
                  return (
                    <div key={key} className="px-4 py-3 flex flex-wrap items-start gap-3">
                      <div className="w-56 min-w-[200px]">
                        <SearchablePick
                          value={names[key] ?? s.brand}
                          options={choices}
                          placeholder="Marca"
                          onChange={(v) => setNames({ ...names, [key]: v })}
                          onCreate={(label) => {
                            setExtraChoices((prev) => [...prev, { label, count: 0, hint: "nueva" }]);
                            setNames({ ...names, [key]: label });
                          }}
                        />
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {s.known && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">ya existe</span>}
                          {!s.known && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300">marca nueva</span>}
                          {s.aiConfirmed === true && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-300">IA: es marca</span>}
                          {s.aiConfirmed === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">IA: no parece marca</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${safe ? "bg-surface-800 text-surface-300" : "bg-amber-500/10 text-amber-300"}`}>
                            confianza {Math.round(s.score * 100)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-[240px]">
                        <p className="text-xs text-surface-300">
                          <Tag className="inline w-3 h-3 mr-1 text-surface-500" />
                          {s.count} producto{s.count === 1 ? "" : "s"} la tienen en el nombre
                        </p>
                        <ul className="mt-1 text-[11px] text-surface-500 leading-snug">
                          {s.sampleNames.map((n, i) => (
                            <li key={i} className="truncate">{n}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => void apply(p.provider, s)}
                        disabled={busy !== null}
                        className="flex items-center gap-1.5 text-xs font-medium border border-surface-700 hover:border-brand-500 text-surface-100 rounded-lg px-3 py-1.5 disabled:opacity-50"
                      >
                        {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Asignar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
