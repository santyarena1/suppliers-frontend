import { Reveal } from "./Reveal";

const STEPS = [
  {
    title: "Creá la cuenta",
    time: "2 minutos",
    body: "Ponés el nombre de tu comercio y entrás. Un recorrido con catálogo y pedidos de prueba te muestra todo antes de conectar nada.",
  },
  {
    title: "Conectá tus distribuidores",
    time: "1 minuto por cada uno",
    body: "Cargás el usuario de los portales que ya usás. NODO trae catálogo, precios y stock, y los mantiene al día solo. Si alguno te pasa la lista en Excel, la subís.",
  },
  {
    title: "Buscá y comprá",
    time: "Desde el primer día",
    body: "Buscás, comparás lo que te sale cada uno y confirmás. Sumá a tu equipo con los permisos que quieras: quién compra, quién aprueba, quién solo mira.",
  },
];

export function Steps() {
  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell">
        <Reveal>
          <h2 className="nl-h2 max-w-2xl">En una tarde lo tenés andando</h2>
        </Reveal>
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          <span
            className="absolute left-0 right-0 top-[19px] hidden h-px bg-gradient-to-r from-[var(--accent)] via-[rgb(139_127_255/0.4)] to-transparent md:block"
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 110}>
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[rgb(139_127_255/0.5)] bg-[var(--bg)] text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <h3 className="nl-h3 mt-6">{s.title}</h3>
                <p className="mt-1 text-sm font-medium text-[var(--accent-2)]">{s.time}</p>
                <p className="nl-body mt-3 max-w-sm">{s.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
