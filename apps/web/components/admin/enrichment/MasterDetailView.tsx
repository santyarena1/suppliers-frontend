"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Eye, Loader2, Lock, Scissors, Sparkles, Upload } from "lucide-react";
import { enrichmentApi, MASTER_STATUS_LABELS, type ApplyPreview, type MasterDetail, type ProposalField } from "@/lib/enrichment";
import ProposalCard from "./ProposalCard";
import { ConfidenceBadge, errMsg, fmtWhen, thumb, type ShowToast } from "./shared";

const FIELD_ORDER: ProposalField[] = ["images", "description", "longDescription", "attributes", "category"];

function FichasStrip({ detail, selected, onToggle }: { detail: MasterDetail; selected: Set<string>; onToggle: (k: string) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {detail.fichas.map((f) => {
        const k = `${f.provider}:${f.externalId}`;
        return (
          <article key={k} className={`w-60 flex-shrink-0 rounded-xl border p-3 ${selected.has(k) ? "border-brand-500/60 bg-brand-500/5" : "border-surface-800 bg-surface-900/40"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-surface-300">{f.provider}</span>
              {detail.fichas.length > 1 && (
                <label className="flex items-center gap-1 text-[10px] text-surface-500">
                  <input type="checkbox" checked={selected.has(k)} onChange={() => onToggle(k)} className="accent-brand-500" />
                  separar
                </label>
              )}
            </div>
            <div className="relative mt-2 flex h-28 items-center justify-center overflow-hidden rounded-md bg-white">
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb(f.imageUrl)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-xs text-surface-500">Sin foto</span>
              )}
              {f.aiImage && <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-black">FOTO IA</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-medium text-white" title={f.name}>
              {f.name}
            </p>
            <dl className="mt-1.5 space-y-0.5 text-[11px] text-surface-400">
              <div>PN: <span className="text-surface-200">{f.partNumber || "—"}</span></div>
              <div>EAN: <span className="text-surface-200">{f.ean || "—"}</span></div>
              <div className="truncate">Cat.: <span className="text-surface-200">{[f.category, f.subcategory].filter(Boolean).join(" › ") || "—"}</span></div>
              {f.manual && <div className="flex items-center gap-1 text-brand-300"><Lock className="h-3 w-3" /> fijada a mano</div>}
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function ApplySection({ masterId, note }: { masterId: string; note: string }) {
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      setPreview((await enrichmentApi.applyPreview(masterId)).data);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="rounded-xl border border-dashed border-surface-700 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled title={note} className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-surface-800 px-3 py-1.5 text-xs font-medium text-surface-500">
          <Upload className="h-3.5 w-3.5" /> Aplicar a las fichas
        </button>
        <p className="text-xs text-surface-400">{note}.</p>
        <button type="button" onClick={() => void load()} className="ml-auto inline-flex items-center gap-1.5 text-xs text-brand-300 hover:underline">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Vista previa
        </button>
      </div>
      {preview && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-surface-500">
                <th className="py-1 pr-3 font-medium">Ficha</th>
                <th className="py-1 pr-3 font-medium">Campo</th>
                <th className="py-1 pr-3 font-medium">Hoy</th>
                <th className="py-1 pr-3 font-medium">Solo completar vacíos</th>
                <th className="py-1 font-medium">Reemplazar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-800">
              {preview.fichas.flatMap((f) =>
                f.changes
                  .filter((c) => c.column)
                  .map((c) => (
                    <tr key={`${f.provider}-${f.externalId}-${c.field}`}>
                      <td className="py-1 pr-3 text-surface-300">{f.provider}</td>
                      <td className="py-1 pr-3 text-surface-400">
                        {c.column}
                        {c.status === "PENDING" && <span className="ml-1 text-[10px] text-surface-600">(pendiente)</span>}
                      </td>
                      <td className="max-w-xs truncate py-1 pr-3 text-surface-500" title={c.current ?? ""}>
                        {c.currentIsAiImage ? "foto IA" : c.current ? c.current.slice(0, 80) : "vacío"}
                      </td>
                      <td className="py-1 pr-3">{c.fillEmpty ? <span className="text-emerald-300">cambia</span> : <span className="text-surface-600">igual</span>}</td>
                      <td className="py-1">{c.overwrite ? <span className="text-amber-300">cambia</span> : <span className="text-surface-600">igual</span>}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-surface-600">Atributos y categoría no tienen columna en la ficha: su aplicación se define con la regla.</p>
        </div>
      )}
    </section>
  );
}

/** Detalle de un producto maestro: fichas lado a lado y antes/después por campo. */
export default function MasterDetailView({ id, showToast, onBack, onChanged }: { id: string; showToast: ShowToast; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<MasterDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setDetail((await enrichmentApi.detail(id)).data);
    } catch (err) {
      showToast(errMsg(err, "No se pudo cargar el producto"), false);
    }
  }, [id, showToast]);

  useEffect(() => {
    setDetail(null);
    setSelected(new Set());
    void load();
  }, [load]);

  async function enrich() {
    setEnriching(true);
    try {
      const res = await enrichmentApi.enrichOne(id);
      setDetail(res.data.detail);
      const notes = res.data.run.log?.map((l) => l.msg).join(" · ");
      showToast(notes ? `Listo · ${notes.slice(0, 140)}` : "Propuestas actualizadas");
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo enriquecer"), false);
    } finally {
      setEnriching(false);
    }
  }

  async function decide(field: ProposalField, decision: "APPROVED" | "REJECTED" | "PENDING") {
    setBusy(true);
    try {
      await enrichmentApi.decide(id, field, decision);
      await load();
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar la decisión"), false);
    } finally {
      setBusy(false);
    }
  }

  async function split() {
    const members = [...selected].map((k) => {
      const [provider, ...rest] = k.split(":");
      return { provider, externalId: rest.join(":") };
    });
    setBusy(true);
    try {
      await enrichmentApi.split(id, members);
      showToast(`${members.length} ficha(s) separadas en un producto nuevo`);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (err) {
      showToast(errMsg(err, "No se pudo separar"), false);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-surface-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  const m = detail.master;
  const proposals = [...detail.proposals].sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onBack} className="mt-0.5 rounded-md border border-surface-700 p-1.5 text-surface-300 hover:text-white" aria-label="Volver a la lista">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">{m.name}</h3>
          <p className="mt-0.5 text-xs text-surface-400">
            {[m.brand, m.partNumber && `PN ${m.partNumber}`, m.ean && `EAN ${m.ean}`, m.categoryLabel].filter(Boolean).join(" · ")} · agrupado por {m.matchKind}
            {m.lockedManual ? " (a mano)" : ""} · {MASTER_STATUS_LABELS[m.status]} · {fmtWhen(m.enrichedAt)} <ConfidenceBadge value={m.bestConfidence} />
          </p>
          {m.doubtful && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" /> Agrupación dudosa: {m.doubtReason}
            </p>
          )}
        </div>
        <button type="button" disabled={enriching} onClick={() => void enrich()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50">
          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {enriching ? "Buscando en las fuentes…" : "Enriquecer este producto"}
        </button>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h4 className="text-sm font-semibold text-white">Fichas de cada distribuidor ({detail.fichas.length})</h4>
          {selected.size > 0 && (
            <button type="button" disabled={busy} onClick={() => void split()} className="ml-auto inline-flex items-center gap-1 rounded-md border border-surface-700 px-2.5 py-1 text-xs text-surface-200 hover:text-white disabled:opacity-40">
              <Scissors className="h-3.5 w-3.5" /> Separar {selected.size} en otro producto
            </button>
          )}
        </div>
        <FichasStrip
          detail={detail}
          selected={selected}
          onToggle={(k) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-white">Propuestas</h4>
        {proposals.length === 0 ? (
          <p className="rounded-xl border border-surface-800 px-4 py-6 text-center text-sm text-surface-500">
            Todavía no hay propuestas. Usá “Enriquecer este producto”.
          </p>
        ) : (
          proposals.map((p) => <ProposalCard key={p.id} proposal={p} detail={detail} busy={busy} onDecide={(d) => void decide(p.field, d)} />)
        )}
      </section>

      <ApplySection masterId={m.id} note={detail.applyNote} />
    </div>
  );
}
