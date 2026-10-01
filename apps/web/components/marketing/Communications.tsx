"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, FileText, MessageSquare, Package, TrendingDown, UserCheck } from "lucide-react";
import { Reveal, useInView, usePrefersReducedMotion } from "./Reveal";
import { usd } from "./SearchDemo";

const FEED = [
  { icon: Check, tone: "text-[var(--good)]", title: "Tu pedido Nº 00741263 fue confirmado", meta: "Pedidos" },
  { icon: TrendingDown, tone: "text-[var(--good)]", title: "Bajó de precio un producto que seguís", meta: "Precios" },
  { icon: Package, tone: "text-[var(--accent-2)]", title: "Lanzamiento: llega la DDR5 de 32 GB el 20 de octubre", meta: "Novedades de marcas" },
  { icon: UserCheck, tone: "text-[var(--warn)]", title: "Martín armó un pedido de US$ 1.240 para aprobar", meta: "Tu equipo" },
  { icon: CalendarDays, tone: "text-[var(--accent-2)]", title: "Capacitación online, martes 13 a las 18 h", meta: "Eventos" },
  { icon: MessageSquare, tone: "text-[var(--fg-2)]", title: "Lucía, tu vendedora, te respondió", meta: "Chat" },
];

function Feed() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [count, setCount] = useState(FEED.length);

  useEffect(() => {
    if (reduced || !inView) return;
    setCount(1);
    const id = setInterval(() => setCount((c) => (c >= FEED.length ? 1 : c + 1)), 1700);
    return () => clearInterval(id);
  }, [reduced, inView]);

  const visible = FEED.slice(0, count).reverse();
  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      {visible.map((item) => (
        <div key={item.title} className="nl-anim-in flex items-start gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3">
          <item.icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${item.tone}`} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm leading-snug text-white">{item.title}</p>
            <p className="mt-0.5 text-xs text-[var(--fg-3)]">{item.meta}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const MONTHS = [
  { m: "Abr", v: 11.2 },
  { m: "May", v: 13.9 },
  { m: "Jun", v: 12.4 },
  { m: "Jul", v: 16.8 },
  { m: "Ago", v: 15.1 },
  { m: "Sep", v: 18.6 },
];

const ACCOUNTS = [
  { p: "Distribuidor 1", s: 2310.4, due: "vence 15/10" },
  { p: "Distribuidor 2", s: 884.0, due: "al día" },
  { p: "Distribuidor 3", s: 1462.75, due: "vence 22/10" },
];

/** Un módulo de NODO: qué es a la izquierda, cómo se ve a la derecha. */
function Module({
  index,
  total,
  title,
  text,
  children,
}: {
  index: number;
  total: number;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <article
      data-stack-card
      className="nl-stack-card sticky grid gap-5 rounded-[var(--r)] border border-[var(--line-2)] bg-[var(--surface)] p-5 shadow-[0_-18px_50px_-24px_rgb(4_4_20/0.95)] sm:p-7 md:grid-cols-[0.9fr_1.1fr] md:gap-8"
      style={{ ["--i" as string]: index } as React.CSSProperties}
    >
      <div className="flex flex-col">
        <span className="font-mono text-xs tabular-nums text-[var(--accent-2)]">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <h3 className="nl-h3 mt-3 text-white">{title}</h3>
        <p className="nl-body mt-2.5 text-[0.95rem]">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

/**
 * Las tarjetas se apilan al bajar: cada una se queda pegada debajo del menú y
 * la siguiente la tapa dejando ver el borde. Las de abajo se achican un poco y
 * se apagan, para que se lea como una pila. Con movimiento reducido queda solo
 * el apilado, sin escala.
 */
function useStackDepth(ref: React.RefObject<HTMLDivElement | null>, reduced: boolean) {
  useEffect(() => {
    const host = ref.current;
    if (!host || reduced) return;
    const cards = Array.from(host.querySelectorAll<HTMLElement>("[data-stack-card]"));
    let raf = 0;
    function update() {
      raf = 0;
      const tops = cards.map((c) => c.getBoundingClientRect().top);
      cards.forEach((card, i) => {
        // Cuánto la taparon las tarjetas que vienen después (1 = una entera).
        let covered = 0;
        for (let j = i + 1; j < cards.length; j++) {
          covered += Math.max(0, Math.min(1, 1 - (tops[j] - tops[i]) / card.offsetHeight));
        }
        card.style.transform = covered > 0 ? `scale(${1 - covered * 0.04})` : "";
        card.style.filter = covered > 0 ? `brightness(${1 - Math.min(0.45, covered * 0.15)})` : "";
      });
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      cards.forEach((c) => {
        c.style.transform = "";
        c.style.filter = "";
      });
    };
  }, [ref, reduced]);
}

const TOTAL = 5;

/** Lo que pasa alrededor de la compra: avisos, chat, aprobaciones, cuenta y análisis. */
export function Communications() {
  const maxMonth = Math.max(...MONTHS.map((x) => x.v));
  const reduced = usePrefersReducedMotion();
  const stackRef = useRef<HTMLDivElement | null>(null);
  useStackDepth(stackRef, reduced);

  return (
    <section className="nl-section nl-divider">
      <div className="nl-shell grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <h2 className="nl-h2">Te enterás de todo sin perseguir a nadie</h2>
            <p className="nl-lead mt-5">
              Confirmaciones de pedidos, bajas de precio, lanzamientos y capacitaciones de las marcas, mensajes de tus
              vendedores y pedidos de tu equipo para aprobar. Todo llega a NODO.
            </p>
          </Reveal>
        </div>

        <div ref={stackRef} className="flex flex-col gap-6 pb-4 sm:gap-8">
          <Module
            index={0}
            total={TOTAL}
            title="Notificaciones"
            text="Pedidos confirmados, bajas de precio, lanzamientos, eventos y mensajes, en un solo lugar."
          >
            <div className="h-[15.5rem] overflow-hidden sm:h-[17rem]">
              <Feed />
            </div>
          </Module>

          <Module
            index={1}
            total={TOTAL}
            title="Chat con tus vendedores"
            text="El historial queda en NODO, no en el teléfono de alguien."
          >
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="max-w-[88%] rounded-[12px] rounded-tl-sm bg-[var(--surface-2)] px-3.5 py-2.5 text-[var(--fg)]">
                <p className="text-xs font-semibold text-[var(--accent-2)]">Lucía · tu vendedora</p>
                <p className="mt-1">Te separé las 10 fuentes de 650 W. Entran el jueves.</p>
              </div>
              <div className="ml-auto max-w-[80%] rounded-[12px] rounded-tr-sm bg-[var(--accent)] px-3.5 py-2.5 text-white">
                Perfecto, sumalas al pedido de esta semana.
              </div>
            </div>
          </Module>

          <Module
            index={2}
            total={TOTAL}
            title="Tu equipo arma, vos aprobás"
            text="El pedido espera tu aprobación y, antes de enviarlo, ves el precio de hoy."
          >
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-2)] p-4">
              <p className="text-sm text-white">Pedido de Martín</p>
              <p className="mt-1 text-xs text-[var(--fg-3)]">14 productos · armado hoy 10:42</p>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="text-[var(--fg-2)]">Cuando lo armó</span>
                <span className="tabular-nums text-white">{usd(1240)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-sm">
                <span className="text-[var(--fg-2)]">Precio de hoy</span>
                <span className="tabular-nums text-[var(--good)]">{usd(1226.4)}</span>
              </div>
              <span className="nl-btn nl-btn--primary nl-btn--sm mt-4 w-full" aria-hidden>
                Aprobar y enviar
              </span>
            </div>
          </Module>

          <Module
            index={3}
            total={TOTAL}
            title="Cuánto y a quién le comprás"
            text="Por mes, por distribuidor y por producto, con tu ticket promedio."
          >
            <div className="flex h-36 gap-2.5" role="img" aria-label="Compras por mes, de abril a septiembre, en aumento">
              {MONTHS.map((x, i) => (
                <div key={x.m} className="flex h-full flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-[6px] ${i === MONTHS.length - 1 ? "bg-[var(--accent)]" : "bg-[rgb(139_127_255/0.3)]"}`}
                      style={{ height: `${(x.v / maxMonth) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--fg-3)]">{x.m}</span>
                </div>
              ))}
            </div>
          </Module>

          <Module
            index={4}
            total={TOTAL}
            title="Cuenta corriente y facturas"
            text="Saldos y comprobantes de cada portal, sin entrar a ninguno."
          >
            <ul className="flex flex-col gap-2.5 text-sm">
              {ACCOUNTS.map((a) => (
                <li key={a.p} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-white">
                    <FileText className="h-4 w-4 text-[var(--fg-3)]" aria-hidden /> {a.p}
                  </span>
                  <span className="text-right">
                    <span className="block tabular-nums text-white">{usd(a.s)}</span>
                    <span className="text-xs text-[var(--fg-3)]">{a.due}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Module>
        </div>
      </div>
    </section>
  );
}
