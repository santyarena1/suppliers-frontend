"use client";

import { Children, useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./Reveal";

/** Alto del menú fijo: las hojas se pegan justo debajo. */
const NAV_HEIGHT = 64;

/**
 * Las secciones de la landing como hojas que se apilan: al bajar, cada una sube
 * y tapa a la anterior, que se achica y se apaga debajo.
 *
 * Una sección más alta que la pantalla se pega recién cuando se terminó de ver
 * (su borde de abajo toca el de la pantalla): nada queda tapado sin leerse.
 * Con movimiento reducido se apilan igual, sin escala ni fundido: la tapada
 * solo se oculta.
 */
export function StackedSections({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const sheets = Array.from(host.querySelectorAll<HTMLElement>(":scope > [data-sheet]"));
    let raf = 0;

    function layout() {
      const vh = window.innerHeight;
      for (const sheet of sheets) {
        sheet.style.top = `${Math.min(NAV_HEIGHT, vh - sheet.offsetHeight)}px`;
      }
    }

    function depth() {
      raf = 0;
      const vh = window.innerHeight;
      sheets.forEach((sheet, i) => {
        const next = sheets[i + 1];
        if (!next) return;
        const nextTop = next.getBoundingClientRect().top;
        // 0 mientras la siguiente no asoma; 1 cuando ya la tapó entera.
        const covered = Math.max(0, Math.min(1, 1 - (nextTop - NAV_HEIGHT) / (vh - NAV_HEIGHT)));
        sheet.style.visibility = covered >= 0.99 ? "hidden" : "";
        if (reduced) return;
        sheet.style.transform = covered > 0 ? `scale(${1 - covered * 0.06})` : "";
        // Se apaga antes de quedar tapada del todo: debajo de una hoja translúcida
        // no tiene que leerse nada.
        sheet.style.opacity = covered > 0 ? String(Math.max(0, 1 - covered * 1.6)) : "";
      });
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(depth);
    }
    function onResize() {
      layout();
      onScroll();
    }

    layout();
    depth();
    const ro = new ResizeObserver(onResize);
    sheets.forEach((s) => ro.observe(s));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
      sheets.forEach((s) => {
        s.style.transform = "";
        s.style.opacity = "";
        s.style.visibility = "";
      });
    };
  }, [reduced]);

  return (
    <div ref={hostRef}>
      {Children.toArray(children).map((child, i) => (
        <div key={i} data-sheet className="nl-sheet" style={{ zIndex: i + 1 }}>
          {child}
        </div>
      ))}
    </div>
  );
}
