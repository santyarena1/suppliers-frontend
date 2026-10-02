"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { isOnStepPage, useOnboarding } from "@/lib/onboarding";
import { padRect, placeCard, type Placement, type Rect } from "./placement";
import "./coach.css";

const MOBILE = 640;

/** Mide el elemento del paso mientras exista; reintenta un rato porque las pantallas cargan datos. */
function useTargetRect(selector: string | null, enabled: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    setRect(null);
    if (!selector || !enabled) return;
    let tries = 0;
    let timer = 0;
    let frame = 0;
    let target: HTMLElement | null = null;
    let settle = 0;
    const observer = new ResizeObserver(() => onChange());

    const measure = () => {
      if (!target || !target.isConnected) {
        // El primero que se ve: en mobile, el panel de escritorio existe pero está oculto.
        target =
          (Array.from(document.querySelectorAll(selector)) as HTMLElement[]).find((el) => {
            const box = el.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          }) ?? null;
        if (target) {
          target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          // La pantalla sigue cargando datos y el elemento se mueve: se vuelve a
          // medir un rato y cada vez que cambia de tamaño.
          observer.observe(target);
          let ticks = 0;
          window.clearInterval(settle);
          let rescrolls = 0;
          settle = window.setInterval(() => {
            if (ticks++ > 40) window.clearInterval(settle);
            // Si la pantalla volvió arriba al terminar de cargar, se lo vuelve a mostrar.
            const r = target?.getBoundingClientRect();
            if (target && r && (r.top > window.innerHeight - 40 || r.bottom < 40) && rescrolls++ < 3) {
              target.scrollIntoView({ block: "center", inline: "nearest" });
            }
            onChange();
          }, 250);
        }
      }
      if (!target) {
        // Hasta ~15 s: hay pantallas que tardan en traer sus datos (estadísticas).
        if (tries++ < 100) timer = window.setTimeout(measure, 150);
        return;
      }
      const r = target.getBoundingClientRect();
      // Se ocultó o quedó vacío (otra vista del mismo dato): buscar el que se ve.
      if (r.width <= 1 || r.height <= 1) {
        target = null;
        if (tries++ < 100) timer = window.setTimeout(measure, 150);
        setRect(null);
        return;
      }
      setRect(r.width > 1 && r.height > 1 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    observer.observe(document.body);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(settle);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      observer.disconnect();
    };
  }, [selector, enabled]);

  return rect;
}

/**
 * Guía del recorrido. Resalta sin bloquear: el oscurecido deja pasar los clics,
 * así la persona puede usar la app, salir o volver a su sesión en cualquier
 * momento. La tarjeta se ubica con su tamaño real para no tapar lo señalado.
 */
