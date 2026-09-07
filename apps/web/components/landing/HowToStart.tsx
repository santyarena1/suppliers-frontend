"use client";

import { Reveal, SectionHead, Shell } from "./ui";

/** Acá el número no es adorno: la secuencia es la información. */
const STEPS = [
  {
    n: "01",
    t: "Creás tu cuenta",
    d: "Usuario, mail y contraseña. No pedimos tarjeta para empezar ni datos de tu contador.",
  },
  {
    n: "02",
    t: "Conectás tus distribuidores",
    d: "Con el código de acceso que te da tu vendedor, o cargando la planilla de precios que ya te manda por mail o WhatsApp. Los dos caminos valen.",
  },
  {
    n: "03",
    t: "NODO sincroniza y ordena",
    d: "Lee el catálogo, detecta la estructura de cada lista y deja precios, stock e impuestos al día. La siguiente lista del mismo proveedor entra sola, con el formato ya aprendido.",
  },
  {
    n: "04",
    t: "Buscás, comparás y comprás",
    d: "Una búsqueda sobre todos, el costo puesto de cada uno, el carrito partido por proveedor y el pedido con su historial.",
  },
];

export default function HowToStart() {
  return (
    <section id="empezar" className="relative py-24 sm:py-36">
      <Shell>
        <SectionHead
          title={<>Cómo<br />empezás</>}
          meta="04 · Puesta en marcha"
          lead="No hay migración ni integración de la que ocuparse. Lo más pesado, que es cargar la primera lista, lo hace el sistema."
        />

        <ol className="relative">
          {/* La línea que une la secuencia */}
          <div
            className="absolute left-[0.6rem] sm:left-[4.2rem] top-3 bottom-3 w-px"
            style={{ background: "var(--hair)" }}
            aria-hidden="true"
          />

          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 70} className="relative pl-8 sm:pl-32 pb-12 last:pb-0 group">
              {/* Marca de posición sobre la línea */}
              <span
                className="absolute left-0 sm:left-[3.6rem] top-2 w-[1.2rem] h-[1.2rem] rounded-full border flex items-center justify-center transition-colors duration-200"
                style={{ borderColor: "var(--hair-strong)", background: "var(--void)" }}
                aria-hidden="true"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full transition-colors duration-200"
                  style={{ background: i === 0 ? "var(--ember)" : "var(--fg-faint)" }}
                />
              </span>

              <span
                className="lnd-display hidden sm:block absolute left-0 top-0 text-[2.6rem] leading-none select-none"
                style={{ color: "var(--night)", fontVariationSettings: '"wdth" 70, "wght" 800' }}
                aria-hidden="true"
              >
                {s.n}
              </span>

              <h3 className="text-[1.05rem] font-semibold tracking-[-0.01em]">{s.t}</h3>
              <p className="lnd-body mt-2 text-[0.9rem]">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </Shell>
    </section>
  );
}
