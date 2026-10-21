"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformProductContent } from "@/lib/api";
import { sanitizeRichHtml } from "@/lib/sanitize-html";

/** Tipografía del HTML de la descripción, con la paleta de la ficha. */
const PROSE =
  "text-sm leading-relaxed text-surface-300 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white " +
  "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_p]:my-2 [&_strong]:text-surface-100 " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-brand-400 " +
  "[&_table]:my-3 [&_table]:w-full [&_td]:border-b [&_td]:border-surface-800 [&_td]:py-1.5 [&_td]:pr-3 [&_img]:hidden";

interface DescriptionProps {
  content: PlatformProductContent;
}

/** Descripción enriquecida: la bajada y el HTML limpio (DOMPurify corre en el navegador). */
export function ProductRichDescription({ content }: DescriptionProps) {
  const [clean, setClean] = useState("");
  useEffect(() => {
    setClean(sanitizeRichHtml(content.descriptionHtml ?? ""));
  }, [content.descriptionHtml]);

  if (!content.descriptionHtml && !content.shortDescription) return null;
  return (
    <section className="pp rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
      <h2 className="pp__sec-title">Descripción</h2>
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
    <section className="pp rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
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
