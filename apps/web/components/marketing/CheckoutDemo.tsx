"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MessageCircle, RotateCcw, ShoppingCart } from "lucide-react";
import { CART_GROUPS } from "@/lib/marketing-demo";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";
import { usd } from "./SearchDemo";

const PORTAL_STEPS = ["Entrando a tu cuenta", "Cargando el carrito", "Verificando precios y cantidades", "Pedido creado"];

function groupTotal(g: (typeof CART_GROUPS)[number]) {
  return g.lines.reduce((acc, l) => acc + l.qty * l.unit, 0);
}

/**
 * Un carrito con productos de varios distribuidores. Al confirmarlo, NODO
 * crea el pedido en el portal de cada uno (Pro) o deja listo el mensaje para
 * el que no tiene portal.
 */
export function CheckoutDemo() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [step, setStep] = useState(-1);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(PORTAL_STEPS.length);
      return;
    }
    if (!inView) return;
    setStep(-1);
    const timers = [
      setTimeout(() => setStep(0), 900),
      setTimeout(() => setStep(1), 1800),
      setTimeout(() => setStep(2), 2800),
      setTimeout(() => setStep(3), 3800),
      setTimeout(() => setStep(4), 4600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced, run]);

  const total = CART_GROUPS.reduce((acc, g) => acc + groupTotal(g), 0);
  const done = step >= PORTAL_STEPS.length;

  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Un carrito. Cada pedido llega a su distribuidor.</h2>
          <p className="nl-lead mt-5">
            Mezclás productos de distintos distribuidores y NODO arma un pedido por cada uno. Con los distribuidores
            integrados, el pedido se crea directo en su portal, con tu cuenta y tus condiciones. Con el resto, te deja el
            mensaje listo para mandar.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="mt-12 grid items-start gap-5 lg:grid-cols-[1fr_1.15fr]">
            <div className="nl-surface flex flex-col">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <ShoppingCart className="h-4 w-4 text-[var(--fg-3)]" aria-hidden /> Tu carrito
                </p>
                <span className="text-sm text-[var(--fg-3)]">{CART_GROUPS.length} distribuidores</span>
              </div>
              <div className="flex-1 divide-y divide-[var(--line)]">
                {CART_GROUPS.map((g) => (
                  <div key={g.provider} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{g.provider}</p>
                      <p className="text-sm tabular-nums text-[var(--fg-2)]">{usd(groupTotal(g))}</p>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1">
                      {g.lines.map((l) => (
                        <li key={l.name} className="flex justify-between gap-3 text-sm text-[var(--fg-2)]">
                          <span className="min-w-0 truncate">
                            {l.qty} × {l.name}
                          </span>
                          <span className="flex-shrink-0 whitespace-nowrap tabular-nums text-[var(--fg-3)]">{usd(l.unit)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-[var(--line)] px-5 py-4">
                <div>
                  <p className="text-xs text-[var(--fg-3)]">Total neto</p>
                  <p className="text-xl font-semibold tabular-nums text-white">{usd(total)}</p>
                </div>
                <span className={`nl-btn nl-btn--sm ${done ? "nl-btn--ghost" : "nl-btn--primary"}`} aria-hidden>
                  {step >= 0 && !done ? <Loader2 className="nl-spin h-4 w-4" /> : null}
                  {done ? "Pedidos enviados" : step >= 0 ? "Enviando" : `Confirmar ${CART_GROUPS.length} pedidos`}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {CART_GROUPS.map((g, gi) => (
                <div key={g.provider} className="nl-surface-2 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{g.provider}</p>
                    {g.mode === "portal" ? (
                      <span className="nl-chip nl-chip--accent">Pedido en su portal</span>
                    ) : (
                      <span className="nl-chip nl-chip--mute">Mensaje para el vendedor</span>
                    )}
                  </div>
                  {g.mode === "portal" ? (
                    <ol className="mt-3 flex flex-col gap-2">
                      {PORTAL_STEPS.map((label, si) => {
                        const state = step > si || done ? "done" : step === si ? "doing" : "todo";
                        const final = si === PORTAL_STEPS.length - 1;
                        return (
                          <li
                            key={label}
                            className={`flex items-center gap-2.5 text-sm transition-opacity ${state === "todo" ? "opacity-35" : ""}`}
                            style={{ transitionDelay: `${gi * 120}ms` }}
                          >
                            {state === "done" ? (
                              <Check className="h-4 w-4 text-[var(--good)]" aria-hidden />
                            ) : state === "doing" ? (
                              <Loader2 className="nl-spin h-4 w-4 text-[var(--accent-2)]" aria-hidden />
                            ) : (
                              <span className="h-4 w-4 rounded-full border border-[var(--line-2)]" aria-hidden />
                            )}
                            <span className={final && state === "done" ? "font-semibold text-white" : "text-[var(--fg-2)]"}>
                              {final && state === "done" ? `Pedido Nº ${g.orderNumber} creado en su portal` : label}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <div className={`mt-3 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-40"}`}>
                      <div className="rounded-[10px] rounded-tl-sm bg-[#153d2c] px-3.5 py-2.5 text-sm leading-relaxed text-[#d7f5e4]">
                        Hola, te paso el pedido de esta semana:
                        <br />
                        {g.lines.map((l) => (
                          <span key={l.name}>
                            {l.qty} × {l.name}
                            <br />
                          </span>
                        ))}
                        ¡Gracias!
                      </div>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--fg-3)]">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Listo para copiar o abrir en WhatsApp
                      </p>
                    </div>
                  )}
                </div>
              ))}
              {done && !reduced && (
                <button
                  type="button"
                  onClick={() => setRun((r) => r + 1)}
                  className="nl-anim-in inline-flex items-center gap-2 self-start rounded-lg px-2 py-1 text-sm text-[var(--fg-3)] hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Ver de nuevo
                </button>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
