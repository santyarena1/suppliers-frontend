"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { FIELD_LABELS, type Ficha, type MasterDetail, type Proposal, type ProposalStatus } from "@/lib/enrichment";
import { ConfidenceBadge, SourceTag, thumb } from "./shared";

const STATUS_CHIP: Record<ProposalStatus, string> = {
  PENDING: "border-surface-600 text-surface-300",
  APPROVED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-red-500/40 bg-red-500/10 text-red-300",
  APPLIED: "border-brand-500/40 bg-brand-500/10 text-brand-300",
};
const STATUS_TEXT: Record<ProposalStatus, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", APPLIED: "Aplicada" };

function Before({ proposal, fichas }: { proposal: Proposal; fichas: Ficha[] }) {
  if (proposal.field === "images") {
    return (
      <div className="flex flex-wrap gap-2">
        {fichas.map((f) => (
          <figure key={f.id} className="w-20">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-surface-800 bg-white">
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb(f.imageUrl)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-[10px] text-surface-500">Sin foto</span>
              )}
              {f.aiImage && <span className="absolute left-0.5 top-0.5 rounded bg-amber-500 px-1 text-[9px] font-bold text-black">IA</span>}
            </div>
            <figcaption className="mt-0.5 truncate text-[10px] text-surface-500">{f.provider}</figcaption>
          </figure>
        ))}
      </div>
    );
  }
  if (proposal.field === "attributes") return <p className="text-xs text-surface-500">Las fichas no tienen atributos estructurados.</p>;
  const pick = (f: Ficha) => (proposal.field === "category" ? [f.category, f.subcategory].filter(Boolean).join(" › ") : proposal.field === "description" ? f.description : f.longDescription);
  return (
    <ul className="space-y-1.5">
      {fichas.map((f) => (
        <li key={f.id} className="text-xs">
          <span className="mr-1.5 text-[10px] font-semibold uppercase text-surface-500">{f.provider}</span>
          <span className={pick(f) ? "text-surface-300" : "italic text-surface-600"}>{pick(f)?.slice(0, 400) || "vacío"}</span>
        </li>
      ))}
    </ul>
  );
}

function After({ proposal, detail }: { proposal: Proposal; detail: MasterDetail }) {
  const v = proposal.value;
  if (proposal.field === "images") {
    const rejected = (proposal.evidence?.rejected as { url: string; source: string; reason?: string }[] | undefined) ?? [];
    return (
      <div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(v.images ?? []).map((img, i) => (
            <a key={img.url} href={img.url} target="_blank" rel="noreferrer" className="group block">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-surface-700 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(img.assetUrl ?? img.url)} alt="" className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" loading="lazy" />
                {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[9px] font-bold text-white">PRINCIPAL</span>}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-surface-500">
                {img.origin ?? img.source}
                {img.width ? ` · ${img.width}×${img.height}` : ""}
                {img.assetUrl ? " · guardada" : img.persistError ? " · no se pudo guardar" : ""}
              </p>
            </a>
          ))}
        </div>
        {rejected.length > 0 && (
          <details className="mt-2 text-[11px] text-surface-500">
            <summary className="cursor-pointer select-none hover:text-surface-300">{rejected.length} descartadas</summary>
            <ul className="mt-1 space-y-0.5">
              {rejected.map((r) => (
                <li key={r.url} className="truncate">
                  {r.source}: {r.reason} — <span className="text-surface-600">{r.url}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  if (proposal.field === "attributes") {
    const values = v.values ?? {};
    const rows = detail.schema.attributes.filter((a) => values[a.key]);
    const extra = Object.keys(values).filter((k) => !detail.schema.attributes.some((a) => a.key === k));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-surface-500">
              <th className="py-1 pr-3 font-medium">Atributo</th>
              <th className="py-1 pr-3 font-medium">Valor</th>
              <th className="py-1 pr-3 font-medium">Fuente</th>
              <th className="py-1 font-medium">Confianza</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-800">
            {[...rows.map((a) => ({ key: a.key, label: a.label })), ...extra.map((k) => ({ key: k, label: k }))].map(({ key, label }) => {
              const a = values[key];
              const shown = typeof a.value === "boolean" ? (a.value ? "Sí" : "No") : `${a.value}${a.unit ? ` ${a.unit}` : ""}`;
              return (
                <tr key={key} title={a.evidence}>
                  <td className="py-1 pr-3 text-surface-400">{label}</td>
                  <td className="py-1 pr-3 font-medium text-white">{shown}</td>
                  <td className="py-1 pr-3">
                    <SourceTag source={a.source} />
                  </td>
                  <td className="py-1">
                    <ConfidenceBadge value={a.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-surface-600">
          Esquema {v.schema} v{v.version} · pasá el mouse por una fila para ver la evidencia.
        </p>
      </div>
    );
  }
  if (proposal.field === "category") return <p className="text-sm font-medium text-white">{v.label}</p>;
  return <p className="whitespace-pre-line text-sm leading-relaxed text-surface-100">{v.text}</p>;
}

/** Un campo propuesto: antes (cada ficha) / después, con fuente, confianza y decisión. */
export default function ProposalCard({
  proposal,
  detail,
  busy,
  onDecide,
}: {
  proposal: Proposal;
  detail: MasterDetail;
  busy: boolean;
  onDecide: (decision: "APPROVED" | "REJECTED" | "PENDING") => void;
}) {
  const evidenceUrl = typeof proposal.evidence?.url === "string" ? proposal.evidence.url : null;
  const evidenceNote = [proposal.evidence?.match, proposal.evidence?.note].filter((x): x is string => typeof x === "string").join(" · ");
  return (
    <article className="rounded-xl border border-surface-800 bg-surface-900/40">
      <header className="flex flex-wrap items-center gap-2 border-b border-surface-800 px-4 py-2.5">
        <h4 className="text-sm font-semibold text-white">{FIELD_LABELS[proposal.field]}</h4>
        <ConfidenceBadge value={proposal.confidence} />
        <SourceTag source={proposal.source} />
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CHIP[proposal.status]}`}>{STATUS_TEXT[proposal.status]}</span>
        <div className="ml-auto flex gap-1.5">
          {proposal.status === "PENDING" ? (
            <>
              <button type="button" disabled={busy} onClick={() => onDecide("APPROVED")} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40">
                <Check className="h-3.5 w-3.5" /> Aprobar
              </button>
              <button type="button" disabled={busy} onClick={() => onDecide("REJECTED")} className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                <X className="h-3.5 w-3.5" /> Rechazar
              </button>
            </>
          ) : proposal.status !== "APPLIED" ? (
            <button type="button" disabled={busy} onClick={() => onDecide("PENDING")} className="inline-flex items-center gap-1 rounded-md border border-surface-700 px-2.5 py-1 text-xs text-surface-300 hover:text-white disabled:opacity-40">
              <RotateCcw className="h-3.5 w-3.5" /> Deshacer
            </button>
          ) : null}
        </div>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-surface-500">Antes</p>
          <Before proposal={proposal} fichas={detail.fichas} />
        </div>
        <div className="min-w-0 lg:border-l lg:border-surface-800 lg:pl-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-brand-300">Después</p>
          <After proposal={proposal} detail={detail} />
          {(evidenceUrl || evidenceNote) && (
            <p className="mt-2 truncate text-[11px] text-surface-500">
              {evidenceNote}
              {evidenceUrl && (
                <>
                  {evidenceNote ? " · " : ""}
                  <a href={evidenceUrl} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline">
                    ver fuente
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
