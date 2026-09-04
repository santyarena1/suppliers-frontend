"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, Search, Settings2, Trash2, XCircle,
} from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import ProviderBadge from "@/components/ProviderBadge";
import { listImportsApi, type ListImportDetail, type ListImportPriceChange, type Provider } from "@/lib/api";
import { fmtDate } from "@/components/list-import/ListImportsPanel";
import { invalidateListFreshness } from "@/lib/listFreshness";

type Group = "priceChanged" | "created" | "missing" | "issues";

const POLL_MS = 2500;

/** Revisión de una carga: motivos, diff por grupo y acciones. */
export default function ListImportReviewPage({ params }: { params: Promise<{ provider: string; importId: string }> }) {
  const { provider: raw, importId } = use(params);
  const provider = raw.toUpperCase() as Provider;
  const router = useRouter();
  const [detail, setDetail] = useState<ListImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("priceChanged");
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState<"apply" | "discard" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listImportsApi.get(provider, importId);
      setDetail(res.data);
      setError(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo cargar la carga");
    }
  }, [provider, importId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (detail?.status !== "PROCESSING") return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [detail?.status, load]);

  async function act(kind: "apply" | "discard") {
    setWorking(kind);
    try {
      const res = kind === "apply" ? await listImportsApi.apply(provider, importId) : await listImportsApi.discard(provider, importId);
      setDetail(res.data);
      invalidateListFreshness(provider);
      if (kind === "apply") router.push(`/proveedores/${provider}?tab=lists`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo completar la acción");
    } finally {
      setWorking(null);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!detail) return [];
    const match = (text: string) => !q || text.toLowerCase().includes(q);
    if (group === "issues") return detail.issues.filter((i) => match(`${i.row} ${i.column ?? ""} ${i.message}`));
    const samples = detail.diff?.samples;
    if (!samples) return [];
    if (group === "priceChanged") return samples.priceChanged.filter((c) => match(`${c.externalId} ${c.name}`));
    if (group === "created") return samples.created.filter((c) => match(`${c.externalId} ${c.name}`));
    return samples.missing.filter((c) => match(`${c.externalId} ${c.name}`));
  }, [detail, group, q]);

  const counts = detail?.diff?.counts;
  const canDecide = detail?.status === "NEEDS_REVIEW";

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/proveedores/${provider}?tab=lists`} className="text-surface-500 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <ProviderBadge provider={provider} variant="inline" size="md" />
          <span className="text-xs text-surface-500 truncate hidden sm:inline">
            {detail ? `${detail.originalFileName} · ${fmtDate(detail.createdAt)}` : "Carga"}
          </span>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 bg-red-500/8 border border-red-500/20 text-red-400">
              <XCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {!detail ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : (
            <>
              {/* Estado y motivos */}
              {detail.status === "PROCESSING" && (
                <div className="flex items-center gap-2 text-sm text-sky-400 bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Procesando la planilla…
                </div>
              )}
              {detail.status === "FAILED" && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">La carga falló</p>
                    <p className="text-xs opacity-90 mt-0.5">{detail.error ?? "Sin detalle"}</p>
                    <Link href={`/proveedores/${provider}/listas/perfil`} className="text-xs underline mt-1 inline-block">Revisar el perfil de lectura</Link>
                  </div>
                </div>
              )}
              {detail.status === "NEEDS_REVIEW" && (
                <div className="text-sm text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="w-4 h-4" /> Esta carga necesita tu revisión</p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-200/90 list-disc pl-5">
                    {(detail.reviewReasons ?? []).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {detail.status === "APPLIED" && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
                  <CheckCircle2 className="w-4 h-4" /> Aplicada el {detail.appliedAt ? fmtDate(detail.appliedAt) : "—"}
                </div>
              )}
              {(detail.status === "DISCARDED" || detail.status === "REVERTED") && (
                <div className="text-sm text-surface-400 bg-surface-900 border border-surface-800 rounded-xl px-4 py-3">
                  {detail.status === "DISCARDED" ? "Carga descartada: no impactó en el catálogo." : `Revertida el ${detail.revertedAt ? fmtDate(detail.revertedAt) : "—"}.`}
                </div>
              )}

              {/* Resumen */}
              {counts && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Stat label="Filas leídas" value={detail.summary?.normalized ?? detail.rowsData} />
                  <Stat label="Nuevos" value={counts.created} tone="emerald" onClick={() => setGroup("created")} active={group === "created"} />
                  <Stat label="Cambio de precio" value={counts.priceChanged} tone="amber" onClick={() => setGroup("priceChanged")} active={group === "priceChanged"} />
                  <Stat label="Desaparecen" value={counts.missing} tone="red" onClick={() => setGroup("missing")} active={group === "missing"} />
                  <Stat label="Filas con problema" value={detail.summary?.issues ?? detail.issues.length} tone="amber" onClick={() => setGroup("issues")} active={group === "issues"} />
                </div>
              )}

              {/* Acciones */}
              {canDecide && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => act("apply")}
                    disabled={working !== null}
                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2"
                  >
                    {working === "apply" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Aplicar igual
                  </button>
                  <Link
                    href={`/proveedores/${provider}/listas/perfil?reprocess=${detail.id}`}
                    className="flex items-center gap-2 border border-surface-700 hover:border-surface-500 text-surface-200 text-sm font-medium rounded-lg px-4 py-2"
                  >
                    <Settings2 className="w-4 h-4" /> Corregir perfil
                  </Link>
                  <button
                    type="button"
                    onClick={() => act("discard")}
                    disabled={working !== null}
                    className="flex items-center gap-2 text-surface-400 hover:text-red-400 text-sm font-medium px-3 py-2"
                  >
                    {working === "discard" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Descartar
                  </button>
                </div>
              )}

              {/* Diff */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(["priceChanged", "created", "missing", "issues"] as Group[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGroup(g)}
                      className={`text-xs font-medium rounded-lg px-3 py-1.5 border ${
                        group === g ? "border-brand-500 text-brand-700 dark:text-brand-400" : "border-surface-800 text-surface-400 hover:text-surface-200"
                      }`}
                    >
                      {GROUP_LABEL[g]}
                    </button>
                  ))}
                  <div className="relative ml-auto min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar código o nombre…"
                      className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="border border-surface-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-900 text-[10px] uppercase tracking-wider text-surface-500">
                          {group === "issues" ? (
                            <>
                              <th className="text-left font-semibold px-4 py-2">Fila</th>
                              <th className="text-left font-semibold px-3 py-2">Columna</th>
                              <th className="text-left font-semibold px-3 py-2">Motivo</th>
                            </>
                          ) : (
                            <>
                              <th className="text-left font-semibold px-4 py-2">Código</th>
                              <th className="text-left font-semibold px-3 py-2">Producto</th>
                              {group === "priceChanged" ? (
                                <>
                                  <th className="text-right font-semibold px-3 py-2">Antes</th>
                                  <th className="text-right font-semibold px-3 py-2">Ahora</th>
                                  <th className="text-right font-semibold px-3 py-2">%</th>
                                </>
                              ) : (
                                <th className="text-right font-semibold px-3 py-2">Precio</th>
                              )}
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800">
                        {group === "issues"
                          ? (filtered as ListImportDetail["issues"]).map((i) => (
                              <tr key={i.id} className="hover:bg-surface-900/60">
                                <td className="px-4 py-2 tabular-nums text-surface-300">{i.row}</td>
                                <td className="px-3 py-2 text-surface-400">{i.column ?? "—"}</td>
                                <td className="px-3 py-2 text-amber-200/90">{i.message}</td>
                              </tr>
                            ))
                          : group === "priceChanged"
                            ? (filtered as ListImportPriceChange[]).map((c) => (
                                <tr key={c.externalId} className="hover:bg-surface-900/60">
                                  <td className="px-4 py-2 font-mono text-xs text-surface-400">{c.externalId}</td>
                                  <td className="px-3 py-2 text-surface-200 max-w-md truncate">{c.name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-surface-400">{fmtNum(c.before)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-surface-100">{fmtNum(c.after)}</td>
                                  <td className={`px-3 py-2 text-right tabular-nums ${c.percent == null ? "text-surface-500" : c.percent > 0 ? "text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                    {c.percent == null ? "—" : `${c.percent > 0 ? "+" : ""}${c.percent}%`}
                                  </td>
                                </tr>
                              ))
                            : (filtered as { externalId: string; name: string; price: number | null }[]).map((c) => (
                                <tr key={c.externalId} className="hover:bg-surface-900/60">
                                  <td className="px-4 py-2 font-mono text-xs text-surface-400">{c.externalId}</td>
                                  <td className="px-3 py-2 text-surface-200 max-w-md truncate">{c.name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-surface-200">{fmtNum(c.price)}</td>
                                </tr>
                              ))}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 && (
                    <p className="text-center text-xs text-surface-500 py-10">Nada en este grupo.</p>
                  )}
                  {group !== "issues" && counts && filtered.length >= 300 && (
                    <p className="text-center text-[11px] text-surface-500 py-2 border-t border-surface-800">Se muestran las primeras 300 filas del grupo.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const GROUP_LABEL: Record<Group, string> = {
  priceChanged: "Cambios de precio",
  created: "Nuevos",
  missing: "Desaparecen",
  issues: "Filas con problema",
};

function Stat({ label, value, tone, onClick, active }: { label: string; value: number; tone?: "emerald" | "amber" | "red"; onClick?: () => void; active?: boolean }) {
  const color = tone === "emerald" ? "text-emerald-700 dark:text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "red" ? "text-red-400" : "text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`bg-surface-900 border rounded-xl p-3 text-left ${active ? "border-brand-500" : "border-surface-800"} ${onClick ? "hover:border-surface-600" : "cursor-default"}`}
    >
      <span className="block text-[10px] font-semibold text-surface-500 uppercase tracking-wider">{label}</span>
      <span className={`block text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value.toLocaleString("es-AR")}</span>
    </button>
  );
}

function fmtNum(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}
