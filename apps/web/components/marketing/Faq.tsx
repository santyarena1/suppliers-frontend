"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

type Topic = "precios" | "compras" | "envio" | "cuenta";

const TOPICS: { key: Topic; label: string }[] = [
  { key: "precios", label: "Precios y stock" },
  { key: "compras", label: "Pedidos" },
  { key: "envio", label: "Envío" },
  { key: "cuenta", label: "Cuenta y planes" },
];

const QA: { topic: Topic; q: string; a: string }[] = [
  {
    topic: "precios",
    q: "¿Los precios y el stock están al día?",
    a: "NODO actualiza el catálogo de cada distribuidor automáticamente, y cada producto muestra cuándo se actualizó por última vez.",
  },
  {
    topic: "precios",
    q: "¿El precio incluye impuestos?",
    a: "Elegís cómo verlo: neto, con IVA, y con o sin las percepciones que te aplica cada distribuidor. En pesos o en dólares, con la cotización que prefieras.",
  },
  {
    topic: "precios",
    q: "¿Puedo ver precios offline o en esquema?",
    a: "Sí. En cada distribuidor cargás lo que te dijo tu vendedor y en la búsqueda prendés “Precios offline” o “Precios esquema” para comparar.",
  },
  {
    topic: "precios",
    q: "¿Qué pasa si trabajo con un distribuidor que no está?",
    a: "Subís su lista de precios en Excel y aparece en la búsqueda como uno más. El pedido te queda armado para mandárselo por mensaje.",
  },
  {
    topic: "compras",
    q: "¿Compro con mi cuenta y mis condiciones?",
    a: "Sí. El pedido sale desde tu cuenta en cada distribuidor: tus precios, tus formas de pago y tu cuenta corriente. NODO no intermedia en la compra.",
  },
  {
    topic: "compras",
    q: "¿Puedo hacer que alguien apruebe los pedidos?",
    a: "Sí. Un vendedor arma el carrito y el pedido queda esperando hasta que lo aprueba el dueño. Antes de aprobar se puede ver el precio de hoy.",
  },
  {
    topic: "compras",
    q: "¿Mis usuarios y claves de los portales están seguros?",
    a: "Se guardan cifrados (AES-256) y solo se usan para traer tu catálogo y hacer los pedidos que vos confirmás. Podés borrarlos cuando quieras.",
  },
  {
    topic: "envio",
    q: "¿Cómo funciona el envío estimado?",
    a: "NODO mira tus pedidos y aprende cómo te llega lo de cada distribuidor y cuánto te costó. Si a uno siempre le pedís moto y la moto sale $12.000, cada producto de ese distribuidor muestra su parte del envío, y baja a medida que sumás cosas al carrito: con 8 unidades, $1.500 cada una.",
  },
  {
    topic: "envio",
    q: "¿Y si el distribuidor no informa el costo del envío?",
    a: "Cargás tus formas de envío con su valor (moto, expreso, comisionista) y marcás cuál usás siempre. También elegís si se reparte por unidades, por valor o una vez por pedido.",
  },
  {
    topic: "envio",
    q: "¿El envío se suma al precio?",
    a: "Si prendés “Incluir envío”, sí: el precio y el orden de la búsqueda lo tienen en cuenta. Si no, queda debajo del precio como referencia. Siempre es aproximado: el costo final lo da el distribuidor al confirmar.",
  },
  {
    topic: "cuenta",
    q: "¿Cuántos usuarios puedo tener?",
    a: "Los que necesites, en todos los planes. Cada uno con su rol: quién compra, quién aprueba y quién solo consulta.",
  },
  {
    topic: "cuenta",
    q: "¿Tengo que instalar algo?",
    a: "No. NODO funciona en el navegador, en la computadora o en el celular. Entrás con tu usuario y listo.",
  },
  {
    topic: "cuenta",
    q: "¿Puedo cambiar de plan?",
    a: "Cuando quieras, desde Plan y facturación dentro de tu cuenta. Empezás con Base y pasás a Pro el día que quieras comprar sin salir de NODO.",
  },
];

/**
 * Preguntas agrupadas por tema. A la izquierda los temas (filtran la lista) y
 * la salida a probar; a la derecha la lista numerada, todo abierto: nada
 * escondido detrás de un acordeón.
 */
export function Faq() {
  const [topic, setTopic] = useState<Topic | "all">("all");
  const shown = topic === "all" ? QA : QA.filter((item) => item.topic === topic);

  return (
    <section id="preguntas" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell grid gap-12 lg:grid-cols-[0.85fr_1.6fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <p className="nl-kicker">Preguntas</p>
            <h2 className="nl-h2 mt-3">Lo que nos preguntan antes de empezar</h2>
            <p className="nl-body mt-5 max-w-[40ch]">
              Precios, pedidos, envío y cuenta. Si tu duda no está, la respondemos cuando lo probás.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="mt-8 flex flex-wrap gap-2 lg:flex-col lg:items-stretch" role="tablist" aria-label="Temas">
              {[{ key: "all" as const, label: "Todas" }, ...TOPICS].map((t) => {
                const count = t.key === "all" ? QA.length : QA.filter((item) => item.topic === t.key).length;
                const active = topic === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTopic(t.key)}
                    className={`flex items-center justify-between gap-4 rounded-[10px] border px-4 py-2.5 text-left text-sm transition-colors duration-200 ${
                      active
                        ? "border-[rgb(139_127_255/0.45)] bg-[var(--accent-soft)] text-white"
                        : "border-[var(--line)] text-[var(--fg-2)] hover:border-[var(--line-2)] hover:text-white"
                    }`}
                  >
                    {t.label}
                    <span className={`font-mono text-xs tabular-nums ${active ? "text-[var(--accent-2)]" : "text-[var(--fg-3)]"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Reveal>

          <Reveal delay={140} className="hidden lg:block">
            <a href="#probar" className="nl-btn nl-btn--ghost mt-8">
              Probar NODO <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </Reveal>
        </div>

        <dl className="border-t border-[var(--line)]" role="tabpanel">
          {shown.map((item, i) => (
            <div
              key={item.q}
              className="nl-anim-in grid grid-cols-[2.25rem_1fr] gap-x-3 border-b border-[var(--line)] py-6 sm:grid-cols-[3rem_1fr] sm:gap-x-6 sm:py-7"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="pt-1 font-mono text-sm tabular-nums text-[var(--accent-2)]" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <dt className="text-[1.1rem] font-semibold leading-snug text-white">{item.q}</dt>
                <dd className="nl-body mt-2.5 max-w-[62ch]">{item.a}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
