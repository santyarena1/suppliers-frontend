"use client";

import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { catalogApi, type PlatformProductContent, type Provider } from "@/lib/api";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

/** Tipografía del HTML de la descripción, con la paleta de la ficha. */
const PROSE =
  "text-sm leading-relaxed text-surface-300 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white " +
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_p]:my-2 [&_strong]:text-surface-100 " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-brand-400 " +
  "[&_table]:my-3 [&_table]:w-full [&_td]:border-b [&_td]:border-surface-800 [&_td]:py-1.5 [&_td]:pr-3 [&_img]:hidden";

/**
 * La ficha enriquecida no se selecciona ni se copia con el mouse: se copia con
 * "Copiar ficha", que tiene tope diario y queda registrado.
 */
const block = (e: SyntheticEvent) => e.preventDefault();
const PROTECT = {
  className: "select-none",
  onCopy: block,
  onCut: block,
  onContextMenu: block,
  onDragStart: block,
} as const;

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

interface CopyProps {
  provider: string;
  externalId: string;
}

function CopyRichButton({ provider, externalId }: CopyProps) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const copy = async () => {
    setState("busy");
    try {
      const r = await catalogApi.copyRichText(provider as Provider, externalId);
      await navigator.clipboard.writeText(r.data.text);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setError(errMsg(err, "No se pudo copiar la ficha"));
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {state === "error" && <span className="text-xs text-red-300">{error}</span>}
      <button
        type="button"
        onClick={() => void copy()}
        disabled={state === "busy"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 bg-surface-800 px-2.5 py-1.5 text-xs font-semibold text-surface-200 hover:bg-surface-700 hover:text-white disabled:opacity-60"
        title="Copia la descripción y las especificaciones"
      >
        {state === "busy" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === "done" ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {state === "done" ? "Copiada" : "Copiar ficha"}
      </button>
    </div>
  );
}

interface DescriptionProps extends CopyProps {
  content: PlatformProductContent;
}

/** Descripción enriquecida: la bajada y el HTML limpio (DOMPurify corre en el navegador). */
export function ProductRichDescription({ content, provider, externalId, id }: DescriptionProps & { id?: string }) {
  const [clean, setClean] = useState("");
  useEffect(() => {
    setClean(sanitizeRichHtml(content.descriptionHtml ?? ""));
  }, [content.descriptionHtml]);

  if (!content.descriptionHtml && !content.shortDescription && !content.specs.length) return null;
  return (
    <section id={id} {...PROTECT} className={`scroll-mt-16 rounded-2xl border border-surface-800 bg-surface-900/60 p-5 sm:p-6 ${PROTECT.className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">{content.descriptionHtml || content.shortDescription ? "Descripción" : "Ficha técnica"}</h2>
        <CopyRichButton provider={provider} externalId={externalId} />
      </div>
      {content.shortDescription && (
        <p className="text-[15px] leading-relaxed text-surface-100">{content.shortDescription}</p>
      )}
      {clean && <div className={`${PROSE} mt-3 max-w-[860px]`} dangerouslySetInnerHTML={{ __html: clean }} />}
    </section>
  );
}

interface SpecsProps {
  specs: PlatformProductContent["specs"];
}

/** Especificaciones agrupadas ("Memoria", "Conectividad"…); las sin grupo van en "Generales". */
export function ProductSpecsTable({ specs, id }: SpecsProps & { id?: string }) {
  // Grupos ("Memoria", "Conectividad"…) repartidos en dos columnas de alto parejo.
  const columns = useMemo(() => {
    const groups = new Map<string, { name: string; value: string }[]>();
    for (const s of specs) {
      const key = s.group?.trim() || "Generales";
      groups.set(key, [...(groups.get(key) ?? []), { name: s.name, value: s.value }]);
    }
    const cols: { rows: number; groups: [string, { name: string; value: string }[]][] }[] = [
      { rows: 0, groups: [] },
      { rows: 0, groups: [] },
    ];
    for (const g of groups.entries()) {
      const target = cols[0].rows <= cols[1].rows ? cols[0] : cols[1];
      target.groups.push(g);
      target.rows += g[1].length + 1;
    }
    return cols.filter((c) => c.groups.length);
  }, [specs]);

  if (!specs.length) return null;
  return (
    <section id={id} {...PROTECT} className={`scroll-mt-16 rounded-2xl border border-surface-800 bg-surface-900/60 p-5 sm:p-6 ${PROTECT.className}`}>
      <h2 className="mb-3.5 text-lg font-bold text-white">Especificaciones</h2>
      <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-col gap-5">
            {col.groups.map(([group, rows]) => (
              <div key={group}>
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-400">{group}</h3>
                <dl className="m-0">
                  {rows.map((r, i) => (
                    <div key={`${r.name}-${i}`} className="grid grid-cols-2 gap-3 border-b border-surface-800 py-2 text-sm">
                      <dt className="text-surface-400">{r.name}</dt>
                      <dd className="m-0 break-words text-white">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
