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
export function ProductRichDescription({ content, provider, externalId }: DescriptionProps) {
  const [clean, setClean] = useState("");
  useEffect(() => {
    setClean(sanitizeRichHtml(content.descriptionHtml ?? ""));
  }, [content.descriptionHtml]);

  if (!content.descriptionHtml && !content.shortDescription && !content.specs.length) return null;
  return (
    <section {...PROTECT} className={`pp rounded-2xl border border-surface-800 bg-surface-900/60 p-5 ${PROTECT.className}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="pp__sec-title">{content.descriptionHtml || content.shortDescription ? "Descripción" : "Ficha técnica"}</h2>
        <CopyRichButton provider={provider} externalId={externalId} />
      </div>
      {content.shortDescription && (
        <p className="text-[15px] leading-relaxed text-surface-100">{content.shortDescription}</p>
      )}
      {clean && <div className={`${PROSE} mt-3`} dangerouslySetInnerHTML={{ __html: clean }} />}
    </section>
  );
}

interface SpecsProps {
  specs: PlatformProductContent["specs"];
}

/** Especificaciones agrupadas ("Memoria", "Conectividad"…); las sin grupo van en "Generales". */
export function ProductSpecsTable({ specs }: SpecsProps) {
  const groups = useMemo(() => {
    const out = new Map<string, { name: string; value: string }[]>();
    for (const s of specs) {
      const key = s.group?.trim() || "Generales";
      out.set(key, [...(out.get(key) ?? []), { name: s.name, value: s.value }]);
    }
    return [...out.entries()];
  }, [specs]);

  if (!specs.length) return null;
  return (
    <section {...PROTECT} className={`pp rounded-2xl border border-surface-800 bg-surface-900/60 p-5 ${PROTECT.className}`}>
      <h2 className="pp__sec-title">Especificaciones</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {groups.map(([group, rows]) => (
          <div key={group} className="min-w-0">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">{group}</h3>
            <dl className="divide-y divide-surface-800/80">
              {rows.map((r, i) => (
                <div key={`${r.name}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-1.5 text-sm">
                  <dt className="text-surface-400">{r.name}</dt>
                  <dd className="break-words text-surface-100">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
