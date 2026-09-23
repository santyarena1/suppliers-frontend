"use client";

import { Reveal, SectionHead, Shell } from "./ui";

/** Acá el número no es adorno: la secuencia es la información. */
const STEPS = [
  {
    n: "01",
    t: "Creás tu cuenta",
    d: "Usuario, mail y contraseña. Nombrás tu comercio. No pedimos tarjeta ni datos de tu contador.",
  },
  {
    n: "02",
    t: "Te vinculamos los distribuidores",
    d: "NODO conecta los que ya usás. Hasta ese momento el recorrido es de práctica: dos distribuidores de ejemplo que después desaparecen.",
  },
  {
    n: "03",
    t: "Cargás la cuenta de cada portal",
    d: "En Proveedores, cada distribuidor pide el mismo usuario y la misma clave con los que entrás a su sitio. Con eso se ven tus precios y tu stock.",
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
          lead="Creás la cuenta, nombrás el comercio y recorrés la app con datos de práctica. Tus distribuidores reales los vincula NODO; después cargás la cuenta de cada portal."
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
