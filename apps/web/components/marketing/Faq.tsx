import { Reveal } from "./Reveal";

const QA = [
  {
    q: "¿Mis usuarios y claves de los portales están seguros?",
    a: "Se guardan cifrados (AES-256) y solo se usan para traer tu catálogo y hacer los pedidos que vos confirmás. Podés borrarlos cuando quieras.",
  },
  {
    q: "¿Compro con mi cuenta y mis condiciones?",
    a: "Sí. El pedido sale desde tu cuenta en cada distribuidor: tus precios, tus formas de pago y tu cuenta corriente. NODO no intermedia en la compra.",
  },
  {
    q: "¿Qué pasa si trabajo con un distribuidor que no está?",
    a: "Subís su lista de precios en Excel y aparece en la búsqueda como uno más. El pedido te queda armado para mandárselo por mensaje.",
  },
  {
    q: "¿Los precios y el stock están al día?",
    a: "NODO actualiza el catálogo de cada distribuidor automáticamente, y cada producto muestra cuándo se actualizó por última vez.",
  },
  {
    q: "¿Cuántos usuarios puedo tener?",
    a: "Los que necesites, en todos los planes. Cada uno con su rol: quién compra, quién aprueba y quién solo consulta.",
  },
  {
    q: "¿Puedo cambiar de plan?",
    a: "Cuando quieras, desde Plan y facturación dentro de tu cuenta. Empezás con Base y pasás a Pro el día que quieras comprar sin salir de NODO.",
  },
];

export function Faq() {
  return (
    <section id="preguntas" className="nl-section nl-divider scroll-mt-16">
      <div className="nl-shell grid gap-12 lg:grid-cols-[0.8fr_1.6fr]">
        <Reveal>
          <h2 className="nl-h2">Preguntas que nos hacen</h2>
        </Reveal>
        <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {QA.map((item, i) => (
            <Reveal key={item.q} delay={(i % 2) * 90}>
              <dt className="text-[1.05rem] font-semibold leading-snug text-white">{item.q}</dt>
              <dd className="nl-body mt-3">{item.a}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
