"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, Tag, X } from "lucide-react";

export type SellerModeAudience = "manager" | "buyer" | "seller" | "base" | "other";

interface Copy {
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  primary: { label: string; href?: string };
}

function copyFor(audience: SellerModeAudience, marginsHref: string): Copy {
  switch (audience) {
    case "manager":
      return {
        eyebrow: "Nuevo en NODO Pro",
        title: "Modo vendedor",
        lead: "Cargá tus márgenes de venta y tu equipo de ventas ve el precio al público, sin ver tus costos.",
        points: [
          "Un margen por distribuidor, por categoría o por producto, con cambios masivos.",
          "Tus vendedores ven solo el precio de venta. Vos seguís viendo el costo y la venta.",
          "\"Ver como vendedor\" en tus preferencias para mirar la app como la ve tu equipo.",
        ],
        primary: { label: "Configurar márgenes", href: marginsHref },
      };
    case "buyer":
      return {
        eyebrow: "Novedad",
        title: "Modo vendedor",
        lead: "Tu comercio puede cargar márgenes de venta. Al lado de cada costo vas a ver el precio de venta.",
        points: [
          "El costo sigue siendo el mismo de siempre: el margen no lo cambia.",
          "Los vendedores de tu equipo ven solo el precio de venta.",
          "Con \"Ver como vendedor\" en tus preferencias mirás la app como la ven ellos.",
        ],
        primary: { label: "Entendido" },
      };
    case "seller":
      return {
        eyebrow: "Novedad",
        title: "Ahora ves precios de venta",
        lead: "Los precios que ves en la búsqueda y en cada producto son los de venta al público de tu comercio.",
        points: [
          "Salen del margen que cargó tu comercio para cada distribuidor y categoría.",
          "Si un producto no tiene precio de venta, consultalo con quien compra.",
          "La comparación con tu web usa tu precio de venta.",
        ],
        primary: { label: "Entendido" },
      };
    case "base":
      return {
        eyebrow: "Novedad en NODO Pro",
        title: "Modo vendedor",
        lead: "Márgenes de venta por distribuidor, categoría y producto, y un precio al público para tu equipo de ventas.",
        points: [
          "Tus vendedores cotizan con el precio de venta sin ver tus costos.",
          "Cambiás márgenes de muchas categorías o productos a la vez.",
          "Está incluido en NODO Pro y Custom.",
        ],
        primary: { label: "Conocer NODO Pro", href: "/suscripcion" },
      };
    default:
      return {
        eyebrow: "Novedad",
        title: "Modo vendedor para comercios",
        lead: "Los comercios en NODO Pro ahora cargan márgenes de venta y su equipo de ventas cotiza con el precio al público.",
        points: [
          "Los costos que les pasás no cambian: el margen es aparte.",
          "Los vendedores del comercio ven solo el precio de venta.",
        ],
        primary: { label: "Entendido" },
      };
  }
}

/** Mini-preview: costo → margen → venta, el concepto en una línea. */
function Preview() {
  return (
    <div className="relative mt-5 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-950/80 p-4" aria-hidden>
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/15 blur-2xl" />
      <div className="relative flex items-stretch gap-2.5">
        <div className="flex-1 rounded-lg border border-surface-800 bg-surface-900 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Costo</p>
          <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-surface-200">US$ 100</p>
          <p className="text-[10px] text-surface-500">lo que pagás</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
            +25 %
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <div className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.07] px-3 py-2.5 shadow-[0_0_24px_-8px_rgb(16_185_129/0.5)]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Venta</p>
          <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-white">US$ 125</p>
          <p className="text-[10px] text-emerald-300/70">lo que ve tu vendedor</p>
        </div>
      </div>
    </div>
  );
}

export default function SellerModeAnnouncement({
  audience,
  marginsHref,
  onClose,
}: {
  audience: SellerModeAudience;
  marginsHref: string;
  onClose: () => void;
}) {
  const copy = copyFor(audience, marginsHref);
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Foco atrapado dentro del aviso mientras está abierto.
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const primaryClass =
    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgb(16_185_129/0.8)] transition hover:bg-emerald-500 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-surface-700 bg-surface-900 shadow-2xl"
      >
        <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-brand-500" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-4 rounded-md p-1.5 text-surface-500 transition hover:bg-surface-800 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="max-h-[85dvh] overflow-y-auto px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Tag className="h-3.5 w-3.5" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">{copy.eyebrow}</span>
          </div>
          <h2 id={titleId} className="mt-3 pr-8 text-xl font-semibold tracking-tight text-white">
            {copy.title}
          </h2>
          <p id={descId} className="mt-1.5 text-sm leading-relaxed text-surface-300">
            {copy.lead}
          </p>

          <Preview />

          <ul className="mt-4 flex flex-col gap-2">
            {copy.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[13px] leading-snug text-surface-300">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
            {copy.primary.href && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg border border-surface-700 px-4 py-2.5 text-sm font-medium text-surface-300 transition hover:border-surface-500 hover:text-white"
              >
                Más tarde
              </button>
            )}
            {copy.primary.href ? (
              <Link
                href={copy.primary.href}
                onClick={onClose}
                ref={(el) => {
                  primaryRef.current = el;
                }}
                className={primaryClass}
              >
                {copy.primary.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={onClose}
                ref={(el) => {
                  primaryRef.current = el;
                }}
                className={primaryClass}
              >
                {copy.primary.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
