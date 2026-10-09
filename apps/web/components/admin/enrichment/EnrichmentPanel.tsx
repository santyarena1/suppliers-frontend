"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Combine, Loader2, RefreshCw, Search } from "lucide-react";
import { providerLabel } from "@/components/ProviderBadge";
import {
  enrichmentApi,
  FIELD_LABELS,
  MASTER_STATUS_LABELS,
  type EnrichmentOverview,
  type MasterFilters,
  type MasterListItem,
  type MasterStatus,
  type ProposalField,
} from "@/lib/enrichment";
import MasterDetailView from "./MasterDetailView";
import RunBar from "./RunBar";
import { ConfidenceBadge, errMsg, Stat, thumb, type ShowToast } from "./shared";

const PAGE_SIZE = 40;

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${checked ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-surface-700 text-surface-400 hover:text-surface-200"}`}
    >
      {label}
    </button>
  );
}

function BulkBar({ filters, showToast, onDone }: { filters: MasterFilters; showToast: ShowToast; onDone: () => void }) {
  const [min, setMin] = useState(0.85);
  const [field, setField] = useState<ProposalField | "">("");
  const [busy, setBusy] = useState(false);
  async function run(decision: "APPROVED" | "REJECTED") {
    setBusy(true);
    try {
      const body = { decision, minConfidence: min, field: field || undefined, filter: filters };
      const dry = await enrichmentApi.bulkDecide(body);
      if (dry.data.matched === 0) {
        showToast("No hay propuestas pendientes con esa confianza en el filtro", false);
        return;
      }
      const verb = decision === "APPROVED" ? "Aprobar" : "Rechazar";
      if (!window.confirm(`${verb} ${dry.data.matched} propuestas pendientes con confianza ≥ ${Math.round(min * 100)}%?`)) return;
      const res = await enrichmentApi.bulkDecide({ ...body, confirm: true });
      showToast(`${res.data.updated} propuestas ${decision === "APPROVED" ? "aprobadas" : "rechazadas"}`);
      onDone();
    } catch (err) {
      showToast(errMsg(err, "No se pudo decidir en bloque"), false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-surface-300">
      <span className="text-surface-400">En bloque (sobre el filtro):</span>
      <select value={field} onChange={(e) => setField(e.target.value as ProposalField | "")} className="rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-xs">
        <option value="">todos los campos</option>
        {(Object.keys(FIELD_LABELS) as ProposalField[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        confianza ≥
        <input type="range" min={0.5} max={1} step={0.05} value={min} onChange={(e) => setMin(Number(e.target.value))} className="accent-brand-500" />
        <span className="w-9 tabular-nums">{Math.round(min * 100)}%</span>
      </label>
      <button type="button" disabled={busy} onClick={() => void run("APPROVED")} className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
        Aprobar
      </button>
      <button type="button" disabled={busy} onClick={() => void run("REJECTED")} className="rounded-md border border-red-500/40 px-2.5 py-1 font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40">
        Rechazar
      </button>
    </div>
  );
}

function MasterRow({ m, checked, onCheck, onOpen }: { m: MasterListItem; checked: boolean; onCheck: () => void; onOpen: () => void }) {
  const pending = m.proposals.filter((p) => p.status === "PENDING").length;
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-900/60">
      <input type="checkbox" checked={checked} onChange={onCheck} aria-label="Seleccionar para unir" className="accent-brand-500" />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex flex-shrink-0 gap-1">
          {[m.currentImage, m.proposedImage].map((src, i) => (
            <div key={i} className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-white ${i === 1 ? "ring-1 ring-brand-500/50" : ""}`} title={i === 0 ? "Foto actual" : "Foto propuesta"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={thumb(src)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <span className="text-[9px] text-surface-400">{i === 0 ? "sin foto" : "—"}</span>}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white group-hover:text-brand-200">{m.name}</p>
          <p className="truncate text-[11px] text-surface-500">
            {[m.brand, m.partNumber, m.categoryLabel ?? "sin categoría"].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="hidden w-40 flex-shrink-0 flex-wrap gap-1 md:flex">
          {m.providers.slice(0, 4).map((p) => (
            <span key={p} className="rounded bg-surface-800 px-1.5 py-0.5 text-[10px] text-surface-300">
              {providerLabel(p)}
            </span>
          ))}
          {m.providers.length > 4 && <span className="text-[10px] text-surface-500">+{m.providers.length - 4}</span>}
        </div>
        <div className="flex w-36 flex-shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {m.doubtful && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-label="Agrupación dudosa" />}
            {m.hasAiImage && <span className="rounded bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-300">FOTO IA</span>}
            <ConfidenceBadge value={m.bestConfidence} />
          </div>
          <span className="text-[10px] text-surface-500">
            {MASTER_STATUS_LABELS[m.status]}
            {pending > 0 ? ` · ${pending} pend.` : ""}
          </span>
        </div>
      </button>
    </li>
  );
}

/** Pestaña "Productos enriquecidos" de Administración. */
export default function EnrichmentPanel({ showToast }: { showToast: ShowToast }) {
  const [overview, setOverview] = useState<EnrichmentOverview | null>(null);
  const [filters, setFilters] = useState<MasterFilters>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MasterListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [regrouping, setRegrouping] = useState(false);

  const loadOverview = useCallback(() => {
    enrichmentApi
      .overview()
      .then((r) => setOverview(r.data))
      .catch(() => undefined);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enrichmentApi.list(filters, page, PAGE_SIZE);
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      showToast(errMsg(err, "No se pudo cargar la lista"), false);
    } finally {
      setLoading(false);
    }
  }, [filters, page, showToast]);

  const refresh = useCallback(() => {
    loadOverview();
    void loadList();
  }, [loadOverview, loadList]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === (q.trim() || undefined) ? f : { ...f, q: q.trim() || undefined }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  function setFilter<K extends keyof MasterFilters>(key: K, value: MasterFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  async function regroup() {
    setRegrouping(true);
    try {
      const r = (await enrichmentApi.regroup()).data;
      showToast(`${r.fichas} fichas → ${r.masters} productos (${r.created} nuevos, ${r.updated} cambiados, ${r.doubtful} dudosos) en ${Math.round(r.ms / 1000)} s`);
      refresh();
    } catch (err) {
      showToast(errMsg(err, "No se pudo reagrupar"), false);
    } finally {
      setRegrouping(false);
    }
  }

  async function merge() {
    const ids = [...checked];
    if (ids.length < 2) return;
    const target = items.find((i) => i.id === ids[0]);
    if (!window.confirm(`Unir ${ids.length} productos en "${target?.name ?? ids[0]}"? Las propuestas de los otros se descartan.`)) return;
    try {
      await enrichmentApi.merge(ids[0], ids.slice(1));
      showToast("Productos unidos");
      setChecked(new Set());
      refresh();
    } catch (err) {
      showToast(errMsg(err, "No se pudo unir"), false);
    }
  }

  if (openId) {
    return <MasterDetailView id={openId} showToast={showToast} onBack={() => setOpenId(null)} onChanged={refresh} />;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const o = overview;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">Productos enriquecidos</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-surface-400">
            Fotos oficiales, descripciones y atributos propuestos por producto maestro (las fichas de cada distribuidor agrupadas). Todo queda como propuesta: los comercios y el buscador no ven nada de esto.
          </p>
          {o && (
            <p className="mt-1.5 text-[11px] text-surface-500">
              Fuentes: <span className={o.sources.icecat ? "text-emerald-300" : "text-red-300"}>Open Icecat {o.sources.icecat ? "activo" : "sin usuario"}</span> ·{" "}
              <span className={o.sources.ai ? "text-emerald-300" : "text-amber-300"}>IA {o.sources.ai ? "activa" : "sin key"}</span> · webs oficiales:{" "}
              {o.sources.manufacturers.map((m) => m.source).join(", ")}
            </p>
          )}
        </div>
        <button type="button" disabled={regrouping} onClick={() => void regroup()} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-50">
          {regrouping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reagrupar
        </button>
      </div>

      {o && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Productos maestros" value={o.masters.toLocaleString("es-AR")} />
          <Stat label="En 2+ distribuidores" value={o.multiProvider.toLocaleString("es-AR")} />
          <Stat label="Agrupación dudosa" value={o.doubtful.toLocaleString("es-AR")} />
          <Stat label="Con foto IA" value={o.hasAiImage.toLocaleString("es-AR")} />
          <Stat label="Sin descripción" value={o.missingDescription.toLocaleString("es-AR")} />
          <Stat label="Propuestas pendientes" value={o.proposals.pending.toLocaleString("es-AR")} hint={`${o.proposals.approved} aprobadas`} />
        </div>
      )}

      <RunBar filters={filters} filteredTotal={total} showToast={showToast} onProgress={refresh} />

      <section className="rounded-xl border border-surface-800">
        <div className="flex flex-col gap-2 border-b border-surface-800 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, marca, part number o EAN" className="w-full rounded-lg border border-surface-700 bg-surface-950 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-surface-600" />
            </div>
            <select value={filters.category ?? ""} onChange={(e) => setFilter("category", e.target.value || undefined)} className="rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-surface-200">
              <option value="">Todas las categorías</option>
              {o?.categories.filter((c) => c.count > 0).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
            <select value={filters.status ?? ""} onChange={(e) => setFilter("status", (e.target.value || undefined) as MasterStatus | undefined)} className="rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-surface-200">
              <option value="">Todos los estados</option>
              {(Object.keys(MASTER_STATUS_LABELS) as MasterStatus[]).map((s) => (
                <option key={s} value={s}>
                  {MASTER_STATUS_LABELS[s]} {o?.byStatus[s] ? `(${o.byStatus[s]})` : ""}
                </option>
              ))}
            </select>
            <input value={filters.brand ?? ""} onChange={(e) => setFilter("brand", e.target.value || undefined)} placeholder="Marca" className="w-28 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-white placeholder:text-surface-600" />
            <input value={filters.provider ?? ""} onChange={(e) => setFilter("provider", e.target.value.toUpperCase() || undefined)} placeholder="Distribuidor" className="w-28 rounded-lg border border-surface-700 bg-surface-950 px-2 py-1.5 text-xs text-white placeholder:text-surface-600" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle label="Tiene foto IA" checked={!!filters.hasAiImage} onChange={(v) => setFilter("hasAiImage", v || undefined)} />
            <Toggle label="Sin descripción" checked={!!filters.missingDescription} onChange={(v) => setFilter("missingDescription", v || undefined)} />
            <Toggle label="Agrupación dudosa" checked={!!filters.doubtful} onChange={(v) => setFilter("doubtful", v || undefined)} />
            <Toggle label="2+ distribuidores" checked={!!filters.multiProvider} onChange={(v) => setFilter("multiProvider", v || undefined)} />
            <Toggle label="Confianza baja (<60%)" checked={filters.maxConfidence === 0.6} onChange={(v) => setFilter("maxConfidence", v ? 0.6 : undefined)} />
            <Toggle label="Confianza alta (≥80%)" checked={filters.minConfidence === 0.8} onChange={(v) => setFilter("minConfidence", v ? 0.8 : undefined)} />
          </div>
          <BulkBar filters={filters} showToast={showToast} onDone={refresh} />
        </div>

        {checked.size > 0 && (
          <div className="flex items-center gap-2 border-b border-surface-800 bg-brand-500/5 px-3 py-2 text-xs text-surface-200">
            {checked.size} seleccionados (el primero es el destino)
            <button type="button" disabled={checked.size < 2} onClick={() => void merge()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-brand-500/40 px-2.5 py-1 text-brand-200 hover:bg-brand-500/10 disabled:opacity-40">
              <Combine className="h-3.5 w-3.5" /> Unir
            </button>
            <button type="button" onClick={() => setChecked(new Set())} className="text-surface-400 hover:text-white">
              Limpiar
            </button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-surface-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-surface-500">
            {o && o.masters === 0 ? "Todavía no hay productos maestros: tocá “Reagrupar” para armarlos." : "Nada coincide con el filtro."}
          </p>
        ) : (
          <ul className={`divide-y divide-surface-800/70 ${loading ? "opacity-60" : ""}`}>
            {items.map((m) => (
              <MasterRow
                key={m.id}
                m={m}
                checked={checked.has(m.id)}
                onOpen={() => setOpenId(m.id)}
                onCheck={() =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-surface-800 px-3 py-2 text-xs text-surface-400">
          <span className="tabular-nums">{total.toLocaleString("es-AR")} productos</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1 hover:text-white disabled:opacity-30" aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded p-1 hover:text-white disabled:opacity-30" aria-label="Página siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
