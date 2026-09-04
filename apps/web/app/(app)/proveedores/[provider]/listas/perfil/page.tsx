"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Save, Sparkles, XCircle } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import ProviderBadge from "@/components/ProviderBadge";
import {
  listImportsApi,
  type ImportDividerMeaning,
  type ImportNumberFormat,
  type ImportProfileBundle,
  type ImportProfileView,
  type ListImportPreview,
  type Provider,
} from "@/lib/api";

const FIELD_LABELS: Record<string, string> = {
  externalId: "Código del proveedor",
  sku: "SKU",
  partNumber: "Part number / modelo",
  ean: "EAN / código de barras",
  name: "Nombre del producto",
  brand: "Marca",
  category: "Categoría / rubro",
  subcategory: "Subcategoría / grupo",
  description: "Descripción",
  longDescription: "Descripción larga",
  price: "Precio (neto)",
  finalPrice: "Precio final (con IVA)",
  currency: "Moneda",
  ivaPercent: "IVA (%)",
  stock: "Stock",
  stockStatus: "Estado de stock",
  imageUrl: "URL de imagen",
  productUrl: "URL del producto",
  locationAir: "Sucursal / depósito",
  warranty: "Garantía",
  weight: "Peso",
  weightUnit: "Unidad de peso",
  height: "Alto",
  width: "Ancho",
  length: "Largo",
  dimensionsUnit: "Unidad de medida",
  volume: "Volumen",
  tags: "Etiquetas",
};

type Draft = {
  sheetIndex: number;
  columnMap: Record<string, string | null>;
  currency: string;
  priceIncludesIva: boolean;
  ivaPercent: string;
  numberFormat: ImportNumberFormat;
  dividerMeaning: ImportDividerMeaning;
};

function draftFromProfile(p: ImportProfileView | null, preview: ListImportPreview | null): Draft {
  const headers = preview?.headers ?? p?.sampleRows?.headers ?? [];
  const columnMap: Record<string, string | null> = {};
  for (const h of headers) columnMap[h] = p?.columnMap?.[h] ?? null;
  return {
    sheetIndex: p?.sheetIndex ?? preview?.sheetIndex ?? 0,
    columnMap,
    currency: p?.currency ?? "",
    priceIncludesIva: p?.priceIncludesIva ?? false,
    ivaPercent: p?.ivaPercent == null ? "" : String(p.ivaPercent),
    numberFormat: p?.numberFormat ?? "COMMA",
    dividerMeaning: p?.dividerMeaning ?? "IGNORE",
  };
}