export default function OnboardingCoach() {
  const pathname = usePathname();
  const { active, step, steps, index, next, back, pause, finish, go, busy, status } = useOnboarding();
  const { items } = useCart();
  const cardRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const [cardSize, setCardSize] = useState({ width: 340, height: 200 });
  const [placement, setPlacement] = useState<Placement | null>(null);
  const cartCountAtStep = useRef<number | null>(null);

  const onPage = isOnStepPage(step, pathname);
  const rect = useTargetRect(step?.spotlight ?? null, active && onPage);
  const isMobile = viewport.w < MOBILE;
  const hole = rect ? padRect(rect, viewport.w, viewport.h) : null;
  const centered = !step?.spotlight || step.kind === "finish";

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    if (size.width !== cardSize.width || size.height !== cardSize.height) setCardSize(size);
    setPlacement(placeCard(centered ? null : hole, size, viewport.w, viewport.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, hole?.top, hole?.left, hole?.width, hole?.height, viewport.w, viewport.h, centered, onPage]);

  // Pasos que se completan haciendo la acción: avanzan solos.
  const cartUnits = items.reduce((sum, item) => sum + item.qty, 0);
  useEffect(() => {
    if (step?.completeWhen !== "cart-has-items") {
      cartCountAtStep.current = null;
      return;
    }
    if (cartCountAtStep.current === null) cartCountAtStep.current = cartUnits;
    if (cartUnits > cartCountAtStep.current) next();
  }, [step?.id, step?.completeWhen, cartUnits, next]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]");
      if (event.key === "Escape") pause();
      if (typing) return;
      if (event.key === "ArrowRight" && step?.kind !== "finish" && !step?.completeWhen) next();
      if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step?.kind, step?.completeWhen, next, back, pause]);

  /** Cerrar el recorrido desde cualquier paso: lo marca terminado y saca los datos de ejemplo. */
  function exitTour() {
    if (!window.confirm("¿Salir del recorrido? Se sacan los datos de ejemplo. Lo podés volver a ver cuando quieras desde Inicio.")) return;
    void finish();
  }

  if (!active || !step) return null;

  const total = steps.length;
  const isFinish = step.kind === "finish";
  const waiting = step.completeWhen === "cart-has-items";
  const hero = centered && !isMobile;

  // Fuera de la pantalla del paso: un aviso chico que no se mete en el medio.
  if (!onPage) {
    return (
      <div className="nc nc--detached" role="status">
        <div className="nc-card nc-card--compact">
          <p className="nc-eyebrow">
            Primeros pasos · {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </p>
          <p className="nc-title nc-title--sm">{step.title}</p>
          <div className="nc-actions">
            <button type="button" className="nc-btn nc-btn--text" onClick={exitTour} disabled={busy}>
              Salir
            </button>
            <button type="button" className="nc-btn nc-btn--ghost" onClick={pause}>
              Pausar
            </button>
            <button type="button" className="nc-btn nc-btn--primary" onClick={() => go(step.id)}>
              Ir al paso <ArrowRight className="nc-icon" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = isMobile
    ? {}
    : placement
      ? { top: placement.top, left: placement.left }
      : { visibility: "hidden" };

  return (
    <div className="nc" data-mobile={isMobile ? "1" : undefined}>
      {hole && !centered ? (
        <>
          {/* Cuatro paneles alrededor del recorte. No capturan clics. */}
          <div className="nc-shade" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <div className="nc-shade" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <div className="nc-shade" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div className="nc-shade" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="nc-ring" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
        </>
      ) : (
        centered && <div className="nc-shade nc-shade--full" />
      )}

      <div
        ref={cardRef}
        key={step.id}
        className={`nc-card${hero ? " nc-card--hero" : ""}${isMobile ? " nc-card--sheet" : ""}`}
        style={cardStyle}
        role="dialog"
        aria-modal="false"
        aria-labelledby="nc-title"
        aria-describedby="nc-body"
      >
        <div className="nc-head">
          <p className="nc-eyebrow">
            {isFinish ? "Recorrido completo" : `Primeros pasos · ${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`}
          </p>
          <button type="button" className="nc-x" onClick={pause} aria-label="Pausar el recorrido (Esc)" title="Pausar (Esc)">
            <X className="nc-icon" />
          </button>
        </div>

        <ol className="nc-rail" aria-hidden="true">
          {steps.map((s, i) => (
            <li key={s.id} className={i < index ? "is-done" : i === index ? "is-current" : undefined} />
          ))}
        </ol>

        {isFinish && (
          <span className="nc-done-mark" aria-hidden="true">
            <Check className="nc-icon nc-icon--lg" />
          </span>
        )}
        <h2 id="nc-title" className="nc-title">
          {step.title}
        </h2>
        <p id="nc-body" className="nc-body">
          {step.body}
        </p>

        {step.id === "welcome" && status?.demo && (
          <ul className="nc-facts">
            {status.demo.distributors.map((d) => (
              <li key={d.providerKey}>{d.name}</li>
            ))}
            <li>{status.demo.productCount} productos de prueba</li>
            {status.tenant?.planLabel && <li>Plan {status.tenant.planLabel}</li>}
          </ul>
        )}

        {waiting && (
          <p className="nc-waiting" role="status">
            <span className="nc-dot" aria-hidden="true" /> Esperando que agregues un producto…
          </p>
        )}

        <div className="nc-actions">
          {index > 0 && !isFinish && (
            <button type="button" className="nc-btn nc-btn--ghost" onClick={back} aria-label="Paso anterior">
              <ArrowLeft className="nc-icon" />
            </button>
          )}
          {!isFinish && (
            <button type="button" className="nc-btn nc-btn--text" onClick={pause}>
              {index === 0 ? "Ahora no" : "Pausar"}
            </button>
          )}
          {!isFinish && (
            <button type="button" className="nc-btn nc-btn--text" onClick={exitTour} disabled={busy} title="Termina el recorrido y saca los datos de ejemplo">
              Salir del recorrido
            </button>
          )}
          <span className="nc-spacer" />
          {isFinish ? (
            <button type="button" className="nc-btn nc-btn--primary" onClick={() => void finish()} disabled={busy}>
              {busy ? <Loader2 className="nc-icon nc-spin" /> : <Check className="nc-icon" />}
              {step.ctaLabel}
            </button>
          ) : waiting ? (
            <button type="button" className="nc-btn nc-btn--ghost" onClick={next}>
              Saltar este paso
            </button>
          ) : (
            <button type="button" className="nc-btn nc-btn--primary" onClick={next} autoFocus>
              {step.ctaLabel}
              <ArrowRight className="nc-icon" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
