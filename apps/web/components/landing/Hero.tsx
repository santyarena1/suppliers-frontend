"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import DataField, { FIELD_BEAT_MS, FIELD_CONVERGE_MS } from "./DataField";
import { Button, Shell } from "./ui";

const FACTS = [
  { k: "Conexión", v: "API · portal · planilla" },
  { k: "Precio", v: "neto + IVA + IIBB + percepciones" },
  { k: "Compra", v: "pedido al portal o mensaje listo" },
];

export default function Hero() {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLanded(true);
      return;
    }
    const t = setTimeout(() => setLanded(true), FIELD_BEAT_MS + FIELD_CONVERGE_MS * 0.66);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden pt-24 sm:pt-28 pb-14">
      <DataField />
      <div className="lnd-vignette" />

      <Shell className="relative z-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.2fr)] lg:gap-x-10 items-center">
          <div>
            <h1 className="lnd-display lnd-display--xl">
              Todos tus distribuidores
              <br />
              en una sola búsqueda
            </h1>

            <p className="lnd-body mt-6 sm:mt-7 text-[1.02rem]">
              Conectás una vez a cada proveedor. NODO unifica catálogo, stock y costo puesto —
              con IVA y percepciones — y deja el pedido armado sin saltar de portal en portal.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="#cuenta">Crear mi cuenta</Button>
              <Button href="#buscar" variant="ghost">
                Ver el sistema
              </Button>
            </div>

            <dl className="mt-10 grid sm:grid-cols-3 gap-x-6 gap-y-5 max-w-xl">
              {FACTS.map((f) => (
                <div key={f.k}>
                  <dt className="lnd-label">{f.k}</dt>
                  <dd className="mt-1.5 text-[0.78rem] leading-snug text-[var(--fg-dim)]">{f.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div
            className="lnd-shot lnd-shot--hero"
            style={{
              opacity: landed ? 1 : 0,
              transform: landed ? "none" : "translate3d(0, 12px, 0)",
              transition:
                "opacity 700ms cubic-bezier(0.23,1,0.32,1), transform 700ms cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <div className="lnd-shot__frame">
              <Image
                src="/static/landing/shots/search-grid.webp"
                alt="Buscador de NODO con resultados reales de varios distribuidores"
                width={2160}
                height={1350}
                className="lnd-shot__img"
                sizes="(max-width: 1024px) 100vw, 680px"
                priority
                unoptimized
              />
            </div>
            <p className="lnd-shot__cap">
              Pantalla real del buscador. Precios y nombres de distribuidores ocultos en la captura.
            </p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
