import type { ReactNode } from "react";

/**
 * Sistema de la página de la marca: todas las secciones comparten ancho,
 * encabezado (número, título, qué es) y superficie. Diseño sobrio, de panel.
 */
export const CONTAINER = "max-w-6xl mx-auto px-4 sm:px-6 w-full";
/** Superficie única para bloques de contenido. */
export const SURFACE = "rounded-xl bg-surface-900/70 ring-1 ring-white/[0.06]";

export function BrandSection({
  id,
  index,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  index?: number;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-white/[0.06] py-10 sm:py-12">
      <div className={CONTAINER}>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-3 min-w-0">
            {index != null && (
              <span className="text-xs font-medium tabular-nums text-surface-500">{String(index).padStart(2, "0")}</span>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-white text-balance">{title}</h2>
              <p className="mt-1 text-sm text-surface-400 max-w-2xl text-pretty">{description}</p>
            </div>
          </div>
          {aside && <div className="flex-shrink-0">{aside}</div>}
        </header>
        {children}
      </div>
    </section>
  );
}

/** Módulo sin contenido todavía (solo en el espacio vinculado: al público no se le muestra). */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-5 py-6 text-sm text-surface-400">{children}</div>
  );
}

export function CountTag({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-xs text-surface-400 tabular-nums">
      <span className="text-white font-medium">{n}</span> {label}
    </span>
  );
}
