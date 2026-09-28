"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Play } from "lucide-react";
import { useOnboarding } from "@/lib/onboarding";
import "./coach.css";

/**
 * Con la guía pausada queda esta píldora con el progreso. Abierta muestra la
 * lista de pasos: se puede retomar, saltar a cualquiera o dar el recorrido por
 * terminado.
 */
export default function OnboardingChecklist() {
  const { pending, paused, steps, index, go, resume, finish, busy } = useOnboarding();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!pending || !paused) return null;

  // El cierre no cuenta como tarea.
  const tasks = steps.filter((s) => s.kind !== "finish");
  const done = Math.min(index, tasks.length);
  const pct = tasks.length ? done / tasks.length : 0;

  return (
    <div className="nc-dock" ref={panelRef}>
      {open && (
        <div className="nc-list" role="dialog" aria-label="Primeros pasos">
          <div className="nc-list__head">
            <p className="nc-eyebrow">Primeros pasos</p>
            <p className="nc-list__count">
              {done} de {tasks.length}
            </p>
          </div>
          <ol className="nc-list__items">
            {tasks.map((s, i) => {
              const state = i < index ? "done" : i === index ? "current" : "todo";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`nc-list__item is-${state}`}
                    onClick={() => {
                      setOpen(false);
                      go(s.id);
                    }}
                  >
                    <span className="nc-list__mark" aria-hidden="true">
                      {state === "done" ? <Check className="nc-icon" /> : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="nc-list__label">{s.title}</span>
                    {state === "current" && <span className="nc-list__tag">Sigue</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="nc-list__foot">
            <button type="button" className="nc-btn nc-btn--text" onClick={() => void finish()} disabled={busy}>
              {busy ? <Loader2 className="nc-icon nc-spin" /> : null}
              No mostrar más
            </button>
            <button
              type="button"
              className="nc-btn nc-btn--primary"
              onClick={() => {
                setOpen(false);
                resume();
              }}
            >
              <Play className="nc-icon" /> Continuar
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="nc-pill"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Primeros pasos: ${done} de ${tasks.length}`}
      >
        <svg className="nc-pill__ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" className="nc-pill__track" />
          <circle cx="18" cy="18" r="15" className="nc-pill__fill" strokeDasharray={`${pct * 94.25} 94.25`} />
        </svg>
        <span className="nc-pill__text">
          Primeros pasos
          <em>
            {done}/{tasks.length}
          </em>
        </span>
        <ChevronDown className={`nc-icon nc-pill__chev${open ? " is-open" : ""}`} />
      </button>
    </div>
  );
}
