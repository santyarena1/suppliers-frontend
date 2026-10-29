"use client";

import { useEffect, useRef } from "react";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";

/**
 * La demo en video (2:22, con música; arranca sin sonido y los textos van en la imagen). No baja
 * nada hasta acercarse; arranca sola al entrar en pantalla y se pausa al salir.
 * Con movimiento reducido no arranca sola.
 */
export function DemoVideo() {
  const { ref, inView } = useInView<HTMLDivElement>(0.45);
  const reduced = usePrefersReducedMotion();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (inView && !reduced) void v.play().catch(() => {});
    else if (!inView) v.pause();
  }, [inView, reduced]);

  return (
    <section id="como-funciona" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-3xl">Hoy, cotizar un producto es abrir cinco pestañas</h2>
          <p className="nl-lead mt-5">
            Portales, listas, WhatsApp y la calculadora para saber un precio final. Mirá en dos minutos cómo es lo
            mismo con NODO: buscás, comparás, armás el carrito, el pedido llega a cada distribuidor y armás la PC de tu
            cliente con el presupuesto en PDF. Y si tenés stock, cómo vendérselo a otros comercios.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          <div
            ref={ref}
            className="overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--bg-2)] shadow-[0_40px_100px_-40px_rgb(109_93_252/0.6)]"
          >
            <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-4 py-3" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[rgb(255_255_255/0.14)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[rgb(255_255_255/0.14)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[rgb(255_255_255/0.14)]" />
              <span className="ml-3 truncate text-xs text-[var(--fg-3)]">nodohub.app · demo</span>
            </div>
            <video
              ref={video}
              className="block aspect-video w-full bg-black"
              src="/landing/nodo-demo.mp4"
              poster="/landing/nodo-demo-poster.jpg"
              preload="none"
              muted
              playsInline
              controls
              aria-label="Demo de NODO: búsqueda, precio final, carrito, pedidos a cada distribuidor, armador de PC, presupuestos y vender en NODO"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