/** Editor del perfil de lectura: qué columna es cada campo, moneda, IVA, formato y divisores. */
export default function ImportProfilePage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = use(params);
  const provider = raw.toUpperCase() as Provider;
  const router = useRouter();
  const search = useSearchParams();
  const reprocessImportId = search.get("reprocess") ?? undefined;

  const [bundle, setBundle] = useState<ImportProfileBundle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listImportsApi.profile(provider);
      setBundle(res.data);
      const base = res.data.active ?? res.data.proposed;
      setDraft(draftFromProfile(base, res.data.latestImport?.preview ?? null));
      if (res.data.proposed && !res.data.active) {
        setAiNote(res.data.proposed.proposedByAi ? `Propuesta de la IA: ${res.data.proposed.aiReasoning ?? ""}` : "Propuesta automática por nombres de columna.");
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage({ ok: false, text: msg || "No se pudo cargar el perfil" });
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = bundle?.latestImport?.preview ?? null;
  const headers = useMemo(() => preview?.headers ?? bundle?.active?.sampleRows?.headers ?? [], [preview, bundle]);
  const rows = useMemo(() => preview?.rows ?? bundle?.active?.sampleRows?.rows ?? [], [preview, bundle]);

  const usedFields = useMemo(() => {
    const used = new Map<string, string>();
    if (!draft) return used;
    for (const [header, field] of Object.entries(draft.columnMap)) if (field) used.set(field, header);
    return used;
  }, [draft]);

  function setField(header: string, field: string | null) {
    if (!draft) return;
    const next = { ...draft.columnMap };
    // Un campo va a una sola columna: si ya estaba en otra, se libera.
    if (field) {
      for (const [h, f] of Object.entries(next)) if (f === field && h !== header) next[h] = null;
    }
    next[header] = field;
    setDraft({ ...draft, columnMap: next });
  }

  async function suggest() {
    setSuggesting(true);
    setMessage(null);
    try {
      const res = await listImportsApi.suggestProfile(provider, draft?.sheetIndex);
      const spec = res.data.spec;
      setDraft({
        sheetIndex: spec.sheetIndex,
        columnMap: Object.fromEntries(headers.map((h) => [h, spec.columnMap[h] ?? null])),
        currency: spec.currency ?? "",
        priceIncludesIva: spec.priceIncludesIva ?? false,
        ivaPercent: spec.ivaPercent == null ? "" : String(spec.ivaPercent),
        numberFormat: spec.numberFormat ?? "COMMA",
        dividerMeaning: spec.dividerMeaning ?? "IGNORE",
      });
      setAiNote(res.data.fromAi ? `Sugerencia de la IA: ${res.data.reasoning}` : `Sugerencia por nombres de columna. ${res.data.reasoning}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMessage({ ok: false, text: msg || "No se pudo pedir la sugerencia" });
    } finally {
      setSuggesting(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      await listImportsApi.saveProfile(provider, {
        sheetIndex: draft.sheetIndex,
        columnMap: draft.columnMap,
        currency: draft.currency.trim() || null,
        priceIncludesIva: draft.priceIncludesIva,
        ivaPercent: draft.ivaPercent.trim() === "" ? null : Number(draft.ivaPercent),
        numberFormat: draft.numberFormat,
        dividerMeaning: draft.dividerMeaning,
        reprocessImportId,
      });
      setMessage({ ok: true, text: reprocessImportId ? "Perfil guardado. La carga se está reprocesando." : "Perfil guardado." });
      if (reprocessImportId) router.push(`/proveedores/${provider}/listas/${reprocessImportId}`);
      else await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setMessage({ ok: false, text: Array.isArray(msg) ? msg.join(". ") : msg || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  }

  const fields = bundle?.fields ?? Object.keys(FIELD_LABELS);
  const canSave = Boolean(draft && usedFields.has("name") && (usedFields.has("price") || usedFields.has("finalPrice")));

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/proveedores/${provider}?tab=lists`} className="text-surface-500 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <ProviderBadge provider={provider} variant="inline" size="md" />
          <span className="text-xs text-surface-500 hidden sm:inline">Perfil de lectura de la planilla</span>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : !draft || headers.length === 0 ? (
            <div className="border border-surface-800 rounded-xl p-8 text-center text-sm text-surface-400">
              Subí una planilla primero: el perfil se define sobre un archivo real.
              <Link href={`/proveedores/${provider}?tab=lists`} className="block text-brand-700 dark:text-brand-400 text-xs mt-2 underline">Ir a Listas</Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-surface-500">
                  {bundle?.active ? `Perfil activo v${bundle.active.version}` : "Sin perfil aprobado todavía"}
                  {bundle?.latestImport && <> · sobre <span className="text-surface-300">{bundle.latestImport.originalFileName}</span></>}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={suggest}
                    disabled={suggesting}
                    className="flex items-center gap-2 border border-surface-700 hover:border-brand-500 text-surface-200 text-sm font-medium rounded-lg px-3.5 py-2 disabled:opacity-50"
                  >
                    {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-brand-700 dark:text-brand-400" />}
                    Sugerir con IA
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !canSave}
                    title={!canSave ? "Faltan nombre y precio" : undefined}
                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {reprocessImportId ? "Guardar y reprocesar" : "Guardar perfil"}
                  </button>
                </div>
              </div>

              {aiNote && <p className="text-xs text-surface-400 bg-surface-900 border border-surface-800 rounded-lg px-3.5 py-2.5">{aiNote}</p>}
              {message && (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 border ${message.ok ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/8 border-red-500/20 text-red-400"}`}>
                  {message.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {message.text}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
                {/* Tabla con selector por columna */}
                <div className="border border-surface-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="text-xs min-w-full">
                      <thead>
                        <tr className="bg-surface-900">
                          {headers.map((h) => {
                            const field = draft.columnMap[h];
                            return (
                              <th key={h} className="px-2 py-2 text-left align-top min-w-[150px]">
                                <select
                                  value={field ?? ""}
                                  onChange={(e) => setField(h, e.target.value || null)}
                                  className={`w-full rounded-md px-2 py-1.5 text-xs border focus:outline-none focus:border-brand-500 ${
                                    field ? "bg-brand-500/10 border-brand-500/40 text-brand-700 dark:text-brand-200" : "bg-surface-800 border-surface-700 text-surface-400"
                                  }`}
                                >
                                  <option value="">— ignorar —</option>
                                  {fields.map((f) => (
                                    <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>
                                  ))}
                                </select>
                                <span className="block mt-1 font-semibold text-surface-300 truncate" title={h}>{h}</span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800">
                        {rows.map((r, i) => (
                          <tr key={i} className="hover:bg-surface-900/60">
                            {headers.map((_, c) => (
                              <td key={c} className="px-2 py-1.5 text-surface-300 max-w-[220px] truncate" title={r[c] == null ? "" : String(r[c])}>
                                {r[c] == null ? <span className="text-surface-700">·</span> : String(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-surface-500 px-3 py-2 border-t border-surface-800">
                    Primeras {rows.length} filas de datos de la última planilla. Encabezado detectado en la fila {preview?.headerRow != null ? preview.headerRow + 1 : "—"}.
                  </p>
                </div>

                {/* Opciones */}
                <div className="border border-surface-800 rounded-xl p-4 flex flex-col gap-4">
                  {preview && preview.sheets.length > 1 && (
                    <Opt label="Hoja">
                      <select value={draft.sheetIndex} onChange={(e) => setDraft({ ...draft, sheetIndex: Number(e.target.value) })} className={INPUT}>
                        {preview.sheets.map((s) => (
                          <option key={s.index} value={s.index}>{s.name} ({s.dataRows} filas)</option>
                        ))}
                      </select>
                      <span className="text-[11px] text-surface-500">Cambiar de hoja requiere guardar y volver a subir para ver su vista previa.</span>
                    </Opt>
                  )}
                  <Opt label="Formato numérico">
                    <select value={draft.numberFormat} onChange={(e) => setDraft({ ...draft, numberFormat: e.target.value as ImportNumberFormat })} className={INPUT}>
                      <option value="COMMA">1.234,50 (coma decimal)</option>
                      <option value="DOT">1,234.50 (punto decimal)</option>
                    </select>
                  </Opt>
                  <Opt label="Moneda por defecto">
                    <input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} placeholder="ARS, USD…" maxLength={3} className={INPUT} />
                  </Opt>
                  <Opt label="IVA">
                    <label className="flex items-center gap-2 text-xs text-surface-300">
                      <input type="checkbox" checked={draft.priceIncludesIva} onChange={(e) => setDraft({ ...draft, priceIncludesIva: e.target.checked })} className="rounded border-surface-600 bg-surface-800 text-brand-500" />
                      El precio ya incluye IVA
                    </label>
                    <input type="number" min={0} max={100} step="0.5" value={draft.ivaPercent} onChange={(e) => setDraft({ ...draft, ivaPercent: e.target.value })} placeholder="Alícuota % (vacío = según fila / 21)" className={INPUT} />
                  </Opt>
                  <Opt label="Filas divisorias">
                    <select value={draft.dividerMeaning} onChange={(e) => setDraft({ ...draft, dividerMeaning: e.target.value as ImportDividerMeaning })} className={INPUT}>
                      <option value="IGNORE">Ignorar</option>
                      <option value="BRAND">Son marcas</option>
                      <option value="CATEGORY">Son categorías</option>
                    </select>
                    {preview && preview.dividers.length > 0 && (
                      <span className="text-[11px] text-surface-500 truncate" title={preview.dividers.join(" · ")}>
                        Detectadas: {preview.dividers.slice(0, 4).join(" · ")}{preview.dividers.length > 4 ? "…" : ""}
                      </span>
                    )}
                  </Opt>
                  <div className="text-[11px] text-surface-500 border-t border-surface-800 pt-3">
                    Obligatorio: <b>Nombre del producto</b> y <b>Precio</b> (neto o final). Sin columna de código, el sistema genera uno estable por nombre y marca.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const INPUT = "w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500";

function Opt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-surface-400">{label}</span>
      {children}
    </div>
  );
}
